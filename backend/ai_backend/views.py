from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAdminUser
from auth_app.models import UserProfile

class AdminStatsView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        total_patients = UserProfile.objects.count()
        active_patients = UserProfile.objects.filter(is_online=True).count()
        pending_approvals = UserProfile.objects.filter(is_approved=False).count()

        return Response({
            "totalPatients": total_patients,
            "activePatients": active_patients,
            "pendingApprovals": pending_approvals,
        })

class PatientListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        patients = UserProfile.objects.all()
        patient_data = [
            {
                "id": patient.id,
                "name": patient.name,
                "email": patient.email,
                "status": "Pending" if not patient.is_approved else "Blocked" if patient.is_blocked else "Active",
                "is_online": patient.is_online,
            }
            for patient in patients
        ]
        return Response(patient_data)
