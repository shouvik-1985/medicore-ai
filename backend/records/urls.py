from django.urls import path
from .views import RecordListCreateView, RecordDetailView, ConfirmDiagnosisView

urlpatterns = [
    path("", RecordListCreateView.as_view()),
    path("confirm/<int:pk>/", ConfirmDiagnosisView.as_view()),
    path("<int:pk>/", RecordDetailView.as_view(), name="record-detail"),
]
