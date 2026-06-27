// src/pages/admin/AdminCourses.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout";
import * as adminApi from "../../api/admin";

export default function AdminCourses() {
  const [courses, setCourses] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  const [error, setError] = useState("");

  const loadCourses = () => adminApi.listAllCourses().then(({ data }) => setCourses(data));

  useEffect(() => {
    loadCourses();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await adminApi.createCourse(form);
      setForm({ name: "", code: "", description: "" });
      setShowForm(false);
      loadCourses();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't create course.");
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-serif text-[#1A1A1A]">Courses</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {showForm ? "Cancel" : "New course"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border border-[#E8E4DC] p-5 mb-6 space-y-3">
          {error && <p className="text-sm text-[#9B3A30]">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Course name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <input placeholder="Course code" required value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
          </div>
          <textarea placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" rows={2} />
          <button className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            Create course
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((course) => (
          <Link key={course.id} to={`/admin/courses/${course.id}`}
            className="bg-white rounded-xl border border-[#E8E4DC] p-5 hover:border-[#1F4E3D] transition-colors">
            <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
            <h3 className="font-serif text-lg text-[#1A1A1A]">{course.name}</h3>
            <div className="flex items-center gap-3 mt-3 text-xs text-[#6B6B6B]">
              <span>{course.teachers?.length || 0} teacher{course.teachers?.length === 1 ? "" : "s"}</span>
              <span>·</span>
              <span>{course.student_count} student{course.student_count === 1 ? "" : "s"}</span>
            </div>
          </Link>
        ))}
      </div>
    </Layout>
  );
}