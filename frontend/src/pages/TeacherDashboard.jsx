// src/pages/TeacherDashboard.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import * as coursesApi from "../api/courses";

export default function TeacherDashboard() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    coursesApi.listTeachingCourses()
      .then(({ data }) => setCourses(data))
      .catch(() => setError("Couldn't load your courses."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">Your assigned courses</h1>

      {error && (
        <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-[#6B6B6B]">Loading…</p>
      ) : courses.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-8 text-center">
          <p className="text-[#6B6B6B] text-sm">
            You haven't been assigned to any courses yet. Contact an admin.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.map((course) => (
            <Link
              key={course.id}
              to={`/teacher/courses/${course.id}`}
              className="bg-white rounded-xl border border-[#E8E4DC] p-5 hover:border-[#1F4E3D] transition-colors"
            >
              <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
              <h3 className="font-serif text-lg text-[#1A1A1A]">{course.name}</h3>
              {course.description && (
                <p className="text-sm text-[#6B6B6B] mt-1 line-clamp-2">{course.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}