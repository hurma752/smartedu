// src/components/teacher/AnalyticsPanel.jsx
import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, Btn, Alert, Badge } from "../Layout";
import PerformanceMetricCards from "./PerformanceMetricCards";
import BadgePill from "../BadgePill";
import * as analyticsApi from "../../api/analytics";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

const RISK_VARIANT = { high: "danger", medium: "warning", low: "success" };

const FEATURE_LABELS = {
  avg_score_pct: "Average grade",
  score_trend: "Grade trend",
  late_rate: "Late submission rate",
  missing_rate: "Missing assignment rate",
  ocr_fail_rate: "Failed submission rate",
  attendance_rate: "Attendance rate",
  chat_engagement: "Chatbot usage",
  download_engagement: "Material downloads",
};

export default function AnalyticsPanel({ courseId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await analyticsApi.getCourseRisk(courseId);
      setSummary(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load analytics."));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const handleRecompute = async () => {
    setRecomputing(true);
    setError("");
    try {
      const { data } = await analyticsApi.recomputeCourseRisk(courseId);
      setSummary(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't recompute analytics."));
    } finally {
      setRecomputing(false);
    }
  };

  if (loading) {
    return <Card><div style={{ padding: "40px 20px", textAlign: "center" }}><p style={{ fontSize: "14px", color: C.textMuted }}>Computing at-risk analysis…</p></div></Card>;
  }

  return (
    <>
      <Alert variant="error">{error}</Alert>

      {summary && summary.model_version === "heuristic-fallback" && (
        <Alert variant="info">
          Not enough graded/varied data yet to train the Random Forest model — showing rule-based risk scoring until more assignments and attendance are recorded.
        </Alert>
      )}

      {/* Summary stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        <StatCard label="Total Students" value={summary?.total_students ?? 0} accent={C.statStudents} />
        <StatCard label="High Risk" value={summary?.high_risk_count ?? 0} accent={C.dangerText} />
        <StatCard label="Medium Risk" value={summary?.medium_risk_count ?? 0} accent={C.warningText} />
        <StatCard label="Low Risk" value={summary?.low_risk_count ?? 0} accent={C.successText} />
      </div>

      <Card>
        <CardHeader
          title="Student risk breakdown"
          count={summary?.students?.length ?? 0}
          action={<Btn size="sm" onClick={handleRecompute} disabled={recomputing}>{recomputing ? "Recomputing…" : "Recompute now"}</Btn>}
        />
        <div style={{ padding: "8px 0" }}>
          {!summary || summary.students.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <i className="ti ti-chart-line" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
              <p style={{ fontSize: "14px", color: C.textMuted }}>No enrolled students yet.</p>
            </div>
          ) : (
            summary.students.map((s, i) => {
              const isOpen = expanded === s.student_id;
              const factors = s.contributing_factors || {};
              const submitted = factors.total_submitted_count ?? 0;
              const assigned = factors.total_assignments ?? 0;
              const badges = s.badges || [];
              return (
                <div key={s.student_id} style={{ borderBottom: i < summary.students.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div
                    onClick={() => setExpanded(isOpen ? null : s.student_id)}
                    style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 18px", cursor: "pointer" }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: "14px", fontWeight: "500", color: C.textPrimary, margin: 0 }}>{s.student_name}</p>
                      <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>Risk score: {(s.risk_score * 100).toFixed(0)}%</p>
                    </div>
                    <Badge variant={RISK_VARIANT[s.risk_level] || "neutral"}>{s.risk_level.toUpperCase()}</Badge>
                    <i className={`ti ti-chevron-${isOpen ? "up" : "down"}`} style={{ fontSize: "16px", color: C.textMuted }} />
                  </div>
                  {isOpen && (
                    <div style={{ padding: "0 18px 18px 18px" }}>

                      {/* ── Status strip: risk level + submitted count ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", padding: "10px 14px", background: C.subtleBg, borderRadius: "7px", marginBottom: "16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: C.textSecondary }}>Risk level</span>
                          <Badge variant={RISK_VARIANT[s.risk_level] || "neutral"}>{s.risk_level.toUpperCase()}</Badge>
                        </div>
                        <div style={{ width: "1px", height: "16px", background: C.border }} />
                        <span style={{ fontSize: "12px", color: C.textSecondary }}>
                          Assignments submitted: <strong style={{ color: C.textPrimary }}>{submitted}/{assigned}</strong>
                        </span>
                      </div>

                      {/* ── Three-metric performance overview ── */}
                      <div style={{ marginBottom: "18px" }}>
                        <p style={{ ...T.tiny, fontWeight: "700", color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>
                          Performance overview
                        </p>
                        <PerformanceMetricCards
                          gradeAverage={factors.avg_score_pct ?? null}
                          attendanceRate={factors.attendance_rate ?? null}
                          chatbotEngagementLevel={factors.chatbot_engagement_level ?? "low"}
                        />
                      </div>

                      {/* ── Achievements ── */}
                      <div style={{ marginBottom: "16px" }}>
                        <p style={{ ...T.tiny, fontWeight: "700", color: C.textMuted, letterSpacing: "0.06em", textTransform: "uppercase", margin: "0 0 10px" }}>
                          Achievements
                        </p>
                        {badges.length === 0 ? (
                          <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>No badges earned in this course yet.</p>
                        ) : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {badges.map((b) => (
                              <BadgePill
                                key={b.id}
                                badge={{
                                  ...b,
                                  description: b.assignment_title ? `${b.description} — ${b.assignment_title}` : b.description,
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {summary?.feature_importance && (
        <Card style={{ marginTop: "16px" }}>
          <CardHeader title="Model feature importance" />
          <div style={{ padding: "14px 18px" }}>
            {Object.entries(summary.feature_importance)
              .sort((a, b) => b[1] - a[1])
              .map(([key, importance]) => (
                <div key={key} style={{ marginBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px" }}>
                    <span style={{ color: C.textSecondary }}>{FEATURE_LABELS[key] || key}</span>
                    <span style={{ color: C.textPrimary, fontWeight: "600" }}>{(importance * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ height: "6px", borderRadius: "4px", background: C.subtleBg, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${importance * 100}%`, background: C.primary, borderRadius: "4px" }} />
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}
    </>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderLeft: `3px solid ${accent}`, borderRadius: "8px", padding: "14px 16px" }}>
      <p style={{ ...T.statLabel, color: C.textMuted, margin: "0 0 4px" }}>{label}</p>
      <p style={{ ...T.statValue, color: C.textPrimary, margin: 0 }}>{value}</p>
    </div>
  );
}