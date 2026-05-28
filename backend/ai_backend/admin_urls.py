from django.urls import path
from .views import AdminStatsView, PatientListView

urlpatterns = [
    path('stats/', AdminStatsView.as_view(), name='admin-stats'),
    path('patients/', PatientListView.as_view(), name='patient-list'),
]
