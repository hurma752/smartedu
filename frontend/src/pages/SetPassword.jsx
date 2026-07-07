// src/pages/SetPassword.jsx
import { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import * as passwordApi from "../api/password";

export default function SetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen bg-[#F7F7F9] flex items-center justify-center px-4">
        <div className="bg-white rounded-[18px] p-6 max-w-sm text-center border border-[#E4E4E8]">
          <p className="text-sm text-[#C0392B]">
            This link is missing required information. Please use the link from your email.
          </p>
          <Link to="/login" className="text-[#6C72E0] text-sm mt-3 inline-block hover:underline">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await passwordApi.setPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "This link is invalid or has expired. Please request a new one."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F7F9] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-[#1A1A1F] text-center mb-6">
          Set your password
        </h1>

        <div className="bg-white rounded-[18px] shadow-sm border border-[#E4E4E8] p-6">
          {success ? (
            <div className="text-center">
              <p className="text-sm text-[#1F7A3D] mb-2">Password set successfully.</p>
              <p className="text-xs text-[#6B6B76]">Redirecting to login…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-[#FBEAEA] text-[#C0392B] text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-[#1A1A1F] mb-1">
                  New password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#F0F0F3] border border-transparent rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 focus:bg-white focus:border-[#E4E4E8] transition-colors"
                  placeholder="Minimum 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1A1F] mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-[#F0F0F3] border border-transparent rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 focus:bg-white focus:border-[#E4E4E8] transition-colors"
                  placeholder="Repeat your password"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#6C72E0] hover:bg-[#5A60D6] disabled:opacity-50 text-white font-semibold rounded-[10px] py-2.5 text-sm transition-colors"
              >
                {loading ? "Setting password…" : "Set password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-[#6B6B76] mt-4">
          <Link to="/login" className="text-[#6C72E0] font-medium hover:underline">
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}