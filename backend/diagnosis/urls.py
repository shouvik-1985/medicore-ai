from django.urls import path
from .views import DiagnosisView, GenerateDiagnosisPDFView

urlpatterns = [
    path("analyze/", DiagnosisView.as_view(), name="analyze"),
    path("generate-pdf/", GenerateDiagnosisPDFView.as_view()),
]
