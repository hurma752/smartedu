// src/pages/admin/AdminDashboard.jsx
import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import * as adminApi from "../../api/admin";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([adminApi.listUsers(), adminApi.listAllCourses()]).then(
      ([usersRes, coursesRes]) => {
        setUsers(usersRes.data);
        setCourses(coursesRes.data);
        setLoading(false);
      }
    );
  }, []);

  const teacherCount = users.filter((u) => u.role === "teacher").length;
  const studentCount = users.filter((u) => u.role === "student").length;

  if (loading) return <Layout><p className="text-sm text-[#6B6B6B]">Loading…</p></Layout>;

  return (
    <Layout>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">Admin overview</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Courses", value: courses.length },
          { label: "Teachers", value: teacherCount },
          { label: "Students", value: studentCount },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E8E4DC] p-5">
            <p className="text-3xl font-serif text-[#1F4E3D]">{stat.value}</p>
            <p className="text-sm text-[#6B6B6B] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <a href="/admin/courses" className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Manage courses
        </a>
        <a href="/admin/users" className="bg-white border border-[#D8D3C8] hover:border-[#1F4E3D] text-[#1A1A1A] text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Manage users
        </a>
      </div>
    </Layout>
  );
}