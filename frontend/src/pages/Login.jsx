// src/pages/Login.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { loginUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't sign in. Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F5F2] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-[#1F4E3D] text-[#F7F5F2] font-serif text-xl mb-4">
            S
          </div>
          <h1 className="text-2xl font-serif text-[#1A1A1A]">Sign in to SmartEdu</h1>
          <p className="text-sm text-[#6B6B6B] mt-1">Your courses, assignments, and chatbot in one place.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#E8E4DC] p-6 space-y-4">
          {error && (
            <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D]"
              placeholder="you@university.edu"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1A1A1A] mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30 focus:border-[#1F4E3D]"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1F4E3D] hover:bg-[#173B2E] disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

      
      </div>
    </div>
  );
}