from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.cache import cache

from auth_app.tasks import retrain_models_task
from diagnosis.language_utils import get_language_config, translate_text_blocks
from .models import DiagnosisRecord
from .serializers import DiagnosisRecordSerializer


class RecordListCreateView(generics.ListCreateAPIView):
    serializer_class = DiagnosisRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        cache_key = (
            f"user_records_{user.id}"
        )

        records = cache.get(
            cache_key
        )

        if records is None:

            records = list(
                DiagnosisRecord.objects.filter(
                    user=user
                ).order_by("-id")
            )

            cache.set(
                cache_key,
                records,
                timeout=300
            )  # 5 min cache

        return records

    def perform_create(self, serializer):
        serializer.save(
            user=self.request.user
        )

        cache.delete(
            f"user_records_{self.request.user.id}"
        )


class RecordDetailView(generics.RetrieveDestroyAPIView):
    queryset = DiagnosisRecord.objects.all()
    serializer_class = DiagnosisRecordSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DiagnosisRecord.objects.filter(user=self.request.user)


class ConfirmDiagnosisView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        if request.user.userprofile.role != "doctor":
            return Response({"error": "Only doctors allowed"}, status=403)

        diagnosis = request.data.get("final_diagnosis")
        if not diagnosis:
            return Response({"error": "final_diagnosis required"}, status=400)

        try:
            record = DiagnosisRecord.objects.get(id=pk)
        except DiagnosisRecord.DoesNotExist:
            return Response({"error": "Record not found"}, status=404)

        response_language = get_language_config(request.data.get("response_language", "en"))
        final_tests = request.data.get("final_tests", record.recommended_tests)
        final_medications = request.data.get("final_medications", record.recommended_medications)

        if response_language["code"] != "en":
            translation_input = [diagnosis]
            translation_input.extend(str(item or "") for item in (final_tests or []))
            translation_input.extend(str(item or "") for item in (final_medications or []))

            translated_values = translate_text_blocks(translation_input, "en", mode="internal")
            if translated_values:
                diagnosis = translated_values[0] or diagnosis
                test_count = len(final_tests or [])
                medication_count = len(final_medications or [])

                translated_tests = translated_values[1:1 + test_count]
                translated_meds = translated_values[1 + test_count:1 + test_count + medication_count]

                if len(translated_tests) == test_count:
                    final_tests = translated_tests
                if len(translated_meds) == medication_count:
                    final_medications = translated_meds

        record.doctor_confirmed = True
        record.doctor_final_diagnosis = diagnosis
        record.final_tests = final_tests
        record.final_medications = final_medications

        record.doctor_training_payload = {
            "symptoms": record.symptoms,
            "analysis_context": record.analysis_context,
            "medical_features": record.medical_features,
            "risk_score": record.risk_score,
            "risk_alerts": record.risk_alerts,
            "doctor_final_diagnosis": diagnosis,
            "final_tests": record.final_tests,
            "final_medications": record.final_medications,
            "urgency": record.urgency,
            "doctor_confirmed": True,
            "diagnosis_source": record.diagnosis_source,
        }

        record.save()
        print("Saved:", record.doctor_confirmed)

        count = DiagnosisRecord.objects.filter(doctor_confirmed=True).count()
        if count >= 5 and count % 5 == 0:
            print(f"Triggering background training at {count}")
            retrain_models_task.delay()

        return Response({
            "message": "Diagnosis confirmed",
            "trained_cases": count,
        })
