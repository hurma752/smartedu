// src/components/Layout.jsx
import { useAuth } from "../context/AuthContext";

export default function Layout({ children }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      <nav className="bg-white border-b border-[#E8E4DC] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#1F4E3D] text-white font-serif flex items-center justify-center text-sm">
            S
          </div>
          <span className="font-serif text-lg text-[#1A1A1A]">SmartEdu</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[#6B6B6B]">
            {user?.fullName} <span className="text-[#A8A199]">· {user?.role}</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-[#9B3A30] hover:underline"
          >
            Sign out
          </button>
        </div>
      </nav>
      <main className="px-6 py-8 max-w-5xl mx-auto">{children}</main>
    </div>
  );
}