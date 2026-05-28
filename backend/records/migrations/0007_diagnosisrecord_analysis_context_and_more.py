from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("records", "0006_diagnosisrecord_doctor_confirmed_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="diagnosisrecord",
            name="analysis_context",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="diagnosisrecord",
            name="input_modalities",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="diagnosisrecord",
            name="uploaded_file_names",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
