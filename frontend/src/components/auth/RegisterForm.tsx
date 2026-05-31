import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, EyeOff, Mail, Lock, User, Phone, MapPin } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_URL } from "@/lib/api";

interface RegisterFormProps {
  onRegister: () => void;
}

const RegisterForm = ({ onRegister }: RegisterFormProps) => {
  const [userType, setUserType] = useState<"patient" | "doctor">("patient");

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    username: "",
    password: "",
    confirmPassword: "",
    phone: "",
    age: "",
    gender: "",
    address: "",

    experience: "",
    field: "",
    documents: [] as File[],
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  const {
    username,
    password,
    confirmPassword,
    first_name,
    last_name,
  } = formData;

  if (!username || !password || !confirmPassword || !first_name || !last_name) {
    toast.error("Please fill in all required fields");
    return;
  }

  if (password !== confirmPassword) {
    toast.error("Passwords don't match");
    return;
  }

  try {
    // 🔥 CREATE FORMDATA (IMPORTANT)
    const formDataToSend = new FormData();

    formDataToSend.append("username", formData.username);
    formDataToSend.append("password", formData.password);
    formDataToSend.append("first_name", formData.first_name);
    formDataToSend.append("last_name", formData.last_name);
    formDataToSend.append("phone", formData.phone);
    formDataToSend.append("age", formData.age);
    formDataToSend.append("gender", formData.gender);
    formDataToSend.append("address", formData.address);
    formDataToSend.append("role", userType);

    if (userType === "doctor") {
      formDataToSend.append("experience", formData.experience);
      formDataToSend.append("field", formData.field);

      // 🔥 MOST IMPORTANT PART
      formData.documents.forEach((file: File) => {
        formDataToSend.append("documents", file);
      });
    }

    await axios.post(
      `${API_URL}/api/auth/register/`,
      formDataToSend,
      {
        headers: {
          "Content-Type": "multipart/form-data", // 🔥 REQUIRED
        },
      }
    );

    toast.success("Account created successfully! Please sign in.");
    onRegister();
  } catch (err: any) {
    console.error(err);
    toast.error(err.response?.data?.error || "Registration failed");
  }
};

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* TOGGLE */}
      <div>
        <Label>Register as</Label>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setUserType("patient")}
            className={`rounded px-4 py-2 text-sm font-medium ${
              userType === "patient" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            Patient
          </button>

          <button
            type="button"
            onClick={() => setUserType("doctor")}
            className={`rounded px-4 py-2 text-sm font-medium ${
              userType === "doctor" ? "bg-blue-600 text-white" : "bg-gray-200"
            }`}
          >
            Doctor
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <Label>First Name *</Label>
          <Input
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
          />
        </div>
        <div>
          <Label>Last Name *</Label>
          <Input
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label>Email *</Label>
        <Input
          value={formData.username}
          onChange={(e) => setFormData({ ...formData, username: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Phone"
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
        />
        <Input
          placeholder="Age"
          value={formData.age}
          onChange={(e) => setFormData({ ...formData, age: e.target.value })}
        />
      </div>

      <Select
        onValueChange={(value) => setFormData({ ...formData, gender: value })}
      >
        <SelectTrigger>
          <SelectValue placeholder="Gender" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="male">Male</SelectItem>
          <SelectItem value="female">Female</SelectItem>
        </SelectContent>
      </Select>

      <Input
        placeholder="Address"
        value={formData.address}
        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
      />

      {/* DOCTOR FIELDS */}
      {userType === "doctor" && (
        <>
          <Input
            placeholder="Years of Experience"
            value={formData.experience}
            onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
          />

          <Input
            placeholder="Specialization"
            value={formData.field}
            onChange={(e) => setFormData({ ...formData, field: e.target.value })}
          />

          <div>
            <Label>Upload Documents</Label>
            <Input
              type="file"
              multiple
              onChange={(e) => {
                const newFiles = Array.from(e.target.files || []);

                const uniqueFiles = [
                  ...formData.documents,
                  ...newFiles.filter(
                    (file) =>
                      !formData.documents.some((f) => f.name === file.name)
                  ),
                ];

                setFormData({
                  ...formData,
                  documents: uniqueFiles,
                });

                e.target.value = "";
              }}
            />
          </div>
          {formData.documents && formData.documents.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto rounded border p-2">
              <p className="text-sm font-semibold mb-1">Selected Documents:</p>

              {formData.documents.map((file: File, index: number) => (
                <div
                  key={index}
                  className="flex flex-col gap-2 py-1 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="break-all">{file.name}</span>

                  {/* ❌ REMOVE FILE BUTTON (BONUS) */}
                  <button
                    type="button"
                    onClick={() => {
                      const updated = formData.documents.filter((_, i) => i !== index);
                      setFormData({ ...formData, documents: updated });
                    }}
                    className="text-red-500 text-xs"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PASSWORD WITH EYE */}
      <div>
        <Label>Password *</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            className="pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-3 text-gray-400"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* CONFIRM PASSWORD WITH EYE */}
      <div>
        <Label>Confirm Password *</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            type={showConfirmPassword ? "text" : "password"}
            placeholder="Confirm Password"
            value={formData.confirmPassword}
            onChange={(e) =>
              setFormData({ ...formData, confirmPassword: e.target.value })
            }
            className="pl-10 pr-10"
          />
          <button
            type="button"
            onClick={() =>
              setShowConfirmPassword(!showConfirmPassword)
            }
            className="absolute right-3 top-3 text-gray-400"
          >
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <Button className="w-full">Create Account</Button>
    </form>
  );
};

export default RegisterForm;
