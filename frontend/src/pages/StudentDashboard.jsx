// src/pages/StudentDashboard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout, { PageShell } from "../components/Layout";
import * as coursesApi from "../api/courses";
import * as badgesApi from "../api/badges";
import BadgePill from "../components/BadgePill";
import { getErrorMessage } from "../utils/errorMessage";
import { C } from "../theme";

export default function StudentDashboard() {
  const [courses, setCourses] = useState([]);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      coursesApi.listEnrolledCourses(),
      badgesApi.getMyBadges().catch(() => ({ data: [] })),
    ])
      .then(([{ data: cData }, { data: bData }]) => {
        setCourses(cData);
        setBadges(bData || []);
      })
      .catch((err) => setError(getErrorMessage(err, "Couldn't load your courses.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <PageShell title="My Dashboard" subtitle="Courses and earned achievements">
        {error && (
          <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "20px", fontSize: "14px", display: "flex", gap: "8px" }}>
            <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0 }} />{error}
          </div>
        )}

        {/* Earned Badges Showcase */}
        {badges.length > 0 && (
          <div className="animate-fade-in card-hover-elevate" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "16px 20px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              <i className="ti ti-award" style={{ fontSize: "18px", color: C.accent }} />
              <h3 style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: 0 }}>
                Earned Achievements ({badges.length})
              </h3>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {badges.map((b) => (
                <BadgePill key={b.id} badge={b} size="md" />
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="skeleton-shimmer" style={{ height: "72px", width: "100%" }} />
            <div className="skeleton-shimmer" style={{ height: "72px", width: "100%" }} />
          </div>
        ) : courses.length === 0 ? (
          <div className="animate-fade-in" style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "56px 32px", textAlign: "center" }}>
            <i className="ti ti-books" style={{ fontSize: "36px", color: C.border, display: "block", marginBottom: "14px" }} />
            <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 6px" }}>No courses yet</p>
            <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>Ask your administrator to enroll you in a course.</p>
          </div>
        ) : (
          <div className="animate-fade-in">
            <h3 style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, marginBottom: "10px" }}>Enrolled Courses</h3>
            <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
              {courses.map((course, i) => (
                <CourseRow
                  key={course.id}
                  course={course}
                  last={i === courses.length - 1}
                  onClick={() => navigate(`/student/courses/${course.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </PageShell>
    </Layout>
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