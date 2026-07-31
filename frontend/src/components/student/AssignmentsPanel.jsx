// src/components/student/AssignmentsPanel.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import * as assignmentsApi from "../../api/assignments";
import * as badgesApi from "../../api/badges";
import BadgePill from "../BadgePill";
import { C } from "../../theme";

export default function StudentAssignmentsPanel({ courseId }) {
  const [assignments, setAssignments] = useState([]);
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState({});
  const [grades, setGrades] = useState({});
  const [badgesByAssignment, setBadgesByAssignment] = useState({});
  const [uploadingId, setUploadingId] = useState(null);
  const [error, setError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState({});
  const pollRef = useRef(null);

  const isPastDeadline = (a) => a.due_date && new Date() > new Date(a.due_date);

  const refreshSubmissionStatus = useCallback(async (assignmentId, submissionId) => {
    try {
      const { data } = await assignmentsApi.getSubmissionStatus(submissionId);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));
      if (data.status === "teacher_reviewed") {
        const gradeRes = await assignmentsApi.getFinalGrade(submissionId);
        setGrades((prev) => ({ ...prev, [assignmentId]: gradeRes.data }));
      }
      return data.status;
    } catch { return null; }
  }, []);

  const handleDeleteSubmission = async (assignmentId, submissionId) => {
    if (!confirm("Delete your submission? You can resubmit before the deadline.")) return;
    try {
      await assignmentsApi.deleteMySubmission(submissionId);
      setSubmissionsByAssignment((prev) => { const u = { ...prev }; delete u[assignmentId]; return u; });
      setGrades((prev) => { const u = { ...prev }; delete u[assignmentId]; return u; });
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't delete submission.");
    }
  };

  const loadExistingData = useCallback(async (list) => {
    // Fetch student's earned badges
    try {
      const { data: myBadges } = await badgesApi.getMyBadges();
      const badgeMap = {};
      for (const b of myBadges) {
        if (b.assignment_id) {
          if (!badgeMap[b.assignment_id]) badgeMap[b.assignment_id] = [];
          badgeMap[b.assignment_id].push(b);
        }
      }
      setBadgesByAssignment(badgeMap);
    } catch { /* ignore */ }

    for (const a of list) {
      try {
        const { data } = await assignmentsApi.getMySubmissionForAssignment(a.id);
        if (data) {
          setSubmissionsByAssignment((prev) => ({ ...prev, [a.id]: data }));
          if (data.status === "teacher_reviewed") {
            const gradeRes = await assignmentsApi.getFinalGrade(data.id);
            setGrades((prev) => ({ ...prev, [a.id]: gradeRes.data }));
          }
        }
      } catch { /* no submission yet */ }
    }
  }, []);

  useEffect(() => {
    assignmentsApi.listAssignments(courseId).then(({ data }) => {
      setAssignments(data);
      loadExistingData(data);
    });
  }, [courseId, loadExistingData]);

  const handleUpload = async (assignmentId, file) => {
    if (!file) return;
    if (!file.name.endsWith(".pdf")) { setError("Only PDF files are accepted."); return; }
    setError("");
    setUploadingId(assignmentId);
    try {
      const { data } = await assignmentsApi.submitAssignment(assignmentId, file);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));
      setJustSubmitted((prev) => ({ ...prev, [assignmentId]: true }));
      setTimeout(() => setJustSubmitted((prev) => ({ ...prev, [assignmentId]: false })), 4000);
      pollRef.current = setInterval(async () => {
        const status = await refreshSubmissionStatus(assignmentId, data.id);
        if (status === "teacher_reviewed" || status === "failed") clearInterval(pollRef.current);
      }, 4000);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (assignments.length === 0) {
    return (
      <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "48px 20px", textAlign: "center" }}>
        <i className="ti ti-clipboard-list" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
        <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>No assignments posted yet.</p>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 14px", marginBottom: "16px", fontSize: "14px", display: "flex", gap: "8px" }}>
          <i className="ti ti-alert-circle" style={{ fontSize: "15px", flexShrink: 0 }} />{error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {assignments.map((a) => {
          const submission = submissionsByAssignment[a.id];
          const grade = grades[a.id];
          const badges = badgesByAssignment[a.id] || [];
          const past = isPastDeadline(a);

          return (
            <AssignmentCard
              key={a.id}
              assignment={a}
              submission={submission}
              grade={grade}
              badges={badges}
              past={past}
              justSubmitted={!!justSubmitted[a.id]}
              uploading={uploadingId === a.id}
              onUpload={(file) => handleUpload(a.id, file)}
              onDelete={() => handleDeleteSubmission(a.id, submission?.id)}
              onViewSubmission={() => assignmentsApi.viewSubmissionFile(submission?.id)}
              onDownloadSubmission={() => assignmentsApi.downloadSubmissionFile(submission?.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Assignment card ─────────────────────────────────────────────────────────
function AssignmentCard({ assignment: a, submission, grade, badges, past, justSubmitted, uploading, onUpload, onDelete, onViewSubmission, onDownloadSubmission }) {
  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
            <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: 0 }}>{a.title}</p>
            {badges.map((b) => (
              <BadgePill key={b.id} badge={b} size="sm" />
            ))}
          </div>
          {a.description && (
            <p style={{ fontSize: "13px", color: C.textSecondary, margin: "0 0 6px", lineHeight: "1.5", whiteSpace: "pre-wrap" }}>{a.description}</p>
          )}
          {a.due_date && (
            <p style={{ fontSize: "12px", fontWeight: "600", color: past ? C.dangerText : C.warningText, margin: 0, display: "flex", alignItems: "center", gap: "5px" }}>
              <i className={`ti ${past ? "ti-lock" : "ti-clock"}`} style={{ fontSize: "12px" }} />
              {past ? "Closed" : "Due"} {new Date(a.due_date).toLocaleString()}
            </p>
          )}
        </div>
        {submission && <SubmissionBadge status={submission.status} />}
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px" }}>
        {justSubmitted && (
          <div style={{ background: C.successBg, color: C.successText, border: `1px solid ${C.successBorder}`, borderRadius: "7px", padding: "10px 13px", marginBottom: "12px", fontSize: "13px", display: "flex", gap: "8px" }}>
            <i className="ti ti-circle-check" style={{ fontSize: "15px" }} />Submitted successfully. We'll notify you once it's graded.
          </div>
        )}

        {submission && (
          <div style={{ marginBottom: grade ? "14px" : "0" }}>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button onClick={onViewSubmission}
                style={{ fontSize: "13px", fontWeight: "500", color: C.infoText, background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="ti ti-eye" style={{ fontSize: "13px" }} />View submission
              </button>
              <button onClick={onDownloadSubmission}
                style={{ fontSize: "13px", fontWeight: "500", color: C.textSecondary, background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}>
                <i className="ti ti-download" style={{ fontSize: "13px" }} />Download
              </button>
            </div>
            <div style={{ marginTop: "10px" }}>
              {past || submission.status === "teacher_reviewed" ? (
                <p style={{ fontSize: "12px", color: C.textMuted, margin: 0, display: "flex", gap: "5px", alignItems: "center" }}>
                  <i className="ti ti-lock" style={{ fontSize: "12px" }} />
                  {submission.status === "teacher_reviewed"
                    ? "This submission has been graded and is locked."
                    : "The deadline has passed — this submission is locked."}
                </p>
              ) : (
                <button onClick={onDelete}
                  style={{ fontSize: "12px", fontWeight: "500", color: C.dangerText, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                  <i className="ti ti-trash" style={{ fontSize: "13px" }} />Delete submission
                </button>
              )}
            </div>
          </div>
        )}

        {!submission && (
          <div>
            {a.criteria?.length > 0 && (
              <div style={{ background: C.subtleBg, borderRadius: "7px", padding: "12px 14px", marginBottom: "12px" }}>
                <p style={{ fontSize: "12px", fontWeight: "700", color: C.textPrimary, margin: "0 0 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="ti ti-clipboard-check" style={{ fontSize: "13px" }} />
                  Marking rubric — {a.total_marks} marks total
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {a.criteria.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: C.textSecondary }}>{c.label}</span>
                      <span style={{ fontWeight: "600", color: C.infoText }}>{c.max_marks} marks</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {past ? (
              <div style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "10px 13px", fontSize: "13px", display: "flex", gap: "8px" }}>
                <i className="ti ti-lock" style={{ fontSize: "15px" }} />The deadline has passed. Submissions are no longer accepted.
              </div>
            ) : (
              <label style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 16px", borderRadius: "7px", background: uploading ? C.textMuted : C.primary, color: "#fff", fontSize: "14px", fontWeight: "600", cursor: uploading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                <i className="ti ti-upload" style={{ fontSize: "15px" }} />
                {uploading ? "Uploading…" : "Submit PDF"}
                <input type="file" accept=".pdf" onChange={(e) => onUpload(e.target.files[0])} disabled={uploading} style={{ display: "none" }} />
              </label>
            )}
          </div>
        )}

        {grade && <GradeDisplay grade={grade} />}
      </div>
    </div>
  );
}

function SubmissionBadge({ status }) {
  const map = {
    processing:       { bg: C.warningBg,  txt: C.warningText,  icon: "ti-loader-2",      label: "Processing"  },
    extracted:        { bg: C.infoBg,     txt: C.infoText,     icon: "ti-file-text",     label: "Extracted"   },
    ai_evaluated:     { bg: C.infoBg,     txt: C.infoText,     icon: "ti-sparkles",      label: "Evaluating"  },
    teacher_reviewed: { bg: C.successBg,  txt: C.successText,  icon: "ti-circle-check",  label: "Graded"      },
    failed:           { bg: C.dangerBg,   txt: C.dangerText,   icon: "ti-alert-circle",  label: "Failed"      },
  }[status] || { bg: C.subtleBg, txt: C.textMuted, icon: "ti-circle", label: status };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", padding: "4px 9px", borderRadius: "20px", background: map.bg, color: map.txt, whiteSpace: "nowrap", flexShrink: 0 }}>
      <i className={`ti ${map.icon}`} style={{ fontSize: "11px" }} />{map.label}
    </span>
  );
}

function GradeDisplay({ grade }) {
  let feedback = null;
  try {
    feedback = typeof grade.ai_feedback === "string" ? JSON.parse(grade.ai_feedback) : grade.ai_feedback;
  } catch { /* plain text feedback */ }

  return (
    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "14px", marginTop: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>Final Grade</span>
        <span style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.primary }}>{grade.total_score}</span>
      </div>

      {feedback?.criteria_feedback?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          {feedback.criteria_feedback.map((cf, i) => (
            <div key={i} style={{ borderRadius: "7px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: C.subtleBg, borderBottom: (cf.what_was_good || cf.what_was_missing) ? `1px solid ${C.border}` : "none" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>{cf.label}</span>
                <span style={{ fontSize: "13px", fontWeight: "700", color: C.infoText, background: C.infoBg, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.infoBorder}` }}>{cf.score}/{cf.max_score}</span>
              </div>
              {(cf.what_was_good || cf.what_was_missing) && (
                <div style={{ padding: "9px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                  {cf.what_was_good && (
                    <p style={{ fontSize: "12px", color: C.successText, margin: 0, display: "flex", gap: "5px" }}>
                      <i className="ti ti-check" style={{ flexShrink: 0, marginTop: "1px" }} />{cf.what_was_good}
                    </p>
                  )}
                  {cf.what_was_missing && (
                    <p style={{ fontSize: "12px", color: C.dangerText, margin: 0, display: "flex", gap: "5px" }}>
                      <i className="ti ti-x" style={{ flexShrink: 0, marginTop: "1px" }} />{cf.what_was_missing}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {feedback?.strengths?.length > 0 && (
        <div style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: "7px", padding: "10px 12px", marginBottom: "8px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.successText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Strengths</p>
          {feedback.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.successText, margin: "0 0 2px", display: "flex", gap: "5px" }}>
              <i className="ti ti-point-filled" style={{ fontSize: "10px", flexShrink: 0, marginTop: "3px" }} />{s}
            </p>
          ))}
        </div>
      )}

      {feedback?.weaknesses?.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "10px 12px", marginBottom: "8px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.dangerText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Areas to improve</p>
          {feedback.weaknesses.map((w, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.dangerText, margin: "0 0 2px", display: "flex", gap: "5px" }}>
              <i className="ti ti-point-filled" style={{ fontSize: "10px", flexShrink: 0, marginTop: "3px" }} />{w}
            </p>
          ))}
        </div>
      )}

      {feedback?.improvements?.length > 0 && (
        <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: "7px", padding: "10px 12px", marginBottom: "8px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.infoText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Suggestions</p>
          {feedback.improvements.map((imp, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.infoText, margin: "0 0 2px", display: "flex", gap: "5px" }}>
              <i className="ti ti-arrow-right" style={{ fontSize: "12px", flexShrink: 0, marginTop: "1px" }} />{imp}
            </p>
          ))}
        </div>
      )}

      {feedback?.summary && (
        <p style={{ fontSize: "12px", color: C.textMuted, fontStyle: "italic", margin: "0 0 8px", lineHeight: "1.6" }}>{feedback.summary}</p>
      )}

      {grade.teacher_comments && (
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: "10px", marginTop: "10px" }}>
          <p style={{ fontSize: "12px", fontWeight: "700", color: C.textPrimary, margin: "0 0 4px", display: "flex", alignItems: "center", gap: "5px" }}>
            <i className="ti ti-message" style={{ fontSize: "13px" }} />Teacher comments
          </p>
          <p style={{ fontSize: "13px", color: C.textSecondary, margin: 0, lineHeight: "1.6", whiteSpace: "pre-wrap" }}>{grade.teacher_comments}</p>
        </div>
      )}
    </div>
  );
}