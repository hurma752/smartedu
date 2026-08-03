// src/pages/TeacherDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell } from "../components/Layout";
import * as coursesApi from "../api/courses";
import { getErrorMessage } from "../utils/errorMessage";
import { C, T } from "../theme";

export default function TeacherDashboard() {
  const [courses,       setCourses]       = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    coursesApi.listTeachingCourses()
      .then(async ({ data }) => {
        setCourses(data);

        // The teacher courses endpoint does NOT include student_count.
        // Fetch each course's roster in parallel and sum the lengths.
        try {
          const sizes = await Promise.all(
            data.map((c) =>
              coursesApi.listRoster(c.id)
                .then(({ data: roster }) => roster.length)
                .catch(() => 0)
            )
          );
          setTotalStudents(sizes.reduce((a, b) => a + b, 0));
        } catch {
          // Non-fatal — stat card stays at 0
        }
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your courses.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageShell title="Dashboard" subtitle="Your assigned courses">

        {error && (
          <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "22px", fontSize: "14px", display: "flex", gap: "9px", alignItems: "flex-start" }}>
            <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
            {error}
          </div>
        )}

        {/* ── Stat bar ── */}
        {!loading && courses.length > 0 && (
          <div className="animate-fade-in" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "32px" }}>
            <StatCard label="Assigned courses" value={courses.length}  accent={C.statCourses} icon="ti-books" />
            <StatCard label="Total students"   value={totalStudents}   accent={C.statStudents} icon="ti-users" />
          </div>
        )}

        {/* ── Course list ── */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="skeleton-shimmer" style={{ height: "72px", width: "100%" }} />
            <div className="skeleton-shimmer" style={{ height: "72px", width: "100%" }} />
          </div>
        ) : courses.length === 0 ? (
          <div className="animate-fade-in" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "56px 32px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "36px", color: C.border, display: "block", marginBottom: "14px" }} />
            <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, marginBottom: "6px" }}>No courses assigned</p>
            <p style={{ fontSize: "14px", color: C.textMuted }}>Contact an admin to get assigned to a course.</p>
          </div>
        ) : (
          <div className="animate-fade-in" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            {courses.map((course, i) => (
              <CourseRow
                key={course.id}
                course={course}
                last={i === courses.length - 1}
                onClick={() => navigate(`/teacher/courses/${course.id}`)}
              />
            ))}
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function StatCard({ label, value, accent, icon }) {
  return (
    <div className="card-hover-elevate" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, borderLeft: `4px solid ${accent}`, padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em", textTransform: "uppercase", color: C.textMuted, margin: 0 }}>{label}</p>
        <i className={`ti ${icon}`} style={{ fontSize: "18px", color: C.textMuted }} />
      </div>
      <p style={{ fontSize: "32px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: 1, color: C.textPrimary, margin: 0 }}>{value}</p>
    </div>
  );
}

function CourseRow({ course, last, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, cursor: "pointer", transition: "all 0.15s ease", gap: "16px" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "4px 8px", borderRadius: "5px", letterSpacing: "0.04em", flexShrink: 0 }}>
          {course.code}
        </span>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course.name}</p>
          {course.description && (
            <p style={{ fontSize: "12px", color: C.textMuted, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{course.description}</p>
          )}
        </div>
      </div>
      <i className="ti ti-arrow-right" style={{ fontSize: "16px", color: hovered ? C.accent : C.textMuted, transform: hovered ? "translateX(3px)" : "none", transition: "all 0.15s ease", flexShrink: 0 }} />
    </div>
  );
}