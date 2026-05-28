from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, DoctorDocument, DoctorAvailability  # Assuming profile model is extended via OneToOne
import re

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    age = serializers.IntegerField(required=False)
    gender = serializers.ChoiceField(choices=[('male', 'Male'), ('female', 'Female')], required=False)
    phone = serializers.CharField(required=False)

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'password', 'age', 'gender', 'phone']

    def create(self, validated_data):
        age = validated_data.pop('age', None)
        gender = validated_data.pop('gender', None)
        phone = validated_data.pop('phone', None)
        user = User.objects.create_user(
            username=validated_data['email'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            password=validated_data['password']
        )
        UserProfile.objects.create(user=user, age=age, gender=gender, phone=phone)
        return user
    
class UserProfileSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField(read_only=True)
    email = serializers.SerializerMethodField(read_only=True)

    first_name = serializers.CharField(source='user.first_name', required=False)
    last_name = serializers.CharField(source='user.last_name', required=False)
    upi_qr = serializers.SerializerMethodField()
    emergency_contacts = serializers.JSONField(required=False)


    class Meta:
        model = UserProfile
        fields = [
            'name',
            'email',
            'first_name',
            'last_name',

            'phone',
            'gender',
            'age',
            'address',
            'height',
            'weight',
            'blood_type',
            'emergency_contacts',
            'profile_picture',

            "consultation_fee",
            "experience",
            "account_holder_name",
            "bank_name",
            "bank_account_number",
            "ifsc_code",
            "upi_qr",
            "health_score",
            "health_score_inputs",
            "health_score_summary",
            "health_score_updated_at",
        ]
        read_only_fields = [
            "health_score",
            "health_score_inputs",
            "health_score_summary",
            "health_score_updated_at",
        ]

    def get_upi_qr(self, obj):
        if obj.upi_qr:
            return obj.upi_qr.url   
        return None

    def get_name(self, obj):
        return f"{obj.user.first_name} {obj.user.last_name}".strip()

    def get_email(self, obj):
        return obj.user.email or obj.user.username

    def validate_emergency_contacts(self, value):
        if value in (None, ""):
            return []

        if not isinstance(value, list):
            raise serializers.ValidationError("Emergency contacts must be a list.")

        cleaned_contacts = []

        for contact in value:
            if not isinstance(contact, dict):
                raise serializers.ValidationError("Each emergency contact must be an object.")

            name = str(contact.get("name", "")).strip()
            relation = str(contact.get("relation", "")).strip()
            phone = str(contact.get("phone", "")).strip()

            if not any([name, relation, phone]):
                continue

            if not phone:
                raise serializers.ValidationError("Each emergency contact must include a phone number.")

            cleaned_contacts.append(
                {
                    "name": name,
                    "relation": relation,
                    "phone": phone,
                }
            )

        return cleaned_contacts

    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user = instance.user

        if "first_name" in user_data:
            user.first_name = user_data["first_name"]

        if "last_name" in user_data:
            user.last_name = user_data["last_name"]

        user.save()

        return super().update(instance, validated_data)


class HealthScoreAssessmentSerializer(serializers.Serializer):
    blood_pressure = serializers.CharField(max_length=20)
    oxygen_level = serializers.IntegerField(min_value=1, max_value=100)
    heart_rate = serializers.IntegerField(min_value=1, max_value=250)
    water_intake = serializers.FloatField(min_value=0.1)
    foot_steps = serializers.IntegerField(min_value=0, required=False, allow_null=True)

    def validate_blood_pressure(self, value):
        normalized = str(value or "").strip()

        if not re.match(r"^\d{2,3}\s*/\s*\d{2,3}$", normalized):
            raise serializers.ValidationError("Blood pressure must be in systolic/diastolic format, e.g. 120/80.")

        return normalized.replace(" ", "")
    
class DoctorDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorDocument
        fields = ["file"]


class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorAvailability
        fields = "__all__"
