// src/pages/TeacherSubmissions.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout, { PageShell, Btn } from "../components/Layout";
import * as assignmentsApi from "../api/assignments";
import { C, T } from "../theme";

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function TeacherSubmissions() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [submissions, setSubmissions] = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [aiEval,      setAiEval]      = useState(null);
  const [scores,      setScores]      = useState({});
  const [comments,    setComments]    = useState("");
  const [error,       setError]       = useState("");
  const [saved,       setSaved]       = useState(false);
  const [loadingEval, setLoadingEval] = useState(false);

  const loadSubmissions = useCallback(async () => {
    const { data } = await assignmentsApi.listSubmissions(assignmentId);
    setSubmissions(data);
  }, [assignmentId]);

  useEffect(() => { loadSubmissions(); }, [loadSubmissions]);

  // Poll while any submission is still processing
  useEffect(() => {
    const hasPending = submissions.some((s) => ["processing", "extracted"].includes(s.status));
    if (!hasPending) return;
    const interval = setInterval(loadSubmissions, 3000);
    return () => clearInterval(interval);
  }, [submissions, loadSubmissions]);

  const openReview = async (submission) => {
    setSelected(submission);
    setError("");
    setSaved(false);
    setAiEval(null);
    if (["ai_evaluated", "teacher_reviewed"].includes(submission.status)) {
      setLoadingEval(true);
      try {
        const { data } = await assignmentsApi.getAiEvaluation(submission.id);
        setAiEval(data);
        setScores(data.criteria_scores);
        setComments("");
      } catch {
        setError("Couldn't load AI evaluation.");
      } finally {
        setLoadingEval(false);
      }
    }
  };

  const handleScoreChange = (key, value) =>
    setScores({ ...scores, [key]: Number(value) });

  const handleSubmitReview = async () => {
    setError("");
    try {
      await assignmentsApi.reviewSubmission(selected.id, {
        criteria_scores: scores,
        teacher_comments: comments,
      });
      setSaved(true);
      loadSubmissions();
      // Refresh selected to reflect new status
      setSelected((prev) => prev ? { ...prev, status: "teacher_reviewed" } : prev);
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save review.");
    }
  };

  const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);

  // Counters for the header summary
  const graded    = submissions.filter((s) => s.status === "teacher_reviewed").length;
  const pending   = submissions.filter((s) => s.status === "ai_evaluated").length;
  const failed    = submissions.filter((s) => s.status === "failed").length;

  return (
    <Layout>
      <PageShell
        title="Submission Review"
        subtitle={`${submissions.length} submission${submissions.length !== 1 ? "s" : ""}`}
        action={
          <Btn variant="ghost" onClick={() => navigate(-1)}>
            <i className="ti ti-arrow-left" style={{ fontSize: "14px" }} />Back
          </Btn>
        }
      >
        {/* ── Summary bar ── */}
        {submissions.length > 0 && (
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
            <SummaryChip icon="ti-circle-check" label="Graded"  value={graded}  color={C.successText} bg={C.successBg}  border={C.successBorder} />
            <SummaryChip icon="ti-sparkles"     label="Ready"   value={pending} color={C.infoText}    bg={C.infoBg}     border={C.infoBorder}   />
            <SummaryChip icon="ti-alert-circle" label="Failed"  value={failed}  color={C.dangerText}  bg={C.dangerBg}   border={C.dangerBorder} />
          </div>
        )}

        {/* ── Main layout: list | detail ── */}
        <div style={{ display: "grid", gridTemplateColumns: selected ? "280px 1fr" : "1fr", gap: "16px", alignItems: "start" }}>

          {/* Left: student list */}
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Students</span>
              <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px", background: C.subtleBg, color: C.textMuted }}>{submissions.length}</span>
            </div>

            {submissions.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <i className="ti ti-inbox" style={{ fontSize: "28px", color: C.border, display: "block", marginBottom: "10px" }} />
                <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>No submissions yet.</p>
              </div>
            ) : (
              submissions.map((s, i) => (
                <StudentRow
                  key={s.id}
                  submission={s}
                  isSelected={selected?.id === s.id}
                  isLast={i === submissions.length - 1}
                  onClick={() => openReview(s)}
                />
              ))
            )}
          </div>

          {/* Right: review detail */}
          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>

              {/* Student header card */}
              <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: C.subtleBg, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary }}>
                      {(selected.student_name || "S").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p style={{ fontSize: "16px", fontWeight: "600", color: C.textPrimary, margin: 0 }}>
                      {selected.student_name || `Student #${selected.student_id}`}
                    </p>
                    <StatusPill status={selected.status} />
                  </div>
                </div>
                {/* PDF actions */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <ActionBtn icon="ti-eye"      label="View PDF"    onClick={() => assignmentsApi.viewSubmissionFile(selected.id)} />
                  <ActionBtn icon="ti-download" label="Download"    onClick={() => assignmentsApi.downloadSubmissionFile(selected.id)} />
                </div>
              </div>

              {/* Error / saved */}
              {error && <InlineBanner variant="error">{error}</InlineBanner>}
              {saved  && <InlineBanner variant="success">Grade saved successfully.</InlineBanner>}

              {/* OCR text */}
              {selected.extracted_text && selected.extraction_method === "ocr" && (
                <OCRBlock
                  text={selected.extracted_text}
                  confidence={selected.extraction_confidence}
                />
              )}

              {/* Failed */}
              {selected.status === "failed" && (
                <InlineBanner variant="error">{selected.error_message || "AI evaluation failed for this submission."}</InlineBanner>
              )}

              {/* Processing */}
              {!aiEval && !loadingEval && selected.status !== "failed" && !["ai_evaluated", "teacher_reviewed"].includes(selected.status) && (
                <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "32px", textAlign: "center" }}>
                  <i className="ti ti-loader-2" style={{ fontSize: "28px", color: C.textMuted, display: "block", marginBottom: "10px", animation: "spin 1s linear infinite" }} />
                  <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>AI evaluation in progress…</p>
                </div>
              )}

              {/* Loading eval */}
              {loadingEval && (
                <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "32px", textAlign: "center" }}>
                  <i className="ti ti-loader-2" style={{ fontSize: "28px", color: C.textMuted, display: "block", marginBottom: "10px", animation: "spin 1s linear infinite" }} />
                  <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>Loading evaluation…</p>
                </div>
              )}

              {/* Main review: two columns — AI feedback | Scoring */}
              {aiEval && !loadingEval && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", alignItems: "start" }}>

                  {/* AI feedback */}
                  <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
                      <i className="ti ti-sparkles" style={{ fontSize: "15px", color: C.infoText }} />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>AI Feedback</span>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <AIFeedback eval_={aiEval} />
                    </div>
                  </div>

                  {/* Scoring + approve */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <ScoreCard
                      scores={scores}
                      aiEval={aiEval}
                      totalScore={totalScore}
                      onScoreChange={handleScoreChange}
                      alreadyGraded={selected.status === "teacher_reviewed"}
                    />
                    <CommentsCard
                      value={comments}
                      onChange={setComments}
                      alreadyGraded={selected.status === "teacher_reviewed"}
                    />
                    {selected.status !== "teacher_reviewed" ? (
                      <button onClick={handleSubmitReview}
                        style={{ width: "100%", padding: "13px", borderRadius: "8px", border: "none", background: C.primary, color: "#fff", fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                        <i className="ti ti-check" style={{ fontSize: "16px" }} />Approve & finalize grade
                      </button>
                    ) : (
                      <InlineBanner variant="success">This submission has been graded.</InlineBanner>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Placeholder when nothing selected and list is visible */}
          {!selected && submissions.length > 0 && (
            <div style={{ display: "none" }} /> // grid only shows one column when !selected
          )}
        </div>
      </PageShell>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SummaryChip({ icon, label, value, color, bg, border }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "20px", background: bg, border: `1px solid ${border}` }}>
      <i className={`ti ${icon}`} style={{ fontSize: "13px", color }} />
      <span style={{ fontSize: "12px", fontWeight: "600", color }}>{value} {label}</span>
    </div>
  );
}

function StudentRow({ submission: s, isSelected, isLast, onClick }) {
  const [hovered, setHovered] = useState(false);

  // CTA config per status
  const cta = {
    ai_evaluated:     { label: "Review & grade", icon: "ti-clipboard-check", style: { background: C.primary, color: "#fff", border: "none" } },
    teacher_reviewed: { label: "View grade",     icon: "ti-eye",             style: { background: "transparent", color: C.textSecondary, border: `1px solid ${C.border}` } },
    failed:           { label: "View details",   icon: "ti-eye",             style: { background: "transparent", color: C.dangerText, border: `1px solid ${C.dangerBorder}` } },
    processing:       { label: "AI evaluating…", icon: "ti-loader-2",        style: { background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, cursor: "not-allowed", opacity: 0.6 }, disabled: true },
    extracted:        { label: "AI evaluating…", icon: "ti-loader-2",        style: { background: "transparent", color: C.textMuted, border: `1px solid ${C.border}`, cursor: "not-allowed", opacity: 0.6 }, disabled: true },
  }[s.status] || { label: "Open", icon: "ti-arrow-right", style: { background: "transparent", color: C.textSecondary, border: `1px solid ${C.border}` } };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        padding: "11px 16px", borderBottom: isLast ? "none" : `1px solid ${C.border}`,
        background: isSelected ? C.subtleBg : hovered ? "#FAFAFA" : "none",
        borderLeft: isSelected ? `3px solid ${C.primary}` : "3px solid transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Student name — clicking the name/row area also opens review */}
      <div onClick={!cta.disabled ? onClick : undefined}
        style={{ minWidth: 0, flex: 1, cursor: cta.disabled ? "default" : "pointer" }}>
        <p style={{ fontSize: "13px", fontWeight: isSelected ? "600" : "500", color: C.textPrimary, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {s.student_name || `Student #${s.student_id}`}
        </p>
      </div>

      <StatusPill status={s.status} />

      {/* Explicit CTA button — the key UX improvement */}
      <button
        onClick={!cta.disabled ? onClick : undefined}
        disabled={cta.disabled}
        style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          padding: "6px 11px", borderRadius: "6px",
          fontSize: "12px", fontWeight: "500", fontFamily: "inherit",
          cursor: cta.disabled ? "not-allowed" : "pointer",
          whiteSpace: "nowrap", flexShrink: 0,
          transition: "opacity 0.1s",
          ...cta.style,
        }}
      >
        <i className={`ti ${cta.icon}`} style={{ fontSize: "12px" }} />
        {cta.label}
      </button>
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    processing:       { bg: C.warningBg, txt: C.warningText, label: "Processing", icon: "ti-loader-2"      },
    extracted:        { bg: C.infoBg,    txt: C.infoText,    label: "Extracted",  icon: "ti-file-text"     },
    ai_evaluated:     { bg: C.infoBg,    txt: C.infoText,    label: "Ready",      icon: "ti-sparkles"      },
    teacher_reviewed: { bg: C.successBg, txt: C.successText, label: "Graded",     icon: "ti-circle-check"  },
    failed:           { bg: C.dangerBg,  txt: C.dangerText,  label: "Failed",     icon: "ti-alert-circle"  },
  }[status] || { bg: C.subtleBg, txt: C.textMuted, label: status, icon: "ti-circle" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "20px", background: map.bg, color: map.txt, whiteSpace: "nowrap", flexShrink: 0, marginLeft: "8px" }}>
      <i className={`ti ${map.icon}`} style={{ fontSize: "11px" }} />
      {map.label}
    </span>
  );
}

function ActionBtn({ icon, label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 12px", borderRadius: "6px", border: `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, color: C.textSecondary, fontSize: "13px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer", transition: "background 0.1s" }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: "13px" }} />{label}
    </button>
  );
}

function InlineBanner({ children, variant = "error" }) {
  const v = {
    error:   { bg: C.dangerBg,  txt: C.dangerText,  border: C.dangerBorder,  icon: "ti-alert-circle"  },
    success: { bg: C.successBg, txt: C.successText, border: C.successBorder, icon: "ti-circle-check"  },
    info:    { bg: C.infoBg,    txt: C.infoText,    border: C.infoBorder,    icon: "ti-info-circle"   },
  }[variant];
  return (
    <div style={{ background: v.bg, color: v.txt, border: `1px solid ${v.border}`, borderRadius: "7px", padding: "11px 14px", fontSize: "13px", display: "flex", gap: "8px", alignItems: "flex-start" }}>
      <i className={`ti ${v.icon}`} style={{ fontSize: "15px", flexShrink: 0, marginTop: "1px" }} />
      <span>{children}</span>
    </div>
  );
}

function OCRBlock({ text, confidence }) {
  const [expanded, setExpanded] = useState(false);
  const confColor = confidence < 40 ? C.dangerText : confidence < 70 ? C.warningText : C.successText;
  const confBg    = confidence < 40 ? C.dangerBg   : confidence < 70 ? C.warningBg   : C.successBg;
  const confBdr   = confidence < 40 ? C.dangerBorder: confidence < 70 ? C.warningBorder: C.successBorder;
  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <i className="ti ti-scan" style={{ fontSize: "14px", color: C.textMuted }} />
          <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>OCR Extracted Text</span>
          {confidence !== null && confidence !== undefined && (
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 7px", borderRadius: "20px", background: confBg, color: confColor, border: `1px solid ${confBdr}` }}>
              {confidence}% confidence
            </span>
          )}
        </div>
        <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: "14px", color: C.textMuted }} />
      </button>
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px" }}>
          <pre style={{ fontSize: "12px", color: C.textPrimary, lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, maxHeight: "200px", overflowY: "auto", fontFamily: "inherit" }}>
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ScoreCard({ scores, aiEval, totalScore, onScoreChange, alreadyGraded }) {
  // Build max marks lookup from aiEval criteria if available
  const maxByKey = {};
  try {
    const fb = typeof aiEval.feedback === "string" ? JSON.parse(aiEval.feedback) : aiEval.feedback;
    fb?.criteria_feedback?.forEach((cf) => {
      // key may not match label exactly; best effort
    });
  } catch { /* ignore */ }

  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
        <i className="ti ti-clipboard-check" style={{ fontSize: "15px", color: C.textMuted }} />
        <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Scores</span>
        {alreadyGraded && (
          <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "600", color: C.successText, background: C.successBg, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.successBorder}` }}>
            Finalized
          </span>
        )}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {Object.entries(scores).map(([key, value]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ flex: 1, fontSize: "13px", color: C.textPrimary, textTransform: "capitalize", fontWeight: "500" }}>
                {key.replace(/_/g, " ")}
              </label>
              <input
                type="number" min="0"
                value={value}
                disabled={alreadyGraded}
                onChange={(e) => onScoreChange(key, e.target.value)}
                style={{ width: "64px", background: alreadyGraded ? C.subtleBg : C.cardBg, border: `1.5px solid ${C.border}`, borderRadius: "6px", padding: "6px 8px", fontSize: "14px", fontWeight: "600", color: C.textPrimary, fontFamily: "inherit", outline: "none", textAlign: "center", cursor: alreadyGraded ? "default" : "text" }}
                onFocus={(e) => { if (!alreadyGraded) { e.target.style.borderColor = C.focusBorder; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; } }}
                onBlur={(e)  => { e.target.style.borderColor = C.border; e.target.style.boxShadow = "none"; }}
              />
            </div>
          ))}
        </div>
        {/* Total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: `2px solid ${C.border}` }}>
          <span style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary }}>Total</span>
          <span style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-0.03em", color: C.textPrimary }}>{totalScore}</span>
        </div>
      </div>
    </div>
  );
}

function CommentsCard({ value, onChange, alreadyGraded }) {
  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
        <i className="ti ti-message" style={{ fontSize: "15px", color: C.textMuted }} />
        <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Your Comments</span>
        <span style={{ fontSize: "11px", color: C.textMuted, marginLeft: "2px" }}>(optional)</span>
      </div>
      <div style={{ padding: "12px 16px" }}>
        <textarea
          value={value}
          disabled={alreadyGraded}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Add anything the AI feedback missed…"
          style={{ width: "100%", background: alreadyGraded ? C.subtleBg : C.inputBg, border: "1.5px solid transparent", borderRadius: "6px", padding: "9px 12px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", cursor: alreadyGraded ? "default" : "text" }}
          onFocus={(e) => { if (!alreadyGraded) { e.target.style.borderColor = C.focusBorder; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; } }}
          onBlur={(e)  => { e.target.style.borderColor = "transparent"; e.target.style.background = alreadyGraded ? C.subtleBg : C.inputBg; e.target.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

function AIFeedback({ eval_ }) {
  let feedback = null;
  try {
    feedback = typeof eval_.feedback === "string" ? JSON.parse(eval_.feedback) : eval_.feedback;
  } catch {
    return (
      <p style={{ fontSize: "13px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>
        {String(eval_.feedback)}
      </p>
    );
  }
  if (!feedback) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

      {/* Per-criterion cards */}
      {feedback.criteria_feedback?.map((cf, i) => (
        <div key={i} style={{ borderRadius: "7px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: C.subtleBg, borderBottom: (cf.what_was_good || cf.what_was_missing) ? `1px solid ${C.border}` : "none" }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>{cf.label}</span>
            <span style={{ fontSize: "13px", fontWeight: "700", color: C.infoText, background: C.infoBg, border: `1px solid ${C.infoBorder}`, padding: "2px 9px", borderRadius: "20px" }}>
              {cf.score}/{cf.max_score}
            </span>
          </div>
          {(cf.what_was_good || cf.what_was_missing) && (
            <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "5px" }}>
              {cf.what_was_good && (
                <p style={{ fontSize: "12px", color: C.successText, margin: 0, display: "flex", gap: "6px", alignItems: "flex-start" }}>
                  <i className="ti ti-check" style={{ flexShrink: 0, marginTop: "1px" }} />{cf.what_was_good}
                </p>
              )}
              {cf.what_was_missing && (
                <p style={{ fontSize: "12px", color: C.dangerText, margin: 0, display: "flex", gap: "6px", alignItems: "flex-start" }}>
                  <i className="ti ti-x" style={{ flexShrink: 0, marginTop: "1px" }} />{cf.what_was_missing}
                </p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Strengths */}
      {feedback.strengths?.length > 0 && (
        <div style={{ background: C.successBg, border: `1px solid ${C.successBorder}`, borderRadius: "7px", padding: "10px 12px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.successText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Strengths</p>
          {feedback.strengths.map((s, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.successText, margin: "0 0 2px", display: "flex", gap: "6px" }}>
              <i className="ti ti-point-filled" style={{ flexShrink: 0, marginTop: "2px", fontSize: "10px" }} />{s}
            </p>
          ))}
        </div>
      )}

      {/* Weaknesses */}
      {feedback.weaknesses?.length > 0 && (
        <div style={{ background: C.dangerBg, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "10px 12px" }}>
          <p style={{ fontSize: "11px", fontWeight: "700", color: C.dangerText, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>Areas to improve</p>
          {feedback.weaknesses.map((w, i) => (
            <p key={i} style={{ fontSize: "12px", color: C.dangerText, margin: "0 0 2px", display: "flex", gap: "6px" }}>
              <i className="ti ti-point-filled" style={{ flexShrink: 0, marginTop: "2px", fontSize: "10px" }} />{w}
            </p>
          ))}
        </div>
      )}

      {/* Summary */}
      {feedback.summary && (
        <p style={{ fontSize: "12px", color: C.textMuted, fontStyle: "italic", margin: 0, lineHeight: "1.6" }}>
          {feedback.summary}
        </p>
      )}
    </div>
  );
}