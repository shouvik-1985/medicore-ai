from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from google.oauth2 import id_token
from google.auth.transport import requests
from .models import UserProfile, Appointment  # Assuming UserProfile is the extended profile model
from django.conf import settings
import logging
import json
import re
from openai import OpenAI
from .serializers import (
    UserProfileSerializer,
    DoctorDocumentSerializer,
    DoctorAvailabilitySerializer,
    HealthScoreAssessmentSerializer,
)
from .models import Specialization, DoctorDocument, DoctorAvailability
from django.core.mail import send_mail
from django.shortcuts import get_object_or_404
from django.db.models import Sum
from django.db.models.functions import TruncDate
from .tasks import send_payment_email
import razorpay
from django.utils import timezone
from utils.ocr import extract_text_from_image
from utils.ai_verifier import analyze_medical_document

client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)
openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)

logger = logging.getLogger(__name__)


def _extract_json_payload(text):
    if not text:
        return None

    cleaned = str(text).strip()
    fenced_match = re.search(r"```json\s*(\{.*?\})\s*```", cleaned, re.DOTALL)

    if fenced_match:
        cleaned = fenced_match.group(1)
    else:
        object_match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if object_match:
            cleaned = object_match.group(1)

    try:
        return json.loads(cleaned)
    except Exception:
        return None


def _generate_health_score(profile, validated_data):
    profile_context = {
        "age": profile.age,
        "gender": profile.gender,
        "height": profile.height,
        "weight": profile.weight,
    }

    prompt = f"""
You are a careful wellness scoring assistant.

Assess the patient's current daily health inputs and return a health score from 0 to 100.
- Score normal, healthy vitals and hydration higher.
- Penalize abnormal vitals more than low activity.
- Foot steps are optional and should not heavily affect the score if missing.
- This is a wellness score, not a diagnosis.

Patient profile context:
{json.dumps(profile_context)}

Current health inputs:
{json.dumps(validated_data)}

Return strict JSON only in this format:
{{
  "health_score": 0,
  "summary": "1-2 short sentences under 220 characters."
}}
"""

    response = openai_client.chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {
                "role": "system",
                "content": "Return only valid JSON for wellness scoring requests."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2
    )

    parsed = _extract_json_payload(response.choices[0].message.content)
    if not parsed or "health_score" not in parsed:
        raise ValueError("Health score response was not valid JSON.")

    health_score = max(0, min(100, int(parsed.get("health_score", 0))))
    summary = str(parsed.get("summary") or "").strip()

    return {
        "health_score": health_score,
        "summary": summary,
    }

class SpecializationListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        specializations = Specialization.objects.all().order_by("name")
        data = [{"name": s.name} for s in specializations]
        return Response(data)

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data

        username = data.get("username")
        password = data.get("password")
        role = data.get("role", "patient")

        if not username or not password:
            return Response({"error": "Username and password required"}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({"error": "User already exists"}, status=400)

        # Create user
        user = User.objects.create_user(
            username=username,
            email=username,
            password=password,
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", "")
        )

        # 🔥 Handle specialization (IMPORTANT)
        specialization_name = data.get("field")
        specialization_obj = None

        if role == "doctor" and specialization_name:
            specialization_name = specialization_name.strip().title()

            specialization_obj, _ = Specialization.objects.get_or_create(
                name__iexact=specialization_name,
                defaults={"name": specialization_name}
            )

        # Create profile
        profile = user.userprofile  # already created by signal
        profile.age = data.get("age")
        profile.gender = data.get("gender")
        profile.phone = data.get("phone")
        profile.address = data.get("address")
        profile.role = role
        profile.specialization = specialization_obj
        profile.experience = data.get("experience")

        # 🔥 doctor approval logic
        if role == "doctor":
            profile.is_approved = False
        else:
            profile.is_approved = True

        print("FILES:", request.FILES)

        profile.save()

        # 🔥 SAVE DOCTOR DOCUMENTS 
        if role == "doctor":
            files = request.FILES.getlist('documents')

            for file in files:
                DoctorDocument.objects.create(
                    doctor=profile,
                    file=file
                )

        return Response({"message": "User registered successfully"})
    

class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(username=username, password=password)

        if user is None:
            return Response({"error": "Invalid credentials"}, status=401)

        # ✅ 🔥 ADMIN CHECK 
        if user.is_superuser:
            refresh = RefreshToken.for_user(user)

            return Response({
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "role": "admin",   # 🔥 VERY IMPORTANT
                "name": user.username,
            })

        # 👇 normal users (patient/doctor)
        profile = user.userprofile

        # 🚨 Doctor approval check
        if profile.role == "doctor" and not profile.is_approved:
            return Response({"error": "Doctor not approved yet"}, status=403)
        
        if profile.role == "doctor" and profile.is_blocked:
            return Response({"error": "You are blocked by admin"}, status=403)

        refresh = RefreshToken.for_user(user)

        return Response({
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "role": profile.role,
            "name": user.first_name,
        })

class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("id_token")

        if not token:
            return Response(
                {"error": "ID token is required"},
                status=400
            )

        try:
            idinfo = id_token.verify_oauth2_token(
                token,
                requests.Request(),
                settings.GOOGLE_CLIENT_ID
            )

            email = idinfo.get("email")
            name = idinfo.get("name", "")

            if not email:
                return Response(
                    {"error": "No email found"},
                    status=400
                )

            # create user if needed
            user, created = User.objects.get_or_create(
                username=email,
                defaults={
                    "email": email,
                    "first_name": name
                }
            )

            # update existing user name
            if not created and name and not user.first_name:
                user.first_name = name
                user.save()

            # 🔥 CRITICAL FIX
            profile, _ = UserProfile.objects.get_or_create(
                user=user
            )

            # ensure google users become patients
            if not profile.role:
                profile.role = "patient"

            profile.is_approved = True
            profile.save()

            refresh = RefreshToken.for_user(user)

            return Response({
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "role": profile.role,
                "name": user.first_name,
                "user": {
                    "username": user.username,
                    "name": user.first_name,
                }
            })

        except ValueError as e:
            logger.error(
                f"Google token verification failed: {str(e)}"
            )

            return Response(
                {
                    "error": "Invalid Google token",
                    "details": str(e)
                },
                status=400
            )

class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile)
        return Response(serializer.data)

    def put(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = UserProfileSerializer(profile, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


class PatientHealthScoreView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)

        if profile.role != "patient":
            return Response({"error": "Only patients can use health score assessment."}, status=403)

        serializer = HealthScoreAssessmentSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        validated_data = serializer.validated_data
        health_inputs = {
            "blood_pressure": validated_data["blood_pressure"],
            "oxygen_level": validated_data["oxygen_level"],
            "heart_rate": validated_data["heart_rate"],
            "water_intake": validated_data["water_intake"],
            "foot_steps": validated_data.get("foot_steps"),
        }

        try:
            result = _generate_health_score(profile, health_inputs)
        except Exception as exc:
            logger.exception("Health score generation failed for user %s", request.user.id)
            return Response(
                {"error": "Health score assessment is temporarily unavailable."},
                status=503
            )

        profile.health_score = result["health_score"]
        profile.health_score_inputs = health_inputs
        profile.health_score_summary = result["summary"]
        profile.health_score_updated_at = timezone.now()
        profile.save(
            update_fields=[
                "health_score",
                "health_score_inputs",
                "health_score_summary",
                "health_score_updated_at",
            ]
        )

        return Response({
            "health_score": profile.health_score,
            "health_score_inputs": profile.health_score_inputs,
            "health_score_summary": profile.health_score_summary,
            "health_score_updated_at": (
                profile.health_score_updated_at.isoformat()
                if profile.health_score_updated_at else None
            ),
        })
    
class AdminStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        total_patients = UserProfile.objects.filter(role="patient").count()
        total_doctors = UserProfile.objects.filter(role="doctor").count()
        approved_doctors = UserProfile.objects.filter(role="doctor", is_approved=True).count()

        return Response({
            "totalPatients": total_patients,
            "totalDoctors": total_doctors,
            "approvedDoctors": approved_doctors,
        })
    
class AdminDoctorListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        doctors = UserProfile.objects.filter(role="doctor")

        data = []
        for doc in doctors:
            documents = DoctorDocument.objects.filter(doctor=doc)
            documents_data = DoctorDocumentSerializer(documents, many=True).data

            data.append({
                "id": doc.id,
                "name": f"{doc.user.first_name} {doc.user.last_name}",
                "email": doc.user.username,
                "specialization": doc.specialization.name if doc.specialization else "",
                "consultation_fee": doc.consultation_fee,
                "experience": doc.experience,
                "is_approved": doc.is_approved,
                "is_blocked": doc.is_blocked,

                # new bank fields
                "account_holder_name": doc.account_holder_name,
                "bank_name": doc.bank_name,
                "bank_account_number": doc.bank_account_number,
                "ifsc_code": doc.ifsc_code,

                "documents": documents_data,
            })

        return Response(data)
    
class AdminDoctorActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        action = request.data.get("action")

        doctor = UserProfile.objects.get(id=pk)

        if action == "approve":
            doctor.is_approved = True

        elif action == "block":
            doctor.is_blocked = True

        elif action == "unblock":
            doctor.is_blocked = False
        
        elif action == "reject":
            doctor.user.delete()
            return Response({"message": "Doctor rejected and deleted"})

        doctor.save()

        return Response({"message": "Updated"})
    
class AdminDeletePatientView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        profile = UserProfile.objects.get(id=pk)

        if profile.role != "patient":
            return Response({"error": "Not a patient"}, status=400)

        profile.user.delete()

        return Response({"message": "Deleted"})
    
class AdminPatientListView(APIView):
    permission_classes = [IsAuthenticated]


    def get(self, request):
        patients = UserProfile.objects.filter(role="patient")

        data = []
        for p in patients:
            data.append({
                "id": p.id,
                "name": f"{p.user.first_name} {p.user.last_name}",
                "email": p.user.username,
                "age": p.age,
                "gender": p.gender,
                "address": p.address,
                "status": "Active" if not p.is_blocked else "Blocked",
                "lastVisit": "N/A",
                "consultations": 0,
            })

        return Response(data)
    
class CreateAppointmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        doctor_id = request.data.get("doctor_id")
        date = request.data.get("date")
        time = request.data.get("time")

        doctor = UserProfile.objects.get(id=doctor_id)

        # doctor manually blocked?
        busy_exists = DoctorAvailability.objects.filter(
            doctor=doctor,
            date=date,
            time=time
        ).exists()

        if busy_exists:
            return Response(
                {"error": "Doctor is busy at this time. Select another slot."},
                status=400
            )

        # already booked?
        already_booked = Appointment.objects.filter(
            doctor=doctor,
            date=date,
            time=time,
            status__in=["pending", "approved"]
        ).exists()

        if already_booked:
            return Response(
                {"error": "This slot is already booked."},
                status=400
            )

        appointment = Appointment.objects.create(
            patient=request.user,
            doctor=doctor,
            date=date,
            time=time,
            fee=doctor.consultation_fee
        )

        send_payment_email.delay(
            request.user.username,
            doctor.user.first_name,
            date,
            time
        )

        return Response({"message": "Appointment requested"})
    
class DoctorAppointmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        doctor_profile = request.user.userprofile

        appointments = Appointment.objects.filter(doctor=doctor_profile)

        data = []
        for a in appointments:
            data.append({
                "id": a.id,
                "patient": a.patient.first_name,
                "date": a.date,
                "time": a.time,
                "status": a.status,
                "fee": a.fee,
                "is_paid": a.is_paid
            })

        return Response(data)
    
class AppointmentActionView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        action = request.data.get("action")

        # ✅ safe fetch
        appt = get_object_or_404(Appointment, id=pk)

        # ✅ ensure only doctor can act
        if request.user.userprofile != appt.doctor:
            return Response({"error": "Not allowed"}, status=403)

        if action == "approve":
            appt.status = "approved"

            # 🔥 EMAIL
            try:
                send_mail(
                    "Appointment Confirmed",
                    f"Your appointment is confirmed for {appt.date} at {appt.time}",
                    settings.EMAIL_HOST_USER,
                    [appt.patient.username],
                    fail_silently=True,
                )
            except Exception as e:
                print("Email error:", e)

        elif action == "reject":
            appt.status = "rejected"

        else:
            return Response({"error": "Invalid action"}, status=400)

        appt.save()

        return Response({
            "message": "Updated",
            "status": appt.status  # 🔥 important
        }, status=200)
    
class PatientAppointmentsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        appointments = Appointment.objects.filter(patient=request.user)

        data = []
        for a in appointments:
            data.append({
                "id": a.id,
                "doctor": a.doctor.user.first_name,
                "date": a.date,
                "time": a.time,
                "status": a.status,
                "fee": a.fee
            })

        return Response(data)
    
class DeleteAppointmentView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            appt = Appointment.objects.get(id=pk, patient=request.user)
            appt.delete()
            return Response({"message": "Deleted successfully"})
        except Appointment.DoesNotExist:
            return Response({"error": "Not found"}, status=404)
        

class CreateRazorpayOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        doctor_id = request.data.get("doctor_id")
        date = request.data.get("date")
        time = request.data.get("time")

        try:
            doctor = UserProfile.objects.get(id=doctor_id)
        except:
            return Response({"error": "Doctor not found"}, status=404)

        # 🔥 busy slot check
        is_busy = DoctorAvailability.objects.filter(
            doctor=doctor,
            date=date,
            start_time__lte=time,
            end_time__gte=time
        ).exists()

        if is_busy:
            return Response(
                {"error": "Doctor unavailable at this slot"},
                status=400
            )

        doctor_fee = doctor.consultation_fee or 0
        service_charge = 100
        total_amount = doctor_fee + service_charge

        client = razorpay.Client(
            auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
        )

        order = client.order.create({
            "amount": int(total_amount * 100),
            "currency": "INR",
            "payment_capture": 1
        })

        return Response({
            "order_id": order["id"],
            "amount": total_amount,
            "doctor_fee": doctor_fee,
            "service_charge": service_charge,
            "razorpay_key": settings.RAZORPAY_KEY_ID
        })

class VerifyPaymentAndBookView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        doctor_id = request.data.get("doctor_id")
        date = request.data.get("date")
        time = request.data.get("time")

        razorpay_payment_id = request.data.get("razorpay_payment_id")
        razorpay_order_id = request.data.get("razorpay_order_id")
        razorpay_signature = request.data.get("razorpay_signature")

        try:
            doctor = UserProfile.objects.get(id=doctor_id)

            # 🔥 busy slot check again
            is_busy = DoctorAvailability.objects.filter(
                doctor=doctor,
                date=date,
                start_time__lte=time,
                end_time__gte=time
            ).exists()

            if is_busy:
                return Response(
                    {"error": "Doctor unavailable at this slot"},
                    status=400
                )

            appt = Appointment.objects.create(
                patient=request.user,
                doctor=doctor,
                date=date,
                time=time,
                fee=doctor.consultation_fee,
                is_paid=True,
                status="approved",
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
                razorpay_signature=razorpay_signature,
                service_charge=100,
                doctor_payable=doctor.consultation_fee,
            )

            send_payment_email.delay(
                request.user.email,
                doctor.user.first_name,
                date,
                time
            )

            return Response({"message": "Payment successful. Booking created."})

        except Exception as e:
            return Response({"error": str(e)}, status=400)
        

class DoctorBusySlotView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        doctor_id = request.GET.get("doctor_id")

# ✅ Doctor dashboard using own slots
        if request.user.userprofile.role == "doctor" and not doctor_id:
            doctor = request.user.userprofile

        # ✅ Patient dashboard fetching selected doctor's slots
        else:
            if not doctor_id:
                return Response(
                    {"error": "doctor_id required"},
                    status=400
                )

            try:
                doctor = UserProfile.objects.get(
                    id=doctor_id,
                    role="doctor"
                )
            except UserProfile.DoesNotExist:
                return Response(
                    {"error": "Doctor not found"},
                    status=404
                )

        today = timezone.localdate()
        now_time = timezone.localtime().time()

        DoctorAvailability.objects.filter(
            doctor=doctor,
            date__lt=today
        ).delete()

        DoctorAvailability.objects.filter(
            doctor=doctor,
            date=today,
            end_time__lt=now_time
        ).delete()

        slots = DoctorAvailability.objects.filter(
            doctor=doctor
        ).order_by("date", "start_time")

        serializer = DoctorAvailabilitySerializer(slots, many=True)

        return Response(serializer.data)

    def post(self, request):
        doctor = request.user.userprofile

        serializer = DoctorAvailabilitySerializer(data={
            "doctor": doctor.id,
            "date": request.data.get("date"),
            "start_time": request.data.get("start_time"),
            "end_time": request.data.get("end_time"),
        })

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)

        return Response(serializer.errors, status=400)
    
class DeleteBusySlotView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        doctor = request.user.userprofile

        try:
            slot = DoctorAvailability.objects.get(id=pk, doctor=doctor)
            slot.delete()
            return Response({"message": "Deleted"})
        except DoctorAvailability.DoesNotExist:
            return Response({"error": "Slot not found"}, status=404)
        

class AdminDoctorPayoutListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Unauthorized"}, status=403)

        doctors = UserProfile.objects.filter(role="doctor")

        data = []

        for doctor in doctors:
            appointments = Appointment.objects.filter(
                doctor=doctor,
                status="approved",
                is_paid=True,
                is_doctor_settled=False
            )

            total_cases = appointments.count()

            total_fee = sum(a.fee for a in appointments)
            total_service = sum(a.service_charge for a in appointments)
            doctor_payable = sum(a.doctor_payable for a in appointments)

            # show only doctors with pending payout
            if total_cases > 0:
                data.append({
                    "doctor_id": doctor.id,
                    "doctor_name": f"{doctor.user.first_name} {doctor.user.last_name}",

                    "bank_name": doctor.bank_name,
                    "account_holder_name": doctor.account_holder_name,
                    "account_number": doctor.bank_account_number,
                    "ifsc_code": doctor.ifsc_code,

                    "appointments": total_cases,
                    "total_fee": total_fee,
                    "service_charge": total_service,
                    "doctor_payable": doctor_payable,
                    "upi_qr": request.build_absolute_uri(doctor.upi_qr.url) if doctor.upi_qr else None,
                })

        return Response(data)
    
class AdminPayDoctorView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, doctor_id):
        if not request.user.is_staff:
            return Response({"error": "Unauthorized"}, status=403)

        doctor = UserProfile.objects.get(id=doctor_id)

        appointments = Appointment.objects.filter(
            doctor=doctor,
            status="approved",
            is_paid=True,
            is_doctor_settled=False
        )

        total_amount = sum(a.doctor_payable for a in appointments)

        if total_amount <= 0:
            return Response({"message": "No payout pending"})

        # ✅ MANUAL PAYMENT DONE OUTSIDE (UPI/BANK)

        appointments.update(is_doctor_settled=True)

        return Response({
            "message": f"Marked ₹{total_amount} as paid manually"
        })

    
class AdminPayAllDoctorsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_staff:
            return Response({"error": "Unauthorized"}, status=403)

        doctors = UserProfile.objects.filter(role="doctor")

        results = []

        for doctor in doctors:
            appointments = Appointment.objects.filter(
                doctor=doctor,
                status="approved",
                is_paid=True,
                is_doctor_settled=False
            )

            total_amount = sum(a.doctor_payable for a in appointments)

            if total_amount <= 0:
                continue

            # ✅ Manual payout
            appointments.update(is_doctor_settled=True)

            results.append({
                "doctor": doctor.user.first_name,
                "amount": total_amount,
                "status": "marked as paid"
            })

        return Response(results)
    

class DoctorIncomeGraphView(APIView):
    authentication_classes = [JWTAuthentication] 
    permission_classes = [IsAuthenticated]

    def get(self, request):
        doctor = request.user.userprofile

        data = (
            Appointment.objects.filter(
                doctor=doctor,
                #status="approved",
                is_paid=True
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(total=Sum("doctor_payable"))
            .order_by("day")
        )
        print("DOCTOR GRAPH RAW:", list(data))
        return Response([
        {
            "date": d["day"].strftime("%d-%m-%Y"),
            "income": float(d["total"])
        }
        for d in data
    ])
    
class AdminIncomeGraphView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Unauthorized"}, status=403)

        data = (
            Appointment.objects.filter(
                is_paid=True
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(total=Sum("service_charge"))   # ✅ ALL DOCTORS TOTAL
            .order_by("day")
        )

        formatted = [
            {
                "date": d["day"].strftime("%d-%m-%Y"),
                "income": d["total"] or 0
            }
            for d in data
        ]
        print("GRAPH DATA:", formatted)

        return Response(formatted)
    

# views.py

class AnalyzeDoctorDocuments(APIView):
    def post(self, request, doctor_id):
        doctor = UserProfile.objects.get(id=doctor_id)

        docs = doctor.documents_list.all()

        all_text = ""

        for doc in docs:
            if doc:
                text = extract_text_from_image(doc.file.path)
                all_text += "\n" + text

        ai_result = analyze_medical_document(all_text)

        # Decide label
        confidence = ai_result.get("confidence", 0)
        issues = ai_result.get("issues", [])

        if confidence > 80 and len(issues) == 0:
            verdict = "genuine"
        elif confidence > 50:
            verdict = "suspicious"
        else:
            verdict = "fake"

        return Response({
            "verdict": verdict,
            "confidence": confidence,
            "issues": issues,
            "data": ai_result
        })
    
