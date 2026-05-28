import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";

export default function DoctorProfile() {
  const [profile, setProfile] = useState<any>({});
  const [fee, setFee] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      const res = await axios.get(`${API_URL}/api/auth/profile/`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      });

      setProfile(res.data);
      setFee(res.data.consultation_fee || "");
    };

    fetchProfile();
  }, []);

  const handleSave = async () => {
    await axios.put(
      `${API_URL}/api/auth/profile/`,
      { consultation_fee: fee },
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("access_token")}`,
        },
      }
    );

    alert("Saved");
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Doctor Profile</h2>

      <p><b>Name:</b> {profile.user?.first_name}</p>
      <p><b>Email:</b> {profile.user?.username}</p>

      <input
        type="number"
        placeholder="Consultation Fee"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        className="border p-2 mt-3 w-full"
      />

      <button
        onClick={handleSave}
        className="bg-blue-600 text-white px-4 py-2 mt-3 rounded"
      >
        Save
      </button>
    </div>
  );
}