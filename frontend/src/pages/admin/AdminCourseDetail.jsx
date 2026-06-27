// src/pages/admin/AdminCourseDetail.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import * as adminApi from "../../api/admin";

export default function AdminCourseDetail() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [teacherEmail, setTeacherEmail] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [error, setError] = useState("");

  const loadCourse = useCallback(async () => {
    const { data } = await adminApi.listAllCourses();
    setCourse(data.find((c) => c.id === Number(courseId)));
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const handleAssignTeacher = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await adminApi.assignTeacher(courseId, teacherEmail);
      setTeacherEmail("");
      loadCourse();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't assign teacher.");
    }
  };

  const handleEnrollStudent = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await adminApi.enrollStudent(courseId, studentEmail);
      setStudentEmail("");
      loadCourse();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't enroll student.");
    }
  };

  if (!course) return <Layout><p className="text-sm text-[#6B6B6B]">Loading…</p></Layout>;

  return (
    <Layout>
      <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">{course.name}</h1>

      {error && <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          <h2 className="font-serif text-lg text-[#1A1A1A] mb-4">Assigned teachers</h2>
          <form onSubmit={handleAssignTeacher} className="flex gap-2 mb-4">
            <input type="email" required placeholder="teacher@university.edu" value={teacherEmail}
              onChange={(e) => setTeacherEmail(e.target.value)}
              className="flex-1 border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <button className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
              Assign
            </button>
          </form>
          {course.teachers?.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">No teacher assigned yet.</p>
          ) : (
            <ul className="space-y-2">
              {course.teachers.map((t) => (
                <li key={t.id} className="border border-[#EFEBE3] rounded-lg px-3 py-2">
                  <p className="text-sm text-[#1A1A1A]">{t.full_name}</p>
                  <p className="text-xs text-[#A8A199]">{t.email}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          <h2 className="font-serif text-lg text-[#1A1A1A] mb-4">Enroll students</h2>
          <form onSubmit={handleEnrollStudent} className="flex gap-2 mb-4">
            <input type="email" required placeholder="student@university.edu" value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              className="flex-1 border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30" />
            <button className="bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
              Enroll
            </button>
          </form>
          <p className="text-sm text-[#6B6B6B]">{course.student_count} student{course.student_count === 1 ? "" : "s"} enrolled.</p>
        </div>
      </div>
    </Layout>
  );
}