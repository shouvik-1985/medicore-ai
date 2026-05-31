import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Edit,
  Save,
  X,
  Droplet,
  Ruler,
  Weight,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { API_URL } from "@/lib/api";

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

interface PatientProfileProps {
  patientData: PatientData;
  onProfileUpdate: (patientData: PatientData) => void;
}

const emptyContact = { name: "", relation: "", phone: "" };

const PatientProfile = ({ patientData, onProfileUpdate }: PatientProfileProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(patientData);
  const [profilePicture, setProfilePicture] = useState(
    localStorage.getItem("picture") || ""
  );

  useEffect(() => {
    setFormData(patientData);
  }, [patientData]);

  const normalizeContacts = (contacts: PatientData["emergencyContacts"]) =>
    contacts
      .map((contact) => ({
        name: (contact.name || "").trim(),
        relation: (contact.relation || "").trim(),
        phone: (contact.phone || "").trim(),
      }))
      .filter((contact) => contact.name || contact.relation || contact.phone);

  const handleSave = async () => {
  try {
    const token = localStorage.getItem("access_token");
    const [first_name = "", last_name = ""] = formData.name.trim().split(" ", 2);
    const emergencyContacts = normalizeContacts(formData.emergencyContacts);

    const updatedData = {
      first_name,
      last_name,
      age: formData.age,
      gender: formData.gender?.toLowerCase(),
      phone: formData.phone,
      address: formData.address,
      height: formData.height,
      weight: formData.weight,
      blood_type: formData.bloodType,
      emergency_contacts: emergencyContacts,
    };

    const response = await axios.put(`${API_URL}/api/auth/profile/`, updatedData, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    const savedProfile: PatientData = {
      name: response.data.name,
      email: response.data.email,
      age: response.data.age,
      gender: response.data.gender,
      phone: response.data.phone,
      address: response.data.address,
      height: response.data.height,
      weight: response.data.weight,
      bloodType: response.data.blood_type,
      emergencyContacts: (response.data.emergency_contacts || []).map((contact: any) => ({
        name: contact.name || "",
        relation: contact.relation || "",
        phone: contact.phone || "",
      })),
    };

    toast.success("Profile updated successfully!");
    setFormData(savedProfile);
    onProfileUpdate(savedProfile);
    setIsEditing(false);
  } catch (err: any) {
    console.error("Update failed:", err.response?.data || err.message);
    toast.error("Failed to update profile");
  }
};

  const handleCancel = () => {
    setFormData(patientData);
    setIsEditing(false);
  };

  const calculateBMI = () => {
    const h = parseFloat(formData.height);
    const w = parseFloat(formData.weight);
    if (!h || !w || isNaN(h) || isNaN(w)) return "";
    const bmi = w / ((h / 100) ** 2);
    return bmi.toFixed(1);
  };

  const updateEmergencyContact = (
    index: number,
    field: "name" | "relation" | "phone",
    value: string
  ) => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((contact, contactIndex) =>
        contactIndex === index ? { ...contact, [field]: value } : contact
      ),
    }));
  };

  const addEmergencyContact = () => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: [...prev.emergencyContacts, { ...emptyContact }],
    }));
  };

  const removeEmergencyContact = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter((_, contactIndex) => contactIndex !== index),
    }));
  };

  const healthMetrics = [
    {
      label: "Blood Type",
      value: formData.bloodType,
      color: "bg-red-100 text-red-700",
    },
    {
      label: "Height",
      value: formData.height ? `${formData.height} cm` : "",
      color: "bg-blue-100 text-blue-700",
    },
    {
      label: "Weight",
      value: formData.weight ? `${formData.weight} kg` : "",
      color: "bg-green-100 text-green-700",
    },
    {
      label: "BMI",
      value: calculateBMI(),
      color: "bg-yellow-100 text-yellow-700",
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-blue-200">
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profilePicture} />
                <AvatarFallback className="bg-blue-100 text-blue-700 text-lg">
                  {formData.name.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-blue-900">
                  {formData.name || "Patient"}
                </CardTitle>
                <CardDescription>Patient ID: PAT001234</CardDescription>
                <Badge className="mt-1 bg-green-100 text-green-700">
                  Active Patient
                </Badge>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!isEditing ? (
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="outline"
                  className="w-full border-blue-200 sm:w-auto"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Profile
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleSave}
                    className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </Button>
                  <Button onClick={handleCancel} variant="outline" className="w-full sm:w-auto">
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900 flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                {isEditing ? (
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-blue-700 font-medium">{formData.name}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    disabled
                    className="pl-10 bg-gray-100 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="age">Age</Label>
                  {isEditing ? (
                    <Input
                      id="age"
                      type="number"
                      value={formData.age}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          age: parseInt(e.target.value),
                        })
                      }
                    />
                  ) : (
                    <p className="text-blue-700 font-medium">
                      {formData.age} years
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="gender">Gender</Label>
                  {isEditing ? (
                    <Select
                      value={formData.gender}
                      onValueChange={(value) =>
                        setFormData({ ...formData, gender: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-blue-700 font-medium">
                      {formData.gender}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                {isEditing ? (
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                ) : (
                  <p className="text-blue-700 font-medium">
                    {formData.phone}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="address">Address</Label>
                {isEditing ? (
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData({ ...formData, address: e.target.value })
                      }
                      className="pl-10"
                    />
                  </div>
                ) : (
                  <p className="text-blue-700 font-medium">
                    {formData.address}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="bloodType">Blood Type</Label>
                {isEditing ? (
                  <div className="relative">
                    <Droplet className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="bloodType"
                      value={formData.bloodType}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          bloodType: e.target.value,
                        })
                      }
                      className="pl-10"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {isEditing && (
                  <>
                    <div>
                      <Label htmlFor="height">Height (cm)</Label>
                      <div className="relative">
                        <Ruler className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="height"
                          value={formData.height}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              height: e.target.value,
                            })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="weight">Weight (kg)</Label>
                      <div className="relative">
                        <Weight className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          id="weight"
                          value={formData.weight}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              weight: e.target.value,
                            })
                          }
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="text-green-800">Health Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {healthMetrics.map((metric, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${metric.color}`}
                  >
                    <p className="text-sm font-medium">{metric.label}</p>
                    <p className="text-lg font-bold">
                      {metric.value || "--"}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-orange-200">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-orange-800">
                  Emergency Contacts
                </CardTitle>
                {isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-orange-200 text-orange-800 sm:w-auto"
                    onClick={addEmergencyContact}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Consultant
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {formData.emergencyContacts.length === 0 ? (
                  <div className="rounded-lg bg-orange-50 p-4 text-sm text-orange-700">
                    No emergency contacts saved yet.
                  </div>
                ) : (
                  formData.emergencyContacts.map((contact, index) => (
                    <div
                      key={index}
                      className="rounded-lg bg-orange-50 p-3"
                    >
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              value={contact.name}
                              onChange={(e) =>
                                updateEmergencyContact(index, "name", e.target.value)
                              }
                              placeholder="Consultant name"
                              className="border-orange-200 bg-white"
                            />
                            <Input
                              value={contact.relation}
                              onChange={(e) =>
                                updateEmergencyContact(index, "relation", e.target.value)
                              }
                              placeholder="Relation or specialty"
                              className="border-orange-200 bg-white"
                            />
                          </div>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <Input
                              value={contact.phone}
                              onChange={(e) =>
                                updateEmergencyContact(index, "phone", e.target.value)
                              }
                              placeholder="Phone number"
                              className="border-orange-200 bg-white"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full border-orange-200 text-orange-800 sm:w-auto"
                              onClick={() => removeEmergencyContact(index)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium text-orange-900">
                              {contact.name || "Consultant"}
                            </p>
                            <p className="text-sm text-orange-700">
                              {contact.relation || "Saved Contact"}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-orange-800">
                            {contact.phone}
                          </p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default PatientProfile;
