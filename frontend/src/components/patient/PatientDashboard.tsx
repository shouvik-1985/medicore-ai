import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Brain,
  ArrowRight,
  BadgeCheck,
  BriefcaseMedical,
  CalendarDays,
  CircleAlert,
  FileText,
  LogOut,
  User,
  Clock,
  Heart,
  Activity,
  Download,
  Calendar,
  Shield,
  Loader2,
  Stethoscope,
  CheckCircle2,
  CreditCard,
  X,
} from "lucide-react";
import SymptomAnalyzer from "./SymptomAnalyzer";
import PatientProfile from "./PatientProfile";
import axios from "axios";
import { toast } from "sonner";
import { API_URL } from "@/lib/api";

interface PatientDashboardProps {
  onLogout: () => void;
}

interface Condition {
  name: string;
  severity: string;
  confidence: number;
}

interface AnalysisResult {
  diagnosis: string;
  severity: string;
  report_text: string;
  possible_conditions: Condition[];
  recommended_medications: string[];
  recommended_tests: string[];
  precautions: string[];
  diet_recommendations: string[];
  specialist_consultation: string;
  recovery_timeline: string;
  urgency: string;
  ml_prediction?: string;
  dl_prediction?: string;
}


interface PatientData {
  name: string;
  email: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  height: string;
  weight: string;
  bloodType: string;
  emergencyContacts: Array<{
    name: string;
    relation: string;
    phone: string;
  }>;
}

interface StoredHealthScoreInputs {
  blood_pressure?: string;
  oxygen_level?: number;
  heart_rate?: number;
  water_intake?: number;
  foot_steps?: number | null;
}

interface HealthScoreFormState {
  bloodPressure: string;
  oxygenLevel: string;
  heartRate: string;
  waterIntake: string;
  footSteps: string;
}

interface RawUserProfile extends Omit<PatientData, "bloodType" | "emergencyContacts"> {
  blood_type: string;
  emergency_contacts?: Array<{
    name?: string;
    relation?: string;
    phone?: string;
  }>;
  health_score?: number | null;
  health_score_inputs?: StoredHealthScoreInputs | null;
  health_score_summary?: string | null;
  health_score_updated_at?: string | null;
}

const emptyHealthScoreForm: HealthScoreFormState = {
  bloodPressure: "",
  oxygenLevel: "",
  heartRate: "",
  waterIntake: "",
  footSteps: "",
};

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return now >= exp;
  } catch (e) {
    return true;
  }
}

const getDiagnosisTitle = (diagnosis: any) =>
  diagnosis.diagnosis ||
  diagnosis.result ||
  diagnosis.possible_conditions?.[0]?.name ||
  "Unknown";

const getDiagnosisSeverity = (diagnosis: any) =>
  diagnosis.severity ||
  diagnosis.possible_conditions?.[0]?.severity ||
  "Unknown";

const getDiagnosisUrgency = (diagnosis: any) =>
  diagnosis.urgency ||
  getDiagnosisSeverity(diagnosis);

const getDiagnosisUrgencyKeyword = (diagnosis: any) => {
  const urgencyText = String(getDiagnosisUrgency(diagnosis) || "").toLowerCase();

  if (
    urgencyText.includes("urgent") ||
    urgencyText.includes("emergency") ||
    urgencyText.includes("same-day") ||
    urgencyText.includes("high")
  ) {
    return "Urgent";
  }

  if (urgencyText.includes("moderate") || urgencyText.includes("medium")) {
    return "Moderate";
  }

  if (urgencyText.includes("low") || urgencyText.includes("mild")) {
    return "Low";
  }

  const severity = String(getDiagnosisSeverity(diagnosis) || "").trim();
  return severity && severity !== "Unknown" ? severity : "Review";
};

const getDoctorInitials = (name?: string) =>
  String(name || "Doctor")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "DR";

const formatConsultationFee = (fee: any) =>
  fee || fee === 0 ? `Rs. ${fee}` : "Fee not set";

const formatDoctorExperience = (experience: any) =>
  experience || experience === 0 ? `${experience} years experience` : "Experience not added";

const formatDoctorSpecialization = (specialization?: string) =>
  String(specialization || "").trim() || "General Medicine";

const formatBookingSlotLabel = (selectedDate?: string, selectedTime?: string) => {
  if (!selectedDate || !selectedTime) return "";

  const slot = new Date(`${selectedDate}T${selectedTime}`);
  if (Number.isNaN(slot.getTime())) {
    return `${selectedDate} at ${selectedTime}`;
  }

  return slot.toLocaleString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getUrgencyBadgeVariant = (urgency: string) => {
  const normalizedUrgency = String(urgency || "").toLowerCase();
  return normalizedUrgency === "low" || normalizedUrgency === "mild"
    ? "secondary"
    : "destructive";
};

const mapHealthScoreInputsToForm = (
  inputs?: StoredHealthScoreInputs | null
): HealthScoreFormState => ({
  bloodPressure: inputs?.blood_pressure || "",
  oxygenLevel: inputs?.oxygen_level?.toString() || "",
  heartRate: inputs?.heart_rate?.toString() || "",
  waterIntake: inputs?.water_intake?.toString() || "",
  footSteps: inputs?.foot_steps?.toString() || "",
});

const PatientDashboard = ({ onLogout }: PatientDashboardProps) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [patientData, setPatientData] = useState<PatientData | null>(null);
  const [recentDiagnoses, setRecentDiagnoses] = useState<any[]>([]);
  const [showHealthScorePanel, setShowHealthScorePanel] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthScoreSummary, setHealthScoreSummary] = useState("");
  const [healthScoreUpdatedAt, setHealthScoreUpdatedAt] = useState<string | null>(null);
  const [healthScoreLoading, setHealthScoreLoading] = useState(false);
  const [healthScoreForm, setHealthScoreForm] = useState<HealthScoreFormState>(emptyHealthScoreForm);

  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busySlots, setBusySlots] = useState<any[]>([]);

  const [appointments, setAppointments] = useState<any[]>([]);
  const [showAppointmentsModal, setShowAppointmentsModal] = useState(false);

  const closeBookingSheet = () => {
    setSelectedDoctor(null);
    setDate("");
    setTime("");
    setBusySlots([]);
  };

  const openDoctorBooking = async (doctor: any) => {
    try {
      const res = await axios.get(
        `${API_URL}/api/auth/doctor-busy-slots/?doctor_id=${doctor.id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      setBusySlots(res.data);
      setDate("");
      setTime("");
      setSelectedDoctor(doctor);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load doctor availability");
    }
  };

  useEffect(() => {
    const fetchData = async () => {

      const token = localStorage.getItem("access_token");

      if (!token || isTokenExpired(token)) {
        toast.error("Session expired. Please log in again.");
        onLogout(); // Or redirect to login page
        return;
      }

      try {
        const profileResponse = await axios.get(
          `${API_URL}/api/auth/profile/`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("access_token")}`
            }
          }
        );

        const recordsResponse = await axios.get<any[]>(
          `${API_URL}/api/records/`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("access_token")}`
            }
          }
        );

        const profile = profileResponse.data as RawUserProfile;
        setPatientData({
          name: profile.name,
          email: profile.email,
          age: profile.age,
          gender: profile.gender,
          phone: profile.phone,
          address: profile.address,
          height: profile.height,
          weight: profile.weight,
          bloodType: profile.blood_type, // conversion from snake_case to camelCase
          emergencyContacts: (profile.emergency_contacts || []).map((contact) => ({
            name: contact.name || "",
            relation: contact.relation || "",
            phone: contact.phone || "",
          })),
        });

        setHealthScore(profile.health_score ?? null);
        setHealthScoreSummary(profile.health_score_summary || "");
        setHealthScoreUpdatedAt(profile.health_score_updated_at || null);
        setHealthScoreForm(mapHealthScoreInputsToForm(profile.health_score_inputs));

        setRecentDiagnoses(recordsResponse.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to fetch patient data");
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
  const fetchDoctors = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/auth/admin/doctors/`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      console.log("DOCTORS API:", res.data);

      const approvedDoctors = res.data.filter(
        (doc: any) => doc.is_approved && !doc.is_blocked
      );

      setDoctors(approvedDoctors);
    } catch (err) {
      console.log(err);
    }
  };

  fetchDoctors();
}, []);

useEffect(() => {
  const fetchAppointments = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/auth/appointments/patient/`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      setAppointments(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  fetchAppointments();
}, []);

 const downloadDiagnosisPDF = async (diagnosis: any) => {
        try {
          const formattedData = {
            diagnosis: getDiagnosisTitle(diagnosis),
            symptoms: diagnosis.symptoms || "",
            severity: getDiagnosisSeverity(diagnosis),
            status: diagnosis.status || "Completed",
            recovery_timeline: diagnosis.recovery_timeline || "",
            urgency: getDiagnosisUrgency(diagnosis),
            specialist_consultation: diagnosis.specialist_consultation || "",
            possible_conditions: diagnosis.possible_conditions || [],
            recommended_medications: diagnosis.recommended_medications || [],
            recommended_tests: diagnosis.recommended_tests || [],
            precautions: diagnosis.precautions || [],
            diet_recommendations: diagnosis.diet_recommendations || []
          };

          const response = await axios.post<Blob>(
            `${API_URL}/api/diagnosis/generate-pdf/`,
            formattedData,
            {
              responseType: "blob",
              headers: {
                "Authorization": `Bearer ${localStorage.getItem("access_token")}`,
                "Content-Type": "application/json"
              }
            }
          );

          const url = window.URL.createObjectURL(response.data);

          const a = document.createElement("a");
          const fileName = formattedData.diagnosis.replace(/\s+/g, "_") + "_report.pdf";
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();

          toast.success("PDF report downloaded!");
        } catch (error) {
          console.error(error);
          toast.error("Failed to download report.");
        }
      };

      // Add a function to delete a diagnosis
const deleteDiagnosis = async (diagnosisId: string) => {
  try {
    const token = localStorage.getItem("access_token");
    if (!token || isTokenExpired(token)) {
      toast.error("Session expired. Please log in again.");
      onLogout();
      return;
    }

    await axios.delete(`${API_URL}/api/records/${diagnosisId}/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    setRecentDiagnoses((prevDiagnoses) =>
      prevDiagnoses.filter((diagnosis) => diagnosis.id !== diagnosisId)
    );

    toast.success("Report deleted successfully.");
  } catch (error) {
    console.error(error);
    toast.error("Failed to delete the report.");
  }
};

const convertToMinutes = (value: string) => {
  const parts = value.split(":");

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  return hours * 60 + minutes;
};

const isSlotBusy = () => {
  return busySlots.some((slot: any) => {
    if (String(slot.date) !== String(date)) {
      return false;
    }

    const selectedMinutes = convertToMinutes(time);

    const startMinutes = convertToMinutes(slot.start_time);

    const endMinutes = convertToMinutes(slot.end_time);

    return (
      selectedMinutes >= startMinutes &&
      selectedMinutes < endMinutes
    );
  });
};

const handleRazorpayBooking = async () => {
  try {
    if (!selectedDoctor || !date || !time) {
      toast.error("Please select date and time");
      return;
    }
    if (isSlotBusy()) {
      toast.error("Doctor is unavailable at this time");
      return;
    }

    const token = localStorage.getItem("access_token");

    // STEP 1: create order
    const orderRes = await axios.post(
      `${API_URL}/api/auth/create-order/`,
      {
        doctor_id: selectedDoctor.id,
        date: date,
        time: time,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = orderRes.data;

    const options = {
      key: data.razorpay_key,
      amount: data.amount * 100,
      currency: "INR",
      name: "MediCore AI",
      description: "Doctor Appointment Booking",
      order_id: data.order_id,

      handler: async function (response: any) {
        try {
          await axios.post(
            `${API_URL}/api/auth/verify-payment/`,
            {
              doctor_id: selectedDoctor.id,
              date,
              time,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          toast.success("Payment successful. Appointment booked.");

          closeBookingSheet();

        } catch {
          toast.error("Booking failed after payment");
        }
      },

      prefill: {
        name: patientData?.name || "",
        email: patientData?.email || "",
      },

      theme: {
        color: "#2563eb",
      },
    };

    const razorpay = new (window as any).Razorpay(options);
    razorpay.open();

  } catch (error) {
    console.error(error);
     const backendMessage =
      error?.response?.data?.error ||
      error?.response?.data?.message;

  toast.error(backendMessage || "Payment failed");
}
};

const upcomingAppointments = appointments
  .filter(a => a.status === "approved")
  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const nextCheckup = upcomingAppointments[0];
const selectedDayBusySlots = date
  ? busySlots.filter((slot: any) => String(slot.date).trim() === String(date).trim())
  : [];
const selectedSlotBusy = Boolean(date && time && isSlotBusy());
const selectedSlotLabel = formatBookingSlotLabel(date, time);

const handleProfileUpdate = (updatedProfile: PatientData) => {
  setPatientData(updatedProfile);
};

const handleHealthScoreFieldChange = (
  field: keyof HealthScoreFormState,
  value: string
) => {
  setHealthScoreForm((prev) => ({
    ...prev,
    [field]: value,
  }));
};

const handleHealthScoreSubmit = async () => {
  const token = localStorage.getItem("access_token");

  if (!token || isTokenExpired(token)) {
    toast.error("Session expired. Please log in again.");
    onLogout();
    return;
  }

  if (
    !healthScoreForm.bloodPressure.trim() ||
    !healthScoreForm.oxygenLevel.trim() ||
    !healthScoreForm.heartRate.trim() ||
    !healthScoreForm.waterIntake.trim()
  ) {
    toast.error("Please enter blood pressure, oxygen level, heart rate, and water intake.");
    return;
  }

  setHealthScoreLoading(true);
  try {
    const payload = {
      blood_pressure: healthScoreForm.bloodPressure.trim(),
      oxygen_level: Number(healthScoreForm.oxygenLevel),
      heart_rate: Number(healthScoreForm.heartRate),
      water_intake: Number(healthScoreForm.waterIntake),
      foot_steps: healthScoreForm.footSteps.trim()
        ? Number(healthScoreForm.footSteps)
        : null,
    };

    const response = await axios.post(
      `${API_URL}/api/auth/health-score/`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    setHealthScore(response.data.health_score ?? null);
    setHealthScoreSummary(response.data.health_score_summary || "");
    setHealthScoreUpdatedAt(response.data.health_score_updated_at || null);
    setHealthScoreForm(mapHealthScoreInputsToForm(response.data.health_score_inputs));

    toast.success("Health score updated successfully.");
  } catch (error: any) {
    console.error(error);
    const backendMessage =
      error?.response?.data?.error ||
      error?.response?.data?.blood_pressure?.[0] ||
      error?.response?.data?.oxygen_level?.[0] ||
      error?.response?.data?.heart_rate?.[0] ||
      error?.response?.data?.water_intake?.[0] ||
      error?.response?.data?.foot_steps?.[0];

    toast.error(backendMessage || "Failed to calculate health score.");
  } finally {
    setHealthScoreLoading(false);
  }
};

const formattedHealthScoreUpdatedAt = healthScoreUpdatedAt
  ? new Date(healthScoreUpdatedAt).toLocaleString()
  : null;

const patientNameParts = String(patientData?.name || "")
  .split(" ")
  .filter(Boolean);
const patientFirstName = patientNameParts[0] || "there";
const patientInitials =
  patientNameParts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "PT";
const recentReportsCount = recentDiagnoses.length;
const careContactsCount = (patientData?.emergencyContacts || []).filter(
  (contact) => contact.name || contact.relation || contact.phone
).length;
const reportsNeedingAttention = recentDiagnoses.filter((diagnosis) => {
  const urgency = getDiagnosisUrgencyKeyword(diagnosis).toLowerCase();
  return urgency !== "low";
}).length;
const latestDiagnosis = recentDiagnoses[0];
const nextVisitLabel = nextCheckup
  ? formatBookingSlotLabel(nextCheckup.date, nextCheckup.time)
  : "No approved visit booked yet";
const latestReportLabel = latestDiagnosis
  ? getDiagnosisTitle(latestDiagnosis)
  : "No recent AI summary yet";
const healthScoreLabel =
  healthScore !== null ? `${healthScore}% overall wellness` : "Run your daily health check";
const healthScoreTone =
  healthScore !== null && healthScore >= 80
    ? {
        card: "border-emerald-200 bg-emerald-50/90",
        icon: "bg-emerald-100 text-emerald-700",
        value: "text-emerald-700",
        helper: "text-emerald-700/80",
      }
    : healthScore !== null && healthScore >= 60
      ? {
          card: "border-amber-200 bg-amber-50/90",
          icon: "bg-amber-100 text-amber-700",
          value: "text-amber-700",
          helper: "text-amber-700/80",
        }
      : {
          card: "border-cyan-200 bg-cyan-50/90",
          icon: "bg-cyan-100 text-cyan-700",
          value: "text-cyan-700",
          helper: "text-cyan-700/80",
        };
const dashboardHighlights = [
  {
    label: "Health reports",
    value: recentReportsCount.toString(),
    helper: recentReportsCount ? "Saved AI summaries and care notes" : "Start with your first AI health summary",
    icon: FileText,
    cardClassName: "border-blue-200 bg-white/95",
    iconClassName: "bg-blue-100 text-blue-700",
  },
  {
    label: "Health score",
    value: healthScore !== null ? `${healthScore}%` : "Assess",
    helper: healthScore !== null ? "Refresh vitals anytime from the daily check" : "Add today’s vitals for a quick wellness score",
    icon: Shield,
    cardClassName: healthScoreTone.card,
    iconClassName: healthScoreTone.icon,
  },
  {
    label: "Upcoming visits",
    value: upcomingAppointments.length.toString(),
    helper: nextCheckup ? nextVisitLabel : "Book a verified doctor when you need care",
    icon: CalendarDays,
    cardClassName: "border-violet-200 bg-violet-50/90",
    iconClassName: "bg-violet-100 text-violet-700",
  },
  {
    label: "Needs attention",
    value: reportsNeedingAttention.toString(),
    helper: reportsNeedingAttention ? "Recent items may need follow-up or review" : "No recent reports flagged for follow-up",
    icon: CircleAlert,
    cardClassName: "border-orange-200 bg-orange-50/90",
    iconClassName: "bg-orange-100 text-orange-700",
  },
];
const recentDiagnosisCards = recentDiagnoses.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[160px] bg-gradient-to-br from-cyan-100 via-white to-blue-100" />
        <div className="pointer-events-none absolute -left-16 top-20 h-44 w-44 rounded-full bg-cyan-200/40 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-12 h-52 w-52 rounded-full bg-blue-200/35 blur-3xl" />

        <header className="sticky top-0 z-30 border-b border-white/60 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3 sm:items-center">
                <div className="rounded-2xl bg-gradient-to-br from-cyan-700 to-blue-700 p-3 shadow-sm shadow-cyan-200/60">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-700">
                    Personal Care Workspace
                  </p>
                  <h1 className="text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                    MediCore AI
                  </h1>
                  <p className="text-sm text-slate-600">
                    Patient dashboard built for fast daily check-ins and calm care follow-up.
                  </p>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3 md:items-center">
                <button
                    onClick={() => setActiveTab("profile")}
                    className="
                      flex min-w-0 flex-1 items-center gap-3
                      rounded-2xl border border-cyan-100
                      bg-white/90 px-3 py-2 shadow-sm
                      transition hover:border-cyan-300 hover:bg-cyan-50
                    "
                  >
                  <Avatar className="h-11 w-11 border border-cyan-100">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-cyan-50 font-semibold text-cyan-700">
                      {patientInitials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-950">{patientData?.name || "Patient"}</p>
                    <p className="text-sm text-slate-500">Patient</p>
                  </div>
                </button>

                <Button
                  variant="outline"
                  onClick={onLogout}
                  className="
                    h-[52px] shrink-0
                    border-slate-200
                    bg-white/90
                    px-4
                    text-slate-700
                    hover:bg-slate-50
                  "
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <div className="overflow-x-auto pb-1">
              <TabsList
                  className="
                    sticky top-[88px] z-20
                    grid w-full grid-cols-3
                    h-auto gap-2
                    rounded-[24px]
                    border border-blue-100
                    bg-white p-2
                    shadow-md
                  "
                >
                <TabsTrigger
                  value="dashboard"
                  className="min-w-[118px] flex-1 gap-2 rounded-2xl px-3 py-3 text-xs font-medium text-slate-600 data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-none sm:min-w-[140px] sm:text-sm"
                >
                  <Activity className="h-4 w-4 shrink-0" />
                  <span>Dashboard</span>
                </TabsTrigger>
                <TabsTrigger
                  value="analyzer"
                  className="min-w-[118px] flex-1 gap-2 rounded-2xl px-3 py-3 text-xs font-medium text-slate-600 data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-none sm:min-w-[140px] sm:text-sm"
                >
                  <Brain className="h-4 w-4 shrink-0" />
                  <span>AI Analyzer</span>
                </TabsTrigger>
                <TabsTrigger
                  value="appointments"
                  className="min-w-[138px] flex-1 gap-2 rounded-2xl px-3 py-3 text-xs font-medium text-slate-600 data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-none sm:min-w-[190px] sm:text-sm"
                >
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Appointments</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="dashboard" className="space-y-6">
              <Card className="overflow-hidden border-cyan-100 bg-white/95 shadow-sm">
                <div
                    className="
                      grid grid-cols-1
                      gap-5
                      bg-gradient-to-br
                      from-cyan-50 via-white to-blue-50
                      p-4 sm:p-6
                      lg:grid-cols-[1.15fr_0.85fr]
                    "
                  >
                  <div className="space-y-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 shadow-sm">
                      <Heart className="h-3.5 w-3.5 text-rose-500" />
                      Personal Health Hub
                    </div>

                    <div>
                      <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                        Welcome back, {patientFirstName}
                      </h2>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                        Track your care in one place, run an AI symptom check when something feels off, and move from concern to next step with less friction on mobile or desktop.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                        User-friendly
                      </Badge>
                      <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                        AI summaries
                      </Badge>
                      <Badge variant="outline" className="border-violet-200 bg-white text-violet-700">
                        Secure bookings
                      </Badge>
                      <Badge variant="outline" className="border-red-200 bg-white text-red-700">
                        24X7 support
                      </Badge>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-cyan-100 bg-white/92 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                          Care Snapshot
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">
                          Today at a glance
                        </h3>
                      </div>
                      <Badge variant="outline" className="border-cyan-200 text-cyan-700">
                        Live
                      </Badge>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Next visit
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{nextVisitLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Latest report
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{latestReportLabel}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Emergency contacts
                          </p>
                          <p className="mt-2 text-2xl font-semibold text-slate-950">{careContactsCount}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Health score
                          </p>
                          <p className={`mt-2 text-2xl font-semibold ${healthScoreTone.value}`}>
                            {healthScore !== null ? `${healthScore}%` : "--"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {dashboardHighlights.map((item) => (
                  <Card
                    key={item.label}
                    onClick={() => {
                      if (item.label === "Health score") {
                        setShowHealthScorePanel((prev) => !prev);
                      }

                      if (item.label === "Upcoming visits") {
                        setShowAppointmentsModal(true);
                      }

                      if (item.label === "Health reports") {
                        setActiveTab("dashboard");
                      }
                    }}
                    className={`cursor-pointer border shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${item.cardClassName}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-600">{item.label}</p>
                          <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{item.helper}</p>
                        </div>
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.iconClassName}`}>
                          <item.icon className="h-5 w-5" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {showHealthScorePanel && (
                <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 shadow-sm">
                  <CardHeader className="pb-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-emerald-900">
                          <Shield className="h-5 w-5 text-emerald-600" />
                          Daily Health Check
                        </CardTitle>
                        <CardDescription className="mt-1 text-emerald-800/80">
                          Enter today’s vitals and habits to refresh your saved wellness score and note.
                        </CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {healthScore !== null ? (
                          <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-700">
                            Current score: {healthScore}%
                          </Badge>
                        ) : null}
                        {formattedHealthScoreUpdatedAt ? (
                          <Badge variant="outline" className="border-teal-200 bg-white text-teal-700">
                            Updated: {formattedHealthScoreUpdatedAt}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Blood pressure</p>
                        <p className="mt-2 text-sm text-slate-600">Keep the usual systolic/diastolic format.</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Oxygen and pulse</p>
                        <p className="mt-2 text-sm text-slate-600">Helpful when you feel tired, breathless, or unwell.</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Hydration</p>
                        <p className="mt-2 text-sm text-slate-600">Daily water intake adds context to your wellness score.</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Activity</p>
                        <p className="mt-2 text-sm text-slate-600">Steps are optional, but useful for trend tracking.</p>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="blood-pressure" className="text-emerald-900">Blood Pressure</Label>
                        <Input
                          id="blood-pressure"
                          placeholder="120/80"
                          value={healthScoreForm.bloodPressure}
                          onChange={(e) => handleHealthScoreFieldChange("bloodPressure", e.target.value)}
                          className="h-12 rounded-2xl border-emerald-200 bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oxygen-level" className="text-emerald-900">Oxygen Level (%)</Label>
                        <Input
                          id="oxygen-level"
                          type="number"
                          min="1"
                          max="100"
                          placeholder="98"
                          value={healthScoreForm.oxygenLevel}
                          onChange={(e) => handleHealthScoreFieldChange("oxygenLevel", e.target.value)}
                          className="h-12 rounded-2xl border-emerald-200 bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="heart-rate" className="text-emerald-900">Heart Rate (bpm)</Label>
                        <Input
                          id="heart-rate"
                          type="number"
                          min="1"
                          placeholder="72"
                          value={healthScoreForm.heartRate}
                          onChange={(e) => handleHealthScoreFieldChange("heartRate", e.target.value)}
                          className="h-12 rounded-2xl border-emerald-200 bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="water-intake" className="text-emerald-900">Water Intake (liters)</Label>
                        <Input
                          id="water-intake"
                          type="number"
                          min="0"
                          step="0.1"
                          placeholder="2.5"
                          value={healthScoreForm.waterIntake}
                          onChange={(e) => handleHealthScoreFieldChange("waterIntake", e.target.value)}
                          className="h-12 rounded-2xl border-emerald-200 bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="foot-steps" className="text-emerald-900">Foot Steps (optional)</Label>
                        <Input
                          id="foot-steps"
                          type="number"
                          min="0"
                          placeholder="8000"
                          value={healthScoreForm.footSteps}
                          onChange={(e) => handleHealthScoreFieldChange("footSteps", e.target.value)}
                          className="h-12 rounded-2xl border-emerald-200 bg-white"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-100 bg-white/85 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-emerald-900">
                            Your latest health score stays saved until you submit a new daily check.
                          </p>
                          <p className={`text-xs ${healthScoreTone.helper}`}>
                            {healthScoreLabel}
                          </p>
                        </div>
                        <Button
                          onClick={handleHealthScoreSubmit}
                          disabled={healthScoreLoading}
                          className="h-11 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {healthScoreLoading ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Checking Score...
                            </>
                          ) : (
                            "Check Health Score"
                          )}
                        </Button>
                      </div>
                    </div>

                    {healthScoreSummary && (
                      <div className="rounded-2xl border border-teal-100 bg-white/85 p-4">
                        <p className="text-sm font-semibold text-teal-900">AI Health Note</p>
                        <p className="mt-2 text-sm leading-6 text-teal-800">{healthScoreSummary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border-blue-100 bg-white/95 shadow-sm">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                      <FileText className="h-5 w-5 text-cyan-700" />
                      Recent Diagnoses
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Review your latest AI-generated health summaries, download them, or remove old records.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-blue-200 text-blue-700">
                    {recentReportsCount} saved
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recentDiagnosisCards.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
                        <Brain className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-slate-950">No reports yet</h3>
                      <p className="mt-2 text-sm text-slate-500">
                        Your AI symptom analyses will appear here after you complete your first check.
                      </p>
                      <Button
                        className="mt-4 bg-cyan-700 text-white hover:bg-cyan-800"
                        onClick={() => setActiveTab("analyzer")}
                      >
                        Go To AI Analyzer
                      </Button>
                    </div>
                  ) : (
                    recentDiagnosisCards.map((diagnosis) => (
                      <div
                        key={diagnosis.id}
                        className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-blue-50/60 p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex-1">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <Badge variant={getUrgencyBadgeVariant(getDiagnosisUrgencyKeyword(diagnosis))}>
                                {getDiagnosisUrgencyKeyword(diagnosis)}
                              </Badge>
                              <Badge variant="outline" className="border-blue-200 text-blue-700">
                                {diagnosis.status || "Completed"}
                              </Badge>
                              <span className="text-sm text-slate-500">
                                {new Date(diagnosis.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className="text-lg font-semibold text-slate-950">
                              {getDiagnosisTitle(diagnosis)}
                            </h4>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Symptoms: {diagnosis.symptoms || "No symptom text saved"}
                            </p>
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-2xl border border-blue-100 bg-white/90 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                  Severity
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-900">
                                  {getDiagnosisSeverity(diagnosis)}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-blue-100 bg-white/90 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                  Possible conditions
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-900">
                                  {diagnosis.possible_conditions?.length || 0}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-blue-100 bg-white/90 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
                                  Next step
                                </p>
                                <p className="mt-2 text-sm font-medium text-slate-900">
                                  {diagnosis.specialist_consultation || "Monitor symptoms and seek care if needed"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                              onClick={() => downloadDiagnosisPDF(diagnosis)}
                            >
                              <Download className="mr-2 h-4 w-4" />
                              Download PDF
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="border-red-200"
                              onClick={() => deleteDiagnosis(diagnosis.id)}
                            >
                              Delete Report
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

          <TabsContent value="analyzer">
            <SymptomAnalyzer />
          </TabsContent>

          <TabsContent value="appointments">
            <div className="space-y-6">
              <Card className="overflow-hidden border-blue-100 shadow-sm">
                <div className="grid gap-6 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-6 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700 shadow-sm">
                      <Calendar className="h-3.5 w-3.5" />
                      Smart Appointment Booking
                    </div>

                    <div>
                      <h2 className="text-3xl font-semibold tracking-tight text-slate-950">
                        Book A Specialist Visit
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                        Browse approved doctors, compare consultation details, and reserve a trusted appointment slot through a polished, secure medical booking flow.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-cyan-200 bg-white text-cyan-700">
                        Verified Doctors
                      </Badge>
                      <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                        Secure Payment
                      </Badge>
                      <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
                        Live Availability
                      </Badge>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-blue-100 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-blue-700">
                          <User className="h-4 w-4" />
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Available Doctors</p>
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-slate-950">{doctors.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Approved clinicians ready for booking</p>
                      </div>

                      <div className="rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <Shield className="h-4 w-4" />
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">Booking Safety</p>
                        </div>
                        <p className="mt-3 text-sm font-medium text-slate-900">
                          Only approved and active doctors appear in this directory.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-cyan-100 bg-white/90 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                          Booking Journey
                        </p>
                        <h3 className="mt-2 text-xl font-semibold text-slate-950">
                          Clear, clinical, and patient-friendly
                        </h3>
                      </div>
                    </div>

                    <div className="mt-5 space-y-3">
                      {[
                        {
                          icon: BadgeCheck,
                          title: "Choose a verified doctor",
                          copy: "Review specialization, experience, and consultation fee before you continue.",
                        },
                        {
                          icon: CalendarDays,
                          title: "Select a suitable slot",
                          copy: "Check doctor availability in real time and avoid already booked appointment windows.",
                        },
                        {
                          icon: CreditCard,
                          title: "Confirm through secure payment",
                          copy: "Your appointment is finalized only after successful payment and verification.",
                        },
                      ].map((step) => (
                        <div
                          key={step.title}
                          className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                            <step.icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{step.copy}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              </Card>

              <Card className="border-blue-100 bg-white/95 shadow-sm">
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl text-slate-950">
                      <BriefcaseMedical className="h-5 w-5 text-cyan-700" />
                      Choose Your Doctor
                    </CardTitle>
                    <CardDescription className="text-slate-600">
                      Compare consultation profiles and open the booking sheet for the doctor that fits your needs.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="border-blue-200 text-blue-700">
                    {doctors.length} listed
                  </Badge>
                </CardHeader>
                <CardContent>
                {/* 🔥 DOCTOR LIST */}
                {doctors.length === 0 ? (
                  <div className="rounded-2xl border border-blue-100 bg-white/95 p-8 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                      <Stethoscope className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-950">No doctors available right now</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Approved doctor profiles will appear here once they are available for patient booking.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-5 xl:grid-cols-2">
                    {doctors.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="group flex h-full flex-col rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-slate-50/60 to-cyan-50/40 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-14 w-14 border border-cyan-100">
                            <AvatarFallback className="bg-cyan-50 font-semibold text-cyan-700">
                              {getDoctorInitials(doc.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <h3 className="text-lg font-semibold text-slate-950">{doc.name}</h3>
                            <p className="mt-1 text-sm font-medium text-cyan-700">
                              {formatDoctorSpecialization(doc.specialization)}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                              Professional consultation profile with verified booking access and live slot checking.
                            </p>
                          </div>
                        </div>

                        <Badge className="border-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Verified
                        </Badge>
                      </div>

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-100 bg-white/85 p-4">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Clock className="h-4 w-4 text-cyan-700" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Experience</p>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {formatDoctorExperience(doc.experience)}
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-100 bg-white/85 p-4">
                          <div className="flex items-center gap-2 text-slate-500">
                            <CreditCard className="h-4 w-4 text-emerald-700" />
                            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Consultation Fee</p>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-emerald-700">
                            {formatConsultationFee(doc.consultation_fee)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                          className="bg-cyan-700 text-white hover:bg-cyan-800"
                          onClick={() => openDoctorBooking(doc)}
                        >
                          Check Availability
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    ))}
                  </div>
                )}

                {/* 🔥 MODAL */}
                {selectedDoctor && (
                  <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
                    <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-[28px] border border-blue-100 bg-white p-5 shadow-2xl sm:p-6">

                      <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                            Appointment Booking
                          </p>
                          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                            Choose Your Slot
                          </h2>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            Review doctor details, select your preferred consultation time, and continue to secure payment.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={closeBookingSheet}
                          className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                          aria-label="Close booking"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mb-4 rounded-3xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-blue-50 p-4">
                        <div className="flex items-start gap-4">
                          <Avatar className="h-14 w-14 border border-cyan-100">
                            <AvatarFallback className="bg-cyan-100 font-semibold text-cyan-700">
                              {getDoctorInitials(selectedDoctor.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-2">
                            <p className="text-lg font-semibold text-slate-950">{selectedDoctor.name}</p>
                            <p className="text-sm font-medium text-cyan-700">
                              {formatDoctorSpecialization(selectedDoctor.specialization)}
                            </p>
                            <Badge variant="outline" className="border-slate-200 text-slate-600">
                              {formatDoctorExperience(selectedDoctor.experience)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <p className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        {formatConsultationFee(selectedDoctor.consultation_fee)}
                      </p>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="appointment-date" className="text-slate-800">
                            Consultation Date
                          </Label>
                          <Input
                            id="appointment-date"
                            type="date"
                            min={new Date().toISOString().split("T")[0]}
                            className="h-12 rounded-2xl border-slate-200 bg-slate-50/70"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="appointment-time" className="text-slate-800">
                            Preferred Time
                          </Label>
                          <Input
                            id="appointment-time"
                            type="time"
                            className="h-12 rounded-2xl border-slate-200 bg-slate-50/70"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-blue-200 text-blue-700">
                          {date
                            ? `${selectedDayBusySlots.length} booked slot${selectedDayBusySlots.length === 1 ? "" : "s"} on this date`
                            : "Choose a date to review availability"}
                        </Badge>
                        {selectedSlotLabel ? (
                          <Badge variant="outline" className="border-cyan-200 text-cyan-700">
                            Selected: {selectedSlotLabel}
                          </Badge>
                        ) : null}
                      </div>

                      {date && time && selectedSlotBusy && (
                        <div className="mt-4 flex gap-3 rounded-2xl border border-rose-100 bg-rose-50/80 p-4">
                          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                          <p className="text-sm leading-6 text-rose-800">
                            Doctor is unavailable at this time. Please choose another slot.
                          </p>
                        </div>
                      )}

                      {!selectedSlotBusy && date && time && (
                        <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4">
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                          <p className="text-sm leading-6 text-emerald-800">
                            This slot looks available and is ready for secure payment confirmation.
                          </p>
                        </div>
                      )}

                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <Button
                          className={`h-12 bg-cyan-700 text-white hover:bg-cyan-800 ${
                            selectedSlotBusy ? "cursor-not-allowed opacity-50" : ""
                          }`}
                          onClick={handleRazorpayBooking}
                          disabled={selectedSlotBusy}
                        >
                          Confirm & Pay Securely
                        </Button>

                        <Button
                          variant="outline"
                          className="h-12 border-slate-200"
                          onClick={closeBookingSheet}
                        >
                          Cancel
                        </Button>
                      </div>

                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </TabsContent>

          <TabsContent value="profile">
            {patientData && (
              <PatientProfile
                patientData={patientData}
                onProfileUpdate={handleProfileUpdate}
              />
            )}
          </TabsContent>
        </Tabs>

        {/* 🔥 APPOINTMENTS MODAL */}
        {showAppointmentsModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
            <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-blue-100 bg-white p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700">
                    Appointment Overview
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    Your Appointments
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Review visit status, keep track of approved bookings, and cancel pending requests if your plan changes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAppointmentsModal(false)}
                  className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  aria-label="Close appointments"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Total</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">{appointments.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Approved</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {appointments.filter((appointment: any) => appointment.status === "approved").length}
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Pending</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {appointments.filter((appointment: any) => appointment.status === "pending").length}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {appointments.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-blue-200 bg-blue-50/60 p-8 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm">
                      <CalendarDays className="h-6 w-6" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-950">No appointments yet</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Book a doctor visit to see your appointment timeline here.
                    </p>
                  </div>
                ) : (
                  appointments.map((a: any) => (
                    <div
                      key={a.id}
                      className="rounded-[24px] border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700">
                            <Stethoscope className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="text-base font-semibold text-slate-950">{a.doctor}</p>
                            <p className="mt-1 text-sm text-slate-600">
                              {formatBookingSlotLabel(a.date, a.time) || `${a.date} at ${a.time}`}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className={
                                  a.status === "approved"
                                    ? "border-emerald-200 text-emerald-700"
                                    : a.status === "rejected"
                                      ? "border-rose-200 text-rose-700"
                                      : "border-amber-200 text-amber-700"
                                }
                              >
                                {a.status}
                              </Badge>
                              <Badge variant="outline" className="border-blue-200 text-blue-700">
                                Patient booking
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {a.status === "pending" && (
                          <Button
                            variant="destructive"
                            className="w-full sm:w-auto"
                            onClick={async () => {
                              try {
                                await axios.delete(
                                  `${API_URL}/api/auth/appointments/${a.id}/`,
                                  {
                                    headers: {
                                      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
                                    },
                                  }
                                );

                                toast.success("Appointment cancelled");

                                setAppointments((prev) =>
                                  prev.filter((ap) => ap.id !== a.id)
                                );
                              } catch {
                                toast.error("Failed to cancel");
                              }
                            }}
                          >
                            Cancel Request
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <Button
                className="mt-5 w-full bg-cyan-700 text-white hover:bg-cyan-800"
                onClick={() => setShowAppointmentsModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
};

export default PatientDashboard;
