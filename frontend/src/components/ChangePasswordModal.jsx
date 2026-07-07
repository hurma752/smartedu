// src/components/ChangePasswordModal.jsx
import { useState } from "react";
import * as passwordApi from "../api/password";

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await passwordApi.changePassword(current, next);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't change password.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-[18px] p-6 w-full max-w-sm shadow-lg">
        <h2 className="font-semibold text-lg text-[#1A1A1F] mb-4">Change password</h2>
        {success ? (
          <>
            <p className="text-sm text-[#1F7A3D] mb-4">Password changed successfully.</p>
            <button onClick={onClose} className="text-sm text-[#6B6B76] hover:underline">Close</button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <div className="bg-[#FBEAEA] text-[#C0392B] text-sm rounded-lg px-3 py-2">{error}</div>}
            <input
              type="password" placeholder="Current password" required
              value={current} onChange={(e) => setCurrent(e.target.value)}
              className="w-full bg-[#F0F0F3] rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 transition-colors"
            />
            <input
              type="password" placeholder="New password (min 8 characters)" required
              value={next} onChange={(e) => setNext(e.target.value)}
              className="w-full bg-[#F0F0F3] rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 transition-colors"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-[#6C72E0] hover:bg-[#5A60D6] text-white text-sm font-semibold rounded-[10px] py-2.5 transition-colors"
              >
                Change password
              </button>
              <button
                type="button" onClick={onClose}
                className="text-sm text-[#6B6B76] hover:underline px-3"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}