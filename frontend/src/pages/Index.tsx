import {
  useEffect,
  useState,
  lazy,
  Suspense
} from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, FileText, Shield, Stethoscope, Users } from "lucide-react";
import LoginForm from "@/components/auth/LoginForm";
import RegisterForm from "@/components/auth/RegisterForm";
const PatientDashboard = lazy(() =>
  import("@/components/patient/PatientDashboard")
);

const DoctorDashboard = lazy(() =>
  import("@/components/doctor/DoctorDashboard")
);

const AdminDashboard = lazy(() =>
  import("@/components/admin/AdminDashboard")
);

const Index = () => {
  // ✅ CHANGED admin → doctor
  const [userRole, setUserRole] = useState<'patient' | 'doctor' | 'admin' | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentView, setCurrentView] = useState<'login' | 'register'>('login');

  // ✅ Restore auth state
  // ✅ Wake Railway + Restore auth state
useEffect(() => {
  const initializeApp = async () => {
    try {
      // Wake Render backend
      await axios.get(
        `${API_URL}/api/auth/`,
        {
          timeout: 15000,
        }
      );

      console.log(
        "Render backend awake"
      );
    } catch (err) {
      console.log(
        "Backend wakeup failed"
      );
    }

    // Restore login session
    const token =
      localStorage.getItem(
        "access_token"
      );

    const role =
      localStorage.getItem(
        "user_role"
      ) as
        | "patient"
        | "doctor"
        | "admin"
        | null;

    if (token && role) {
      setUserRole(role);
      setIsAuthenticated(true);
    }
  };

  initializeApp();
}, []);

  // ✅ UPDATED TYPE
  const handleLogin = (role: 'patient' | 'doctor' | 'admin') => {
    setUserRole(role);
    setIsAuthenticated(true);
    localStorage.setItem("user_role", role);
  };

  const handleLogout = () => {
    setUserRole(null);
    setIsAuthenticated(false);
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("picture");
  };

  // ✅ MAIN LOGIC UPDATED
   if (isAuthenticated && userRole) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-lg">
          Loading dashboard...
        </div>
      }
    >
      {userRole === "patient" && (
        <PatientDashboard
          onLogout={handleLogout}
        />
      )}

      {userRole === "doctor" && (
        <DoctorDashboard
          onLogout={handleLogout}
        />
      )}

      {userRole === "admin" && (
        <AdminDashboard
          onLogout={handleLogout}
        />
      )}
    </Suspense>
  );
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-blue-100">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-blue-900">MediCore AI</h1>
                <p className="text-sm text-blue-600">Intelligent Health Diagnosis</p>
              </div>
            </div>
            <Badge
              variant="outline"
              className="self-start border-blue-200 text-blue-700 sm:self-auto"
            >
              AI-Powered Healthcare
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="mb-10 text-center sm:mb-12">
            <h2 className="mb-4 text-3xl font-bold text-blue-900 sm:text-4xl lg:text-5xl">
              AI-Powered Medical Diagnosis Assistant
            </h2>
            <p className="mx-auto mb-8 max-w-3xl text-base text-blue-700 sm:text-lg">
              Get instant health recommendations based on your symptoms. Our advanced AI analyzes your 
              condition and provides comprehensive medical insights, treatment suggestions, and specialist recommendations.
            </p>
          </div>

          {/* Features Grid */}
          <div className="mb-10 grid gap-4 sm:gap-6 md:grid-cols-3 sm:mb-12">
            <Card className="border-blue-200 hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-blue-100 rounded-full w-fit mb-3">
                  <Stethoscope className="h-6 w-6 text-blue-600" />
                </div>
                <CardTitle className="text-blue-900">Symptom Analysis</CardTitle>
                <CardDescription>
                  Advanced AI analyzes your symptoms to identify possible conditions
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-blue-200 hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-green-100 rounded-full w-fit mb-3">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="text-blue-900">Detailed Reports</CardTitle>
                <CardDescription>
                  Get comprehensive PDF reports with treatment recommendations
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-blue-200 hover:shadow-lg transition-shadow">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-purple-100 rounded-full w-fit mb-3">
                  <Shield className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="text-blue-900">Secure & Private</CardTitle>
                <CardDescription>
                  Your health data is protected with enterprise-grade security
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Authentication Section */}
          <div className="max-w-md mx-auto">
            <Card className="border-blue-200 shadow-lg">
              <CardHeader className="text-center">
                <CardTitle className="text-xl text-blue-900 sm:text-2xl">
                  {currentView === 'login' ? 'Sign In' : 'Create Account'}
                </CardTitle>
                <CardDescription>
                  {currentView === 'login' 
                    ? 'Access your medical dashboard' 
                    : 'Join thousands of users getting AI-powered health insights'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={currentView} onValueChange={(value) => setCurrentView(value as 'login' | 'register')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="login">Sign In</TabsTrigger>
                    <TabsTrigger value="register">Register</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login">
                    <LoginForm onLogin={handleLogin} />
                  </TabsContent>
                  <TabsContent value="register">
                    <RegisterForm onRegister={() => setCurrentView('login')} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          {/* Stats Section */}
          <div className="mt-10 grid grid-cols-2 gap-4 sm:mt-12 md:grid-cols-4">
            <div className="rounded-lg bg-white/70 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-900">10,000+</div>
              <div className="text-blue-600 text-sm">Patients Served</div>
            </div>
            <div className="rounded-lg bg-white/70 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-900">95%</div>
              <div className="text-blue-600 text-sm">Accuracy Rate</div>
            </div>
            <div className="rounded-lg bg-white/70 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-900">24/7</div>
              <div className="text-blue-600 text-sm">AI Support</div>
            </div>
            <div className="rounded-lg bg-white/70 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-900">200+</div>
              <div className="text-blue-600 text-sm">Conditions Detected</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;
