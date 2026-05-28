from django.db import models
from django.contrib.auth.models import User

class DiagnosisRecord(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    symptoms = models.TextField()
    analysis_context = models.TextField(blank=True, default="")
    input_modalities = models.JSONField(blank=True, default=list)
    uploaded_file_names = models.JSONField(blank=True, default=list)
    result = models.TextField()
    severity = models.TextField(null=True, blank=True)
    report_text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    # Add these fields to persist AI analysis
    possible_conditions = models.JSONField(null=True, blank=True)
    recommended_medications = models.JSONField(null=True, blank=True)
    recommended_tests = models.JSONField(null=True, blank=True)
    precautions = models.JSONField(null=True, blank=True)
    diet_recommendations = models.JSONField(null=True, blank=True)
    specialist_consultation = models.TextField(null=True, blank=True)
    recovery_timeline =  models.TextField(null=True, blank=True)
    urgency = models.TextField(null=True, blank=True)
    doctor_confirmed = models.BooleanField(default=False)
    doctor_final_diagnosis = models.TextField(null=True, blank=True)
    final_tests = models.JSONField(null=True, blank=True)
    final_medications = models.JSONField(null=True, blank=True)
    # Medical Intelligence Layer
    # -----------------------------

    medical_features = models.JSONField(
        default=dict,
        blank=True
    )

    risk_score = models.IntegerField(
        default=0
    )

    risk_alerts = models.JSONField(
        default=list,
        blank=True
    )

    doctor_training_payload = models.JSONField(
        default=dict,
        blank=True
    )

    diagnosis_source = models.CharField(
        max_length=50,
        default="gpt"
    )
