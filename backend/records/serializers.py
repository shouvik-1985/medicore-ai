from rest_framework import serializers
from .models import DiagnosisRecord

class DiagnosisRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiagnosisRecord
        fields = '__all__'
        read_only_fields = ['user']  # ✅ prevent 'user is required' error