import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Banknote,
  Brain,
  FileText,
  LogOut,
  Search,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  LineChart,
  Line,
} from "recharts";

interface AdminDashboardProps {
  onLogout: () => void;
}

interface Patient {
  id: string;
  name: string;
  email: string;
  age: number;
  gender: string;
  address: string;
  status: string;
  lastVisit: string;
  consultations: number;
}

interface Doctor {
  id: number;
  name: string;
  email: string;
  specialization: string;
  experience: number;
  is_approved: boolean;
  is_blocked: boolean;
  consultation_fee: number;
  address: string;
  documents?: {
    file: string;
  }[];
}

interface Stats {
  totalPatients: number;
  totalDoctors: number;
  approvedDoctors: number;
}

interface DoctorPayout {
  doctor_id: number;
  doctor_name: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  appointments: number;
  total_fee: number;
  service_charge: number;
  doctor_payable: number;
  upi_qr?: string;
}

const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [specSearch, setSpecSearch] = useState("");

  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalPatients: 0,
    totalDoctors: 0,
    approvedDoctors: 0,
  });
  const [doctorPayouts, setDoctorPayouts] = useState<DoctorPayout[]>([]);
  const [selectedQR, setSelectedQR] = useState<string | null>(null);
  const [incomeData, setIncomeData] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };

        const [patientsRes, statsRes, doctorsRes, payoutsRes,incomeRes] = await Promise.all([
          axios.get(`${API_URL}/api/auth/admin/patients/`, { headers }),
          axios.get(`${API_URL}/api/auth/admin/stats/`, { headers }),
          axios.get(`${API_URL}/api/auth/admin/doctors/`, { headers }),
          axios.get(`${API_URL}/api/auth/admin/doctor-payouts/`, { headers }),
          axios.get(`${API_URL}/api/auth/admin/income-graph/`, { headers }),
        ]);

        setPatients(patientsRes.data);
        setStats(statsRes.data);
        setDoctors(doctorsRes.data);
        setDoctorPayouts(payoutsRes.data);
        setIncomeData(
        incomeRes.data.map((d: any) => ({
          ...d,
          income: Number(d.income)   // 🔥 ensure number
        }))
      );
      } catch {
        toast.error("Failed to load admin data");
      }
    };

    fetchData();
  }, []);

  const handlePayDoctor = async (doctorId: number) => {
    try {
      const token = localStorage.getItem("access_token");

      await axios.post(
        `${API_URL}/api/auth/admin/pay-doctor/${doctorId}/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.success("Doctor marked paid");

      setDoctorPayouts((prev) =>
        prev.filter((doc) => doc.doctor_id !== doctorId)
      );
    } catch {
      toast.error("Payment failed");
    }
  };

  const handlePayAllDoctors = async () => {
    try {
      const token = localStorage.getItem("access_token");

      await axios.post(
        `${API_URL}/api/auth/admin/pay-all-doctors/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      toast.success("All doctors paid");
      setDoctorPayouts([]);
    } catch {
      toast.error("Failed");
    }
  };

  const handleDoctorAction = async (id: number, action: string) => {
    const token = localStorage.getItem("access_token");

    await axios.patch(
      `${API_URL}/api/auth/admin/doctors/${id}/`,
      { action },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    toast.success("Doctor updated");
    window.location.reload();
  };

  const handleAnalyzeDocuments = async () => {
  if (!selectedDoctor) return;

  try {
    setAnalyzing(true);

    const token = localStorage.getItem("access_token");

    const res = await axios.post(
      `${API_URL}/api/auth/doctor/analyze/${selectedDoctor.id}/`,
      {},
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    setAnalysisResult(res.data);
  } catch (err) {
    console.error(err);
    toast.error("Analysis failed");
  } finally {
    setAnalyzing(false);
  }
};

  const handlePatientDelete = async (id: string) => {
    const token = localStorage.getItem("access_token");

    await axios.delete(
      `${API_URL}/api/auth/admin/patients/${id}/`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    setPatients(prev => prev.filter(p => p.id !== id));
    toast.success("Patient deleted");
  };

  const filteredPatients = patients.filter(p =>
    (p.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(nameSearch.toLowerCase()) &&
    d.specialization.toLowerCase().includes(specSearch.toLowerCase())
  );

  const chartData = [
    { name: "Approved", value: stats.approvedDoctors || 0 },
    { name: "Pending", value: stats.totalDoctors - stats.approvedDoctors || 0 },
  ];

  const pendingDoctors = Math.max(stats.totalDoctors - stats.approvedDoctors, 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e0f2fe,transparent_30%),linear-gradient(135deg,#f8fafc,#f0fdfa_48%,#ffffff)] text-slate-900">
      <header className="border-b border-cyan-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cyan-600 p-2 shadow-sm">
              <Brain className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950">MediCore AI</h1>
              <p className="text-sm text-cyan-700">Admin Dashboard</p>
            </div>
          </div>

          <Button variant="outline" onClick={onLogout} className="border-slate-200 bg-white">
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid h-auto w-full grid-cols-4 gap-1 rounded-lg border border-cyan-100 bg-white/80 p-1 shadow-sm">
            <TabsTrigger value="overview" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">Overview</TabsTrigger>
            <TabsTrigger value="patients" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">Patients</TabsTrigger>
            <TabsTrigger value="doctors" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">Doctors</TabsTrigger>
            <TabsTrigger value="payouts" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">
              <span className="sm:hidden">Payouts</span>
              <span className="hidden sm:inline">Doctor Payouts</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Patients</p>
                    <h2 className="text-3xl font-bold text-slate-950">{stats.totalPatients}</h2>
                  </div>
                  <div className="rounded-lg bg-cyan-50 p-3 text-cyan-700">
                    <Users className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Total Doctors</p>
                    <h2 className="text-3xl font-bold text-slate-950">{stats.totalDoctors}</h2>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-emerald-700">
                    <Stethoscope className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Pending Approvals</p>
                    <h2 className="text-3xl font-bold text-slate-950">{pendingDoctors}</h2>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 text-amber-700">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* LEFT: Doctor Approval */}
              <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                    <ShieldCheck className="h-5 w-5 text-cyan-700" />
                    Doctor Approval Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[320px] p-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#0891b2" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* RIGHT: Daily Income */}
              <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                  <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                    <Banknote className="h-5 w-5 text-emerald-600" />
                    Daily Income
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-[320px] p-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={incomeData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                      <XAxis dataKey="date" padding={{ left: 20, right: 20 }} />
                      <YAxis domain={[0, "auto"]} />
                      <Tooltip formatter={(value) => `₹${value}`} />
                      <Line
                        type="monotone"
                        dataKey="income"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 6 }}          
                        activeDot={{ r: 7 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          <TabsContent value="patients" className="space-y-4">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <UserRound className="h-5 w-5 text-cyan-700" />
                  Patient Registry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Search patient..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border-slate-200 pl-9"
                  />
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {filteredPatients.map(p => (
                    <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-950">{p.name || "Unnamed Patient"}</p>
                        <p className="text-sm text-slate-500">{p.email}</p>
                      </div>

                      <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => handlePatientDelete(p.id)}>
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="doctors" className="space-y-4">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Stethoscope className="h-5 w-5 text-cyan-700" />
                  Doctor Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <Input placeholder="Search name..." value={nameSearch} onChange={(e) => setNameSearch(e.target.value)} />
                  <Input placeholder="Search specialization..." value={specSearch} onChange={(e) => setSpecSearch(e.target.value)} />
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {filteredDoctors.map(d => (
                    <div
                      key={d.id}
                      className="flex cursor-pointer flex-col gap-4 p-4 transition-colors hover:bg-cyan-50/40 lg:flex-row lg:items-center lg:justify-between"
                      onClick={() => setSelectedDoctor(d)}
                    >
                      <div>
                        <p className="font-semibold text-slate-950">{d.name || "Unnamed Doctor"}</p>
                        <p className="text-sm text-slate-500">{d.specialization || "Specialization not set"}</p>
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end" onClick={(e) => e.stopPropagation()}>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                          !d.is_approved
                            ? "bg-amber-50 text-amber-700"
                            : d.is_blocked
                            ? "bg-rose-50 text-rose-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}>
                          {!d.is_approved ? "pending" : d.is_blocked ? "blocked" : "approved"}
                        </span>

                        {!d.is_approved ? (
                          <>
                            <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto" onClick={() => handleDoctorAction(d.id, "approve")}>Approve</Button>
                            <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => handleDoctorAction(d.id, "reject")}>Reject</Button>
                          </>
                        ) : d.is_blocked ? (
                          <Button size="sm" className="w-full border-none bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto" onClick={() => handleDoctorAction(d.id, "unblock")}>Unblock</Button>
                        ) : (
                          <Button size="sm" variant="destructive" className="w-full sm:w-auto" onClick={() => handleDoctorAction(d.id, "block")}>Block</Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {selectedDoctor && (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-4 sm:items-center">
                <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl sm:p-6">
                  <div className="mb-4 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Doctor Details</h2>
                      <p className="text-sm text-slate-500">{selectedDoctor.email}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setSelectedDoctor(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2 text-sm text-slate-700">
                    <p><b>Name:</b> {selectedDoctor.name}</p>
                    <p><b>Specialization:</b> {selectedDoctor.specialization}</p>
                    <p><b>Experience:</b> {selectedDoctor.experience} yrs</p>
                    <p><b>Consultation Fee:</b> {selectedDoctor.consultation_fee}</p>
                    <p><b>Address:</b> {selectedDoctor.address}</p>
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                      <FileText className="h-4 w-4 text-cyan-700" />
                      Documents
                    </p>

                    {selectedDoctor.documents && selectedDoctor.documents.length > 0 ? (
                      selectedDoctor.documents.map((doc: any, i: number) => (
                        <a
                          key={i}
                          href={`http://localhost:8000${doc.file}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-md border border-cyan-100 px-3 py-2 text-sm text-cyan-700 hover:bg-cyan-50"
                        >
                          View Document {i + 1}
                        </a>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">No documents uploaded</p>
                    )}

                    {!selectedDoctor.is_approved && (
                      <div className="mt-4">
                        <Button
                          onClick={handleAnalyzeDocuments}
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          🔍 Analyze Documents
                        </Button>
                      </div>
                    )}

                    {analyzing && (
                      <p className="mt-2 text-sm text-slate-500">Analyzing documents...</p>
                    )}

                    {analysisResult && (
                      <div className="mt-3 rounded-md border p-3">
                        <p className="text-sm font-semibold">
                          Result:{" "}
                          <span
                            className={
                              analysisResult.verdict === "genuine"
                                ? "text-green-600"
                                : analysisResult.verdict === "suspicious"
                                ? "text-yellow-600"
                                : "text-red-600"
                            }
                          >
                            {analysisResult.verdict.toUpperCase()}
                          </span>
                        </p>

                        <p className="text-sm">
                          Confidence: {analysisResult.confidence}%
                        </p>

                        {analysisResult.issues?.length > 0 && (
                          <ul className="mt-2 text-sm text-red-500">
                            {analysisResult.issues.map((issue: string, i: number) => (
                              <li key={i}>• {issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="payouts" className="space-y-4">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="flex flex-col gap-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Banknote className="h-5 w-5 text-cyan-700" />
                  Doctor Payouts
                </CardTitle>

                {doctorPayouts.length > 0 && (
                  <Button onClick={handlePayAllDoctors} className="w-full bg-cyan-700 hover:bg-cyan-800 sm:w-auto">
                    Pay All Doctors
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-5">
                {doctorPayouts.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-slate-500">No pending payouts</p>
                ) : (
                  <div className="space-y-4">
                    {doctorPayouts.map((doc) => (
                      <div key={doc.doctor_id} className="rounded-lg border border-slate-200 bg-white p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h3 className="font-bold text-slate-950">{doc.doctor_name}</h3>
                            <p className="text-sm text-slate-500">Cases: {doc.appointments}</p>

                            <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                              <p>Total Income: INR {doc.total_fee}</p>
                              <p>Platform Charge: INR {doc.service_charge}</p>
                              <p className="font-semibold text-emerald-700">Doctor Payable: INR {doc.doctor_payable}</p>
                              <p>Bank: {doc.bank_name}</p>
                              <p>Account Holder: {doc.account_holder_name}</p>
                              <p>A/C No: {doc.account_number}</p>
                              <p>IFSC: {doc.ifsc_code}</p>
                            </div>
                          </div>

                          <Button className="w-full lg:w-auto" onClick={() => setSelectedQR(doc.upi_qr || null)}>
                            Pay Now
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {selectedQR && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center">
            <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-xl sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-950">Scan & Pay</h2>

              <img
                src={selectedQR}
                alt="UPI QR"
                className="mx-auto h-56 w-56 object-contain sm:h-64 sm:w-64"
              />

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  onClick={() => {
                    const doc = doctorPayouts.find(d => d.upi_qr === selectedQR);
                    if (doc) handlePayDoctor(doc.doctor_id);
                    setSelectedQR(null);
                  }}
                  className="w-full sm:w-auto"
                >
                  Mark as Paid
                </Button>

                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => setSelectedQR(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
