import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { API_URL } from "@/lib/api";

interface LoginFormProps {
  onLogin: (role: "patient" | "doctor" | "admin") => void;
}

const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // 🔥 ADMIN LOGIN (ADD THIS BLOCK)

  try {
    const res = await axios.post(`${API_URL}/api/auth/login/`, {
      username: formData.email,
      password: formData.password,
    });
    
    console.log("LOGIN RESPONSE:", res.data);

    const { access, refresh, role } = res.data;

    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", refresh);
    localStorage.setItem("user_role", role);

    toast.success("Login successful");

    // wait a little before dashboard mounts
    setTimeout(() => {
      onLogin(role);
    }, 300);
  } catch (err: any) {
    toast.error(err.response?.data?.error || "Login failed");
  }
};

  interface GoogleLoginResponse {
    access: string;
    refresh: string;
    user: {
      name?: string;
      username?: string;
    };
  }

  const handleGoogleLogin = async (credentialResponse: any) => {
    const idToken = credentialResponse.credential;

    try {
      const response = await axios.post<GoogleLoginResponse>(
        `${API_URL}/api/auth/google-login/`,
        {
          id_token: idToken,
        }
      );

      const { access, refresh, user } = response.data;

      localStorage.setItem("access_token", access);
      localStorage.setItem("refresh_token", refresh);
      localStorage.setItem("user_role", "patient");

      toast.success(`Welcome ${user.name || user.username}`);

      // prevent first-load auth race
      setTimeout(() => {
        onLogin("patient");
      }, 300);
    } catch (err) {
      console.error("Google login error:", err);
      toast.error("Google login failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">

        {/* Email */}
        <div>
          <Label htmlFor="email">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              className="pl-10"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
              className="pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Email Login Button */}
      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
        Sign In
      </Button>

      {/* Divider */}
      <div className="text-center text-sm text-gray-500">OR</div>

      {/* Google Login */}
      <div className="flex justify-center overflow-x-auto">
        <GoogleLogin
          onSuccess={handleGoogleLogin}
          onError={() => toast.error("Login failed")}
        />
      </div>

      {/* Demo Box */}
      <Card className="bg-blue-50 border-blue-200 mt-4">
        <CardContent className="pt-4">
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-2">Important Remarks</p>
            <p>
              <strong>Patient:</strong> Use Google Sign-In
            </p>
            <p>
              <strong>Doctor:</strong> Only manual registration no Google Sign-In.
            </p>
            <p className="text-red-500">
              <strong>Confirmation:</strong> After registration, you will receive a confirmation email. Please wait for admin approval before logging in.
            </p>
          </div>
        </CardContent>
      </Card>
    </form>
  );
};

export default LoginForm;
