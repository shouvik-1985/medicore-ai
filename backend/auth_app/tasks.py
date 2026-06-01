from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
# from diagnosis.ml_model import train_clinical_model, build_faiss_index, train_model
# from diagnosis.dl_model import train_dl_model
from django.utils import timezone
from auth_app.models import Appointment
from django.utils.timezone import localdate
from auth_app.models import DoctorAvailability

@shared_task
def send_payment_email(email, doctor, date, time):
    send_mail(
        "Payment Successful 💰",
        f"""
Payment received successfully.

Doctor: {doctor}
Date: {date}
Time: {time}
        """,
        settings.EMAIL_HOST_USER,
        [email],
    )


@shared_task
def send_approval_email(email, doctor, date, time):
    send_mail(
        "Appointment Approved ✅",
        f"""
Your appointment is approved.

Doctor: {doctor}
Date: {date}
Time: {time}
        """,
        settings.EMAIL_HOST_USER,
        [email],
    )


@shared_task
def send_reminder_email(email, time):
    send_mail(
        "Appointment Reminder ⏰",
        f"Reminder: Your appointment is today at {time}",
        settings.EMAIL_HOST_USER,
        [email],
    )

@shared_task
def check_and_send_reminders():
    now = timezone.now()

    today = localdate()

    upcoming = Appointment.objects.filter(
        status="approved",
        reminder_sent=False,
        date=today,
    )

    for appointment in upcoming:
        try:
            send_reminder_email.delay(
                appointment.patient.email,
                appointment.time
            )

            appointment.reminder_sent = True
            appointment.save()

            print(f"✅ Reminder sent to {appointment.patient.email}")

        except Exception as e:
            print("❌ Reminder failed:", e)

@shared_task
def retrain_models_task():
    print("🔥 Background training started...")

    try:
        import requests
        requests.post(
            "http://localhost:8001/train"
        )

        print("✅ Background training completed")

    except Exception as e:
        print("❌ Background training failed:", e)

@shared_task
def cleanup_expired_busy_slots():
    today = timezone.localdate()
    now_time = timezone.localtime().time()

    deleted_old = DoctorAvailability.objects.filter(
        date__lt=today
    ).delete()

    deleted_today = DoctorAvailability.objects.filter(
        date=today,
        end_time__lt=now_time
    ).delete()

    print("🧹 Expired busy slots cleaned")