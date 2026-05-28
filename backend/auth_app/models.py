from django.db import models
from django.contrib.auth.models import User
from django.dispatch import receiver
from django.db.models.signals import post_save


class Specialization(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def save(self, *args, **kwargs):
        self.name = self.name.strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name.title()


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    age = models.IntegerField(null=True, blank=True)
    gender = models.CharField(max_length=10, null=True, blank=True)
    phone = models.CharField(max_length=15, null=True, blank=True)
    address = models.CharField(max_length=255, null=True, blank=True)

    height = models.FloatField(null=True, blank=True)
    weight = models.FloatField(null=True, blank=True)
    blood_type = models.CharField(max_length=5, null=True, blank=True)
    emergency_contacts = models.JSONField(default=list, blank=True)

    profile_picture = models.ImageField(upload_to='profiles/', null=True, blank=True)

    is_online = models.BooleanField(default=False)
    is_approved = models.BooleanField(default=False)
    is_blocked = models.BooleanField(default=False)
    consultation_fee = models.FloatField(default=0)

    role = models.CharField(
        max_length=10,
        choices=[('patient', 'Patient'), ('doctor', 'Doctor')],
        default='patient'
    )

    specialization = models.ForeignKey(
        Specialization,
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

    experience = models.IntegerField(null=True, blank=True)
    bank_account_number = models.CharField(max_length=30, null=True, blank=True)
    ifsc_code = models.CharField(max_length=20, null=True, blank=True)
    account_holder_name = models.CharField(max_length=100, null=True, blank=True)
    bank_name = models.CharField(max_length=100, null=True, blank=True)
    upi_qr = models.ImageField(upload_to='upi_qr/', null=True, blank=True)
    health_score = models.PositiveSmallIntegerField(null=True, blank=True)
    health_score_inputs = models.JSONField(default=dict, blank=True)
    health_score_summary = models.TextField(null=True, blank=True)
    health_score_updated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.user.username

    class Meta:
        indexes = [
            models.Index(fields=["role"]),
            models.Index(fields=["is_approved"]),
        ]


# 🔥 MULTIPLE DOCUMENT SUPPORT
class DoctorDocument(models.Model):
    doctor = models.ForeignKey(UserProfile, on_delete=models.CASCADE, related_name="documents_list")
    file = models.FileField(upload_to='doctor_docs/')

    def __str__(self):
        return f"{self.doctor.user.username} document"


@receiver(post_save, sender=User)
def create_or_update_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        instance.userprofile.save()

class Appointment(models.Model):
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
    ]

    patient = models.ForeignKey(User, on_delete=models.CASCADE)
    doctor = models.ForeignKey(UserProfile, on_delete=models.CASCADE)

    date = models.DateField()
    time = models.TimeField()

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    fee = models.FloatField()
    is_paid = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    razorpay_order_id = models.CharField(max_length=255, null=True, blank=True)
    razorpay_payment_id = models.CharField(max_length=255, null=True, blank=True)
    razorpay_signature = models.CharField(max_length=255, null=True, blank=True)

    service_charge = models.FloatField(default=100)
    doctor_payable = models.FloatField(default=0)

    is_refunded = models.BooleanField(default=False)
    refund_id = models.CharField(max_length=255, null=True, blank=True)
    is_doctor_settled = models.BooleanField(default=False)
    reminder_sent = models.BooleanField(default=False)


class DoctorAvailability(models.Model):
    doctor = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="busy_slots"
    )

    date = models.DateField()

    start_time = models.TimeField()
    end_time = models.TimeField()

    is_busy = models.BooleanField(default=True)

    class Meta:
        unique_together = ("doctor", "date", "start_time", "end_time")

    def __str__(self):
        return (
            f"{self.doctor.user.first_name} - "
            f"{self.date} {self.start_time} to {self.end_time}"
        )


