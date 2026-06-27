// src/pages/StudentDashboard.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import * as coursesApi from "../api/courses";

export default function StudentDashboard() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    coursesApi.listEnrolledCourses().then(({ data }) => {
      setCourses(data);
      setLoading(false);
    });
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">Your courses</h1>

      {loading ? (
        <p className="text-sm text-[#6B6B6B]">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-8 text-center">
          <p className="text-[#6B6B6B] text-sm">
            You're not enrolled in any courses yet. Ask your teacher to add you.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/student/courses/${course.id}`}
              className="bg-white rounded-xl border border-[#E8E4DC] p-5 hover:border-[#1F4E3D] transition-colors"
            >
              <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
              <h3 className="font-serif text-lg text-[#1A1A1A]">{course.name}</h3>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}