from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("auth_app", "0002_userprofile_emergency_contacts"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="health_score",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="health_score_inputs",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="health_score_summary",
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="health_score_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
