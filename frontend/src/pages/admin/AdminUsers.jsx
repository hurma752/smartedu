// src/pages/admin/AdminUsers.jsx
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import * as adminApi from "../../api/admin";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "student" });
  const [error, setError] = useState("");

  const loadUsers = () => adminApi.listUsers().then(({ data }) => setUsers(data));

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await adminApi.createUser(form);
      setForm({ full_name: "", email: "", password: "", role: "student" });
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create account.");
    }
  };

  const handleDeactivate = async (userId) => {
    if (!confirm("Deactivate this account? They won't be able to log in.")) return;
    await adminApi.deactivateUser(userId);
    loadUsers();
  };

  const handleActivate = async (userId) => {
  await adminApi.activateUser(userId);
  loadUsers();
};

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#1A1A1A]">Users</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Cancel" : "New account"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-[#E8E4DC] p-5 mb-6 space-y-3">
          {error && <p className="text-sm text-[#9B3A30]">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Full name" required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <input type="email" placeholder="Email" required value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <input type="password" placeholder="Temporary password" required value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30">
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
          <button className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Create account
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border border-[#E8E4DC] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#F7F5F2] text-[#6B6B6B] text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[#EFEBE3]">
                <td className="px-4 py-2.5 text-[#1A1A1A]">{u.full_name}</td>
                <td className="px-4 py-2.5 text-[#6B6B6B]">{u.email}</td>
                <td className="px-4 py-2.5 capitalize text-[#6B6B6B]">{u.role}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? "bg-[#E3F0E8] text-[#1F4E3D]" : "bg-[#F1EEE7] text-[#A8A199]"}`}>
                    {u.is_active ? "Active" : "Deactivated"}
                  </span>
                </td>
               <td className="px-4 py-2.5 text-right">
  {u.role !== "admin" && (
    u.is_active ? (
      <button onClick={() => handleDeactivate(u.id)} className="text-xs text-[#9B3A30] hover:underline">
        Deactivate
      </button>
    ) : (
      <button onClick={() => handleActivate(u.id)} className="text-xs text-[#1F4E3D] hover:underline">
        Reactivate
      </button>
    )
  )}
</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  );
}