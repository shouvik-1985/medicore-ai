import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import axios from "axios";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import {
  Brain,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileImage,
  LineChart,
  LogOut,
  Save,
  ShieldCheck,
  Stethoscope,
  Trash2,
  XCircle,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import DoctorAnalyzer from "./DoctorAnalyzer";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const DoctorDashboard = ({ onLogout }: any) => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [doctorName, setDoctorName] = useState("");

  const [appointments, setAppointments] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({
    consultation_fee: "",
    experience: "",
    account_holder_name: "",
    bank_name: "",
    bank_account_number: "",
    ifsc_code: "",
    upi_qr: null,
  });
  const [busyDate, setBusyDate] = useState("");
  const [busyStartTime, setBusyStartTime] = useState("");
  const [busyEndTime, setBusyEndTime] = useState("");
  const [busySlots, setBusySlots] = useState<any[]>([]);
  const [incomeData, setIncomeData] = useState<any>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await axios.get(
          `${API_URL}/api/auth/profile/`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
          }
        );

        setProfile({
          ...res.data,
          consultation_fee: res.data.consultation_fee || "",
          experience: res.data.experience || "",
          account_holder_name: res.data.account_holder_name || "",
          bank_name: res.data.bank_name || "",
          bank_account_number: res.data.bank_account_number || "",
          ifsc_code: res.data.ifsc_code || "",
        });
        setDoctorName(res.data.name || "Doctor");
      } catch (error) {
        console.error(error);
      }
    };

    fetchProfile();
    fetchBusySlots();
  }, []);

  useEffect(() => {
    const fetchAppointments = async () => {
      const res = await axios.get(
        `${API_URL}/api/auth/appointments/doctor/`,
        { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }
      );

      setAppointments(res.data);
    };

    fetchAppointments();
  }, []);

  useEffect(() => {
    const fetchIncome = async () => {
      try {
        const res = await axios.get(
          `${API_URL}/api/auth/doctor/income-graph/`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            },
          }
        );

        const labels = res.data.map((d: any) => d.date);
        const values = res.data.map((d: any) => d.income);

        setIncomeData({
          labels,
          datasets: [
            {
              label: "Income INR",
              data: values,
              borderColor: "#0891b2",
              borderWidth: 2,
              tension: 0.4,
              pointRadius: values.length === 1 ? 5 : 3,
              pointHoverRadius: 5,
              fill: values.length !== 1,
              backgroundColor: "rgba(8,145,178,0.08)",
            },
          ],
        });
      } catch (error) {
        console.error(error);
      }
    };

    fetchIncome();
  }, []);

  const fetchBusySlots = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/auth/doctor-busy-slots/`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      setBusySlots(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const markBusySlot = async () => {
    try {
      if (!busyDate || !busyStartTime || !busyEndTime) {
        toast.error("Please select date and time range");
        return;
      }

      if (busyStartTime >= busyEndTime) {
        toast.error("End time must be after start time");
        return;
      }

      await axios.post(
        `${API_URL}/api/auth/doctor-busy-slots/`,
        {
          date: busyDate,
          start_time: busyStartTime,
          end_time: busyEndTime,
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      toast.success("Busy slot added");

      setBusyDate("");
      setBusyStartTime("");
      setBusyEndTime("");

      fetchBusySlots();
    } catch (err) {
      console.error(err);
      toast.error("Error");
    }
  };

  const deleteBusySlot = async (id: number) => {
    try {
      await axios.delete(
        `${API_URL}/api/auth/doctor/busy-slots/${id}/delete/`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
          },
        }
      );

      toast.success("Busy slot removed");

      setBusySlots((prev) => prev.filter((slot) => slot.id !== id));
    } catch (error) {
      console.error(error);
      toast.error("Delete failed");
    }
  };

  const handleAction = async (id: number, action: string) => {
    const res = await axios.patch(
      `${API_URL}/api/auth/appointments/action/${id}/`,
      { action },
      { headers: { Authorization: `Bearer ${localStorage.getItem("access_token")}` } }
    );

    toast.success("Updated");

    setAppointments(prev =>
      prev.map(a =>
        a.id === id ? { ...a, status: res.data.status } : a
      )
    );
  };

  const handleSave = async () => {
    try {
      if (
        profile.bank_account_number &&
        !/^\d{9,18}$/.test(profile.bank_account_number)
      ) {
        toast.error("Invalid bank account number");
        return;
      }

      if (
        profile.ifsc_code &&
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(profile.ifsc_code)
      ) {
        toast.error("Invalid IFSC code");
        return;
      }

      const formData = new FormData();

      formData.append("consultation_fee", profile.consultation_fee || "");
      formData.append("experience", profile.experience || "");
      formData.append("account_holder_name", profile.account_holder_name || "");
      formData.append("bank_name", profile.bank_name || "");
      formData.append("bank_account_number", profile.bank_account_number || "");
      formData.append("ifsc_code", profile.ifsc_code || "");

      if (profile.upi_qr) {
        formData.append("upi_qr", profile.upi_qr);
      }

      await axios.put(
        `${API_URL}/api/auth/profile/`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("access_token")}`,
            "Content-Type": "multipart/form-data",
          },
        }
      );

      toast.success("Profile updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed");
    }
  };

  const accepted = appointments.filter(a => a.status === "approved").length;
  const rejected = appointments.filter(a => a.status === "rejected").length;
  const pending = appointments.filter(a => a.status === "pending").length;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ecfeff,transparent_32%),linear-gradient(135deg,#f8fafc,#f0fdfa_45%,#f8fafc)] text-slate-900">
      <header className="border-b border-cyan-100 bg-white/90 shadow-sm backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start justify-between gap-4 md:items-center">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-cyan-600 p-2 shadow-sm">
                  <Brain className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-slate-950">MediCore AI</h1>
                  <p className="text-sm text-cyan-700">Doctor Dashboard</p>
                </div>
              </div>

              <Button variant="outline" onClick={onLogout} className="border-slate-200 bg-white md:hidden">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 md:justify-end">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="border border-cyan-100 bg-cyan-50">
                  <AvatarFallback className="bg-cyan-50 text-cyan-800">
                    {doctorName ? doctorName[0] : "D"}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{doctorName}</p>
                  <p className="text-sm text-slate-500">Doctor</p>
                </div>
              </div>

              <Button variant="outline" onClick={onLogout} className="hidden border-slate-200 bg-white md:flex">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid h-auto w-full grid-cols-4 gap-1 rounded-lg border border-cyan-100 bg-white/80 p-1 shadow-sm">
            <TabsTrigger value="dashboard" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">
              <span className="sm:hidden">Home</span>
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="analyzer" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">
              <span className="sm:hidden">AI</span>
              <span className="hidden sm:inline">AI Analyzer</span>
            </TabsTrigger>
            <TabsTrigger value="appointments" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">
              <span className="sm:hidden">Appointments</span>
              <span className="hidden sm:inline">Appointments</span>
            </TabsTrigger>
            <TabsTrigger value="profile" className="rounded-md px-2 text-[11px] data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-800 data-[state=active]:shadow-sm sm:px-3 sm:text-sm">Profile</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-2xl text-slate-950">
                  <Stethoscope className="h-6 w-6 text-cyan-700" />
                  Welcome Doctor {doctorName}!
                </CardTitle>
                <CardDescription>Clinical operations, availability, and consultation income</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6 bg-slate-50/60 p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-white p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Accepted</p>
                      <p className="text-3xl font-bold text-slate-950">{accepted}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-white p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Rejected</p>
                      <p className="text-3xl font-bold text-slate-950">{rejected}</p>
                    </div>
                    <div className="rounded-lg bg-rose-50 p-3 text-rose-600">
                      <XCircle className="h-6 w-6" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-amber-100 bg-white p-5 shadow-sm">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Pending</p>
                      <p className="text-3xl font-bold text-slate-950">{pending}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 text-amber-600">
                      <Clock3 className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                <div className="h-[280px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:h-[300px] sm:p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <LineChart className="h-5 w-5 text-cyan-700" />
                    Income Overview
                  </h2>

                  {incomeData ? (
                    <Line
                      data={incomeData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                          mode: "index",
                          intersect: false,
                        },

                        layout: {
                          padding: {
                            left: 20,
                            right: 30,
                            top: 20,
                            bottom: 10,
                          },
                        },

                        scales: {
                          x: {
                            offset: true,   // ✅ spacing like recharts
                            ticks: {
                              padding: 10,
                              color: "#334155",
                            },
                            grid: {
                              display: false,
                            },
                          },

                          y: {
                            beginAtZero: false,   // 🔥 IMPORTANT (no touching x-axis)
                            grace: "10%",         // 🔥 adds top & bottom space
                            ticks: {
                              stepSize: 100,      // 🔥 removes weird decimals
                              color: "#475569",
                            },
                            grid: {
                              color: "#e2e8f0",
                            },
                          },
                        },

                        elements: {
                          point: {
                            radius: 6,            // 🔥 bigger dots like admin
                            hoverRadius: 8,
                          },
                          line: {
                            tension: 0.4,         // smooth curve
                          },
                        },

                        plugins: {
                          tooltip: {
                            mode: "index",
                            intersect: false,
                          },
                          legend: {
                            labels: {
                              color: "#334155",
                            },
                          },
                        },
                      }}
                    />
                  ) : (
                    <p className="text-slate-500">Loading graph...</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-950">
                  <CalendarCheck className="h-5 w-5 text-cyan-700" />
                  Manage Availability
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-5 p-5">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                  <input
                    type="date"
                    value={busyDate}
                    onChange={(e) => setBusyDate(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={busyStartTime}
                    onChange={(e) => setBusyStartTime(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <input
                    type="time"
                    value={busyEndTime}
                    onChange={(e) => setBusyEndTime(e.target.value)}
                    className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <Button onClick={markBusySlot} className="w-full bg-cyan-700 hover:bg-cyan-800 md:w-auto">
                    <CalendarCheck className="mr-2 h-4 w-4" />
                    Mark Busy
                  </Button>
                </div>

                <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                  {busySlots.length === 0 ? (
                    <p className="p-5 text-center text-sm text-slate-500">No busy slots marked</p>
                  ) : (
                    busySlots.map((slot: any) => (
                      <div
                        key={slot.id}
                        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <p className="font-medium text-slate-800">
                          {slot.date} | {slot.start_time} - {slot.end_time}
                        </p>

                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full sm:w-auto"
                          onClick={() => deleteBusySlot(slot.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analyzer">
            <Card className="rounded-lg border-cyan-100 bg-white/95 p-5 shadow-sm">
              <DoctorAnalyzer />
            </Card>
          </TabsContent>

          <TabsContent value="appointments">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CalendarCheck className="h-5 w-5 text-cyan-700" />
                  Appointments
                </CardTitle>
              </CardHeader>

              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {appointments.map((a: any) => (
                    <div key={a.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-semibold uppercase tracking-wide text-slate-950">{a.patient}</p>
                        <p className="text-sm text-slate-500">{a.date} at {a.time}</p>
                      </div>

                      <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                        <span className={`rounded-full px-3 py-1 text-sm font-medium ${
                          a.status === "approved"
                            ? "bg-emerald-50 text-emerald-700"
                            : a.status === "pending"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-rose-50 text-rose-700"
                        }`}>
                          {a.status}
                        </span>

                        {a.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              className="w-full bg-emerald-600 hover:bg-emerald-700 sm:w-auto"
                              onClick={() => handleAction(a.id, "approve")}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="w-full sm:w-auto"
                              onClick={() => handleAction(a.id, "reject")}
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile">
            <Card className="rounded-lg border-cyan-100 bg-white/95 shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="h-5 w-5 text-cyan-700" />
                  Doctor Profile
                </CardTitle>
              </CardHeader>

              <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_280px]">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Name</span>
                    <input
                      value={doctorName}
                      disabled
                      className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-500"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Consultation Fee</span>
                    <input
                      type="number"
                      value={profile.consultation_fee || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          consultation_fee: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Experience (years)</span>
                    <input
                      type="number"
                      value={profile.experience || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          experience: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Account Holder Name</span>
                    <input
                      value={profile.account_holder_name || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          account_holder_name: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Account Number</span>
                    <input
                      value={profile.bank_account_number || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          bank_account_number: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>IFSC Code</span>
                    <input
                      value={profile.ifsc_code || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          ifsc_code: e.target.value.toUpperCase(),
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Bank Name</span>
                    <input
                      value={profile.bank_name || ""}
                      onChange={(e) =>
                        setProfile({
                          ...profile,
                          bank_name: e.target.value,
                        })
                      }
                      className="w-full rounded-md border border-slate-200 px-3 py-2"
                    />
                  </label>

                  <label className="space-y-1 text-sm text-slate-600">
                    <span>Upload UPI QR</span>
                    <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                      <FileImage className="h-4 w-4 text-cyan-700" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            upi_qr: e.target.files?.[0],
                          })
                        }
                        className="w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-cyan-50 file:px-3 file:py-1 file:text-cyan-700 hover:file:bg-cyan-100"
                      />
                    </div>
                  </label>
                </div>

                <div className="flex flex-col gap-3 rounded-lg border border-cyan-100 bg-cyan-50/50 p-4 lg:w-full">
                  <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
                    <CreditCard className="h-4 w-4" />
                    Payout Details
                  </div>
                  <div className="space-y-2 text-sm text-slate-600">
                    <p>Fee: INR {profile.consultation_fee || "0"}</p>
                    <p>Account Holder: {profile.account_holder_name || "Not added"}</p>
                    <p>Account Number: {profile.bank_account_number || "Not added"}</p>
                    <p>IFSC: {profile.ifsc_code || "Not added"}</p>
                    <p>Bank: {profile.bank_name || "Not added"}</p>
                  </div>
                  <Button onClick={handleSave} className="mt-auto bg-cyan-700 hover:bg-cyan-800">
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default DoctorDashboard;
