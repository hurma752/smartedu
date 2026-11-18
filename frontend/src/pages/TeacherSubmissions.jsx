// src/pages/TeacherSubmissions.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useParams, useNavigate } from "react-router-dom";
import Layout, { PageShell, Btn } from "../components/Layout";
import * as assignmentsApi from "../api/assignments";
import BadgePill from "../components/BadgePill";
import { C } from "../theme";

export default function TeacherSubmissions() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [submissions, setSubmissions]   = useState([]);
  const [selected,    setSelected]      = useState(null);
  const [aiEval,      setAiEval]        = useState(null);
  const [scores,      setScores]        = useState({});
  const [comments,    setComments]      = useState("");
  const [error,       setError]         = useState("");
  const [saved,       setSaved]         = useState(false);
  const [loadingEval, setLoadingEval]   = useState(false);
  const [searchQuery, setSearchQuery]   = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [isEditingGrade, setIsEditingGrade]         = useState(false);
  const [gradeHistory, setGradeHistory]             = useState([]);
  const [showGradeHistoryModal, setShowGradeHistoryModal] = useState(false);
  const [originalScores, setOriginalScores]         = useState({});
  const [originalComments, setOriginalComments]     = useState("");
  const [editReason, setEditReason]                 = useState("");
  const [isSavingGrade, setIsSavingGrade]           = useState(false);

  const [assignment,      setAssignment]      = useState(null);
  const [badgesByStudent, setBadgesByStudent] = useState({});
  const [history,         setHistory]         = useState([]);
  const [showHistory,     setShowHistory]     = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  const loadSubmissions = useCallback(async () => {
    const { data } = await assignmentsApi.listSubmissions(assignmentId);
    setSubmissions(data);
  }, [assignmentId]);

  const loadAssignmentExtras = useCallback(async () => {
    try {
      const { data } = await assignmentsApi.getAssignmentDetail(assignmentId);
      setAssignment(data);
    } catch { /* ignore */ }
    try {
      const { data } = await assignmentsApi.getAssignmentBadges(assignmentId);
      const map = {};
      for (const b of data) {
        if (!map[b.student_id]) map[b.student_id] = [];
        map[b.student_id].push(b);
      }
      setBadgesByStudent(map);
    } catch { /* ignore */ }
    try {
      const { data } = await assignmentsApi.getDeadlineHistory(assignmentId);
      setHistory(data);
    } catch { /* ignore */ }
  }, [assignmentId]);

  useEffect(() => { loadSubmissions(); loadAssignmentExtras(); }, [loadSubmissions, loadAssignmentExtras]);

  const isPastDeadline = assignment?.due_date && new Date() > new Date(assignment.due_date);

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
    setIsEditingGrade(false);
    setEditReason("");
    setGradeHistory([]);

    if (["ai_evaluated", "teacher_reviewed"].includes(submission.status)) {
      setLoadingEval(true);
      try {
        const [evalRes, gradeRes, histRes] = await Promise.all([
          assignmentsApi.getAiEvaluation(submission.id).catch(() => null),
          submission.status === "teacher_reviewed"
            ? assignmentsApi.getFinalGrade(submission.id).catch(() => null)
            : Promise.resolve(null),
          submission.status === "teacher_reviewed"
            ? assignmentsApi.getGradeHistory(submission.id).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (evalRes?.data) {
          setAiEval(evalRes.data);
        }

        if (gradeRes?.data) {
          const loadedScores = gradeRes.data.criteria_scores || {};
          const loadedComments = gradeRes.data.teacher_comments || "";
          setScores(loadedScores);
          setComments(loadedComments);
          setOriginalScores(loadedScores);
          setOriginalComments(loadedComments);
        } else if (evalRes?.data) {
          const loadedScores = evalRes.data.criteria_scores || {};
          setScores(loadedScores);
          setComments("");
          setOriginalScores(loadedScores);
          setOriginalComments("");
        }

        if (histRes?.data) {
          setGradeHistory(histRes.data);
        }
      } catch {
        setError("Couldn't load evaluation details.");
      } finally {
        setLoadingEval(false);
      }
    }
  };

  const criteriaList = useMemo(() => {
    if (assignment?.criteria && assignment.criteria.length > 0) {
      return assignment.criteria;
    }
    if (aiEval?.feedback) {
      let parsed = aiEval.feedback;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = null; }
      }
      if (parsed?.criteria_feedback && parsed.criteria_feedback.length > 0) {
        return parsed.criteria_feedback.map((cf) => ({
          key: cf.key,
          label: cf.label || cf.criterion || cf.key,
          max_marks: Number(cf.max_score) || 0,
        }));
      }
    }
    return [];
  }, [assignment?.criteria, aiEval?.feedback]);

  const rubricTotalMarks = useMemo(() => {
    if (assignment?.total_marks && assignment.total_marks > 0) {
      return assignment.total_marks;
    }
    if (criteriaList.length > 0) {
      return criteriaList.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0);
    }
    return 0;
  }, [assignment?.total_marks, criteriaList]);

  const handleScoreChange = (key, value) => {
    setError("");
    if (value === "") {
      setScores((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    const num = Number(value);
    if (isNaN(num)) return;

    const crit = criteriaList.find((c) => c.key === key || c.label === key);
    const maxMarks = crit?.max_marks;

    let sanitized = num;
    if (sanitized < 0) {
      sanitized = 0;
    }
    if (typeof maxMarks === "number" && sanitized > maxMarks) {
      sanitized = maxMarks;
      setError(`Cannot award more than ${maxMarks} marks for "${crit?.label || key}". Value set to maximum allowed.`);
    }

    setScores((prev) => ({ ...prev, [key]: sanitized }));
  };

  const handleCancelEdit = () => {
    setScores(originalScores);
    setComments(originalComments);
    setEditReason("");
    setIsEditingGrade(false);
    setError("");
  };

  const totalScore = Object.values(scores).reduce((sum, v) => sum + (Number(v) || 0), 0);

  const isAnyCriterionExceeded = Object.entries(scores).some(([key, val]) => {
    if (val === "" || isNaN(Number(val))) return false;
    const num = Number(val);
    if (num < 0) return true;
    const crit = criteriaList.find((c) => c.key === key || c.label === key);
    return crit && typeof crit.max_marks === "number" && num > crit.max_marks;
  });
  const isTotalExceeded = rubricTotalMarks > 0 && totalScore > rubricTotalMarks;
  const isGradeInvalid = isAnyCriterionExceeded || isTotalExceeded;

  const handleSubmitReview = async () => {
    if (!selected) return;
    setError("");

    // Validate each criterion score against limits
    const normalizedScores = {};
    for (const [key, val] of Object.entries(scores)) {
      if (val === "" || val === undefined || isNaN(Number(val))) {
        setError("Please enter a valid numeric mark for all criteria.");
        return;
      }
      const numVal = Math.round(Number(val));
      if (numVal < 0) {
        setError("Marks cannot be negative.");
        return;
      }
      const crit = criteriaList.find((c) => c.key === key || c.label === key);
      const maxMarks = crit?.max_marks;
      if (typeof maxMarks === "number" && numVal > maxMarks) {
        setError(`Marks for "${crit?.label || key}" (${numVal}) cannot exceed maximum allowed marks (${maxMarks}).`);
        return;
      }
      normalizedScores[key] = numVal;
    }

    // Ensure all criteria defined in the rubric are scored
    if (criteriaList.length > 0) {
      for (const crit of criteriaList) {
        if (normalizedScores[crit.key] === undefined && normalizedScores[crit.label] === undefined) {
          setError(`Please award marks for "${crit.label}".`);
          return;
        }
      }
    }

    // Ensure total awarded marks do not exceed rubric total marks
    const currentTotal = Object.values(normalizedScores).reduce((sum, v) => sum + v, 0);
    if (rubricTotalMarks > 0 && currentTotal > rubricTotalMarks) {
      setError(`Total awarded marks (${currentTotal}) cannot exceed the rubric total of ${rubricTotalMarks} marks.`);
      return;
    }

    setIsSavingGrade(true);
    try {
      const isUpdate = selected.status === "teacher_reviewed";
      const payload = {
        criteria_scores: normalizedScores,
        teacher_comments: comments,
        reason: editReason || undefined,
      };

      if (isUpdate) {
        await assignmentsApi.updateGrade(selected.id, payload);
      } else {
        await assignmentsApi.reviewSubmission(selected.id, payload);
      }

      setSaved(true);
      setIsEditingGrade(false);
      setOriginalScores(normalizedScores);
      setScores(normalizedScores);
      setOriginalComments(comments);
      setEditReason("");
      loadSubmissions();
      setSelected((prev) => prev ? { ...prev, status: "teacher_reviewed" } : prev);

      // Refresh grade history
      try {
        const { data: hist } = await assignmentsApi.getGradeHistory(selected.id);
        setGradeHistory(hist);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save review.");
    } finally {
      setIsSavingGrade(false);
    }
  };

  // Counters for header stats
  const graded    = submissions.filter((s) => s.status === "teacher_reviewed").length;
  const pending   = submissions.filter((s) => s.status === "ai_evaluated").length;
  const failed    = submissions.filter((s) => s.status === "failed").length;
  const gradedPct = submissions.length > 0 ? Math.round((graded / submissions.length) * 100) : 0;

  const handleExtended = () => {
    setShowExtendModal(false);
    loadAssignmentExtras();
  };

  // Filtered student list
  const filteredSubmissions = submissions.filter((s) => {
    const nameMatch = (s.student_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === "all") return nameMatch;
    if (statusFilter === "pending") return nameMatch && s.status === "ai_evaluated";
    if (statusFilter === "graded") return nameMatch && s.status === "teacher_reviewed";
    return nameMatch;
  });

  return (
    <Layout>
      <PageShell
        title={assignment?.title || "Submission Review"}
        subtitle={
          `${submissions.length} submission${submissions.length !== 1 ? "s" : ""}` +
          (assignment?.due_date
            ? ` · ${isPastDeadline ? "Closed" : "Due"} ${new Date(assignment.due_date).toLocaleString()}`
            : "")
        }
        action={
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <Btn variant="ghost" onClick={() => setShowHistory(true)}>
              <i className="ti ti-history" style={{ fontSize: "14px" }} />History{history.length > 0 ? ` (${history.length})` : ""}
            </Btn>
            <Btn variant="ghost" onClick={() => setShowExtendModal(true)}>
              <i className="ti ti-calendar-time" style={{ fontSize: "14px" }} />Extend Deadline
            </Btn>
            <Btn variant="ghost" onClick={() => navigate(-1)}>
              <i className="ti ti-arrow-left" style={{ fontSize: "14px" }} />Back
            </Btn>
          </div>
        }
      >
        {/* ── Metric Summary Bar ── */}
        {submissions.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
            <MetricCard title="Graded Progress" value={`${gradedPct}%`} sub={`${graded} of ${submissions.length} finalized`} icon="ti-circle-check" color={C.successText} bg={C.successBg} border={C.successBorder} />
            <MetricCard title="Ready to Grade" value={pending} sub="AI analysis complete" icon="ti-sparkles" color={C.infoText} bg={C.infoBg} border={C.infoBorder} />
            <MetricCard title="Failed / Issues" value={failed} sub="Needs teacher attention" icon="ti-alert-circle" color={C.dangerText} bg={C.dangerBg} border={C.dangerBorder} />
          </div>
        )}

        {/* ── Main Layout: Student List | Submission Detail ── */}
        <div style={{ display: "grid", gridTemplateColumns: selected ? "300px 1fr" : "1fr", gap: "16px", alignItems: "start" }}>

          {/* Left: Student Submissions Roster */}
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Students</span>
                <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "20px", background: C.subtleBg, color: C.textMuted }}>{filteredSubmissions.length}</span>
              </div>

              {/* Search & Status Filters */}
              <div style={{ position: "relative" }}>
                <i className="ti ti-search" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", color: C.textMuted }} />
                <input
                  type="text"
                  placeholder="Search student..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 10px 7px 30px", fontSize: "12px", color: C.textPrimary, outline: "none", boxSizing: "border-box" }}
                />
              </div>

              <div style={{ display: "flex", gap: "4px" }}>
                {["all", "pending", "graded"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{ flex: 1, padding: "4px 8px", borderRadius: "5px", border: "none", background: statusFilter === st ? C.primary : C.subtleBg, color: statusFilter === st ? C.primaryText : C.textSecondary, fontSize: "11px", fontWeight: "600", cursor: "pointer", textTransform: "capitalize" }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredSubmissions.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <i className="ti ti-inbox" style={{ fontSize: "28px", color: C.border, display: "block", marginBottom: "10px" }} />
                <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>No submissions yet.</p>
              </div>
            ) : (
              filteredSubmissions.map((s, i) => (
                <StudentRow
                  key={s.id}
                  submission={s}
                  badges={badgesByStudent[s.student_id] || []}
                  isSelected={selected?.id === s.id}
                  isLast={i === filteredSubmissions.length - 1}
                  onClick={() => openReview(s)}
                />
              ))
            )}
          </div>

          {/* Right: Selected Submission Review */}
          {selected && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>

              {/* Student Header Card */}
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
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                      <StatusPill status={selected.status} />
                      <span style={{ fontSize: "11px", color: C.textMuted }}>Submitted: {new Date(selected.submitted_at).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* PDF Actions & Edit Grade */}
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  {selected.status === "teacher_reviewed" && !isEditingGrade && (
                    <ActionBtn
                      icon="ti-edit"
                      label="Edit Grade"
                      variant="accent"
                      onClick={() => {
                        setIsEditingGrade(true);
                        setSaved(false);
                        setError("");
                      }}
                    />
                  )}
                  <ActionBtn icon="ti-eye"      label="View PDF"    onClick={() => assignmentsApi.viewSubmissionFile(selected.id)} />
                  <ActionBtn icon="ti-download" label="Download"    onClick={() => assignmentsApi.downloadSubmissionFile(selected.id)} />
                </div>
              </div>

              {/* Banners */}
              {error && <InlineBanner variant="error">{error}</InlineBanner>}
              {saved  && <InlineBanner variant="success">Grade saved successfully.</InlineBanner>}

              {/* Plagiarism Analysis Card */}
              {selected.status !== "failed" && selected.status !== "processing" && (
                <PlagiarismCard
                  submissionId={selected.id}
                  assignmentId={assignmentId}
                  onRecomputed={loadSubmissions}
                />
              )}

              {/* OCR Text Block */}
              {selected.extracted_text && (
                <OCRBlock
                  text={selected.extracted_text}
                  confidence={selected.extraction_confidence}
                  engine={selected.ocr_engine_used}
                  status={selected.extraction_status}
                  needsReview={selected.needs_review}
                  processingTime={selected.ocr_processing_time}
                  submissionId={selected.id}
                  onReprocess={loadSubmissions}
                />
              )}

              {/* Failed state */}
              {selected.status === "failed" && (
                <InlineBanner variant="error">{selected.error_message || "AI evaluation failed for this submission."}</InlineBanner>
              )}

              {/* Processing state */}
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

              {/* Main Review Grid: AI Feedback | Rubric Scoring */}
              {aiEval && !loadingEval && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", alignItems: "start" }}>

                  {/* Left Column: AI Feedback */}
                  <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, overflow: "hidden" }}>
                    <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
                      <i className="ti ti-sparkles" style={{ fontSize: "15px", color: C.infoText }} />
                      <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>AI Feedback</span>
                    </div>
                    <div style={{ padding: "14px 16px" }}>
                      <AIFeedback eval_={aiEval} />
                    </div>
                  </div>

                  {/* Right Column: Scoring & Final Approval */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <ScoreCard
                      scores={scores}
                      totalScore={totalScore}
                      criteriaList={criteriaList}
                      rubricTotalMarks={rubricTotalMarks}
                      onScoreChange={handleScoreChange}
                      alreadyGraded={selected.status === "teacher_reviewed" && !isEditingGrade}
                      isEditing={isEditingGrade}
                    />
                    <CommentsCard
                      value={comments}
                      onChange={setComments}
                      alreadyGraded={selected.status === "teacher_reviewed" && !isEditingGrade}
                      isEditing={isEditingGrade}
                    />
                    {selected.status !== "teacher_reviewed" ? (
                      <button
                        onClick={handleSubmitReview}
                        disabled={isSavingGrade || isGradeInvalid}
                        className="btn-interactive"
                        title={isGradeInvalid ? (isAnyCriterionExceeded ? "Marks exceed criterion limit" : "Total marks exceed rubric limit") : "Approve and finalize grade"}
                        style={{
                          width: "100%",
                          padding: "13px",
                          borderRadius: "8px",
                          border: "none",
                          background: isGradeInvalid ? C.border : C.primary,
                          color: isGradeInvalid ? C.textMuted : C.primaryText,
                          fontSize: "14px",
                          fontWeight: "600",
                          fontFamily: "inherit",
                          cursor: isSavingGrade || isGradeInvalid ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                        }}
                      >
                        <i className={`ti ${isSavingGrade ? "ti-loader-2" : "ti-check"}`} style={{ fontSize: "16px", animation: isSavingGrade ? "spin 1s linear infinite" : "none" }} />
                        {isSavingGrade ? "Saving grade…" : "Approve & finalize grade"}
                      </button>
                    ) : !isEditingGrade ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                          <InlineBanner variant="success" style={{ margin: 0, flex: 1 }}>
                            This submission has been graded.
                          </InlineBanner>
                          {gradeHistory.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setShowGradeHistoryModal(true)}
                              className="btn-interactive"
                              title="View revision history for this grade"
                              style={{
                                padding: "7px 12px",
                                borderRadius: "6px",
                                border: `1px solid ${C.border}`,
                                background: C.cardBg,
                                color: C.textSecondary,
                                fontSize: "12px",
                                fontWeight: "600",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <i className="ti ti-history" style={{ fontSize: "14px", color: C.accent }} />
                              History ({gradeHistory.length})
                            </button>
                          )}
                        </div>

                        <button
                          type="button"
                          id="btn-edit-grade"
                          onClick={() => {
                            setIsEditingGrade(true);
                            setSaved(false);
                            setError("");
                          }}
                          className="btn-interactive"
                          style={{
                            width: "100%",
                            padding: "13px",
                            borderRadius: "8px",
                            border: `1.5px solid ${C.accent}`,
                            background: C.accentTint,
                            color: C.accentText,
                            fontSize: "14px",
                            fontWeight: "700",
                            fontFamily: "inherit",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                          }}
                        >
                          <i className="ti ti-edit" style={{ fontSize: "16px" }} />
                          Edit Grade
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "12px 14px" }}>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: C.textPrimary, marginBottom: "6px" }}>
                            Revision Reason <span style={{ fontWeight: "400", color: C.textMuted }}>(optional)</span>
                          </label>
                          <input
                            type="text"
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            placeholder="e.g. Re-evaluated criterion 2, corrected marks"
                            style={{
                              width: "100%",
                              boxSizing: "border-box",
                              background: C.inputBg,
                              border: `1px solid ${C.border}`,
                              borderRadius: "6px",
                              padding: "8px 10px",
                              fontSize: "13px",
                              color: C.textPrimary,
                              fontFamily: "inherit",
                              outline: "none",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={isSavingGrade}
                            className="btn-interactive"
                            style={{
                              flex: "1",
                              padding: "12px",
                              borderRadius: "8px",
                              border: `1px solid ${C.border}`,
                              background: C.cardBg,
                              color: C.textSecondary,
                              fontSize: "13px",
                              fontWeight: "600",
                              fontFamily: "inherit",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                          >
                            <i className="ti ti-x" style={{ fontSize: "15px" }} />
                            Cancel
                          </button>

                          <button
                            type="button"
                            id="btn-save-revised-grade"
                            onClick={handleSubmitReview}
                            disabled={isSavingGrade || isGradeInvalid}
                            className="btn-interactive"
                            title={isGradeInvalid ? (isAnyCriterionExceeded ? "Marks exceed criterion limit" : "Total marks exceed rubric limit") : "Save revised grade"}
                            style={{
                              flex: "2",
                              padding: "12px",
                              borderRadius: "8px",
                              border: "none",
                              background: isGradeInvalid ? C.border : C.primary,
                              color: isGradeInvalid ? C.textMuted : C.primaryText,
                              fontSize: "14px",
                              fontWeight: "700",
                              fontFamily: "inherit",
                              cursor: isSavingGrade || isGradeInvalid ? "not-allowed" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: "8px",
                            }}
                          >
                            <i className={`ti ${isSavingGrade ? "ti-loader-2" : "ti-device-floppy"}`} style={{ fontSize: "16px", animation: isSavingGrade ? "spin 1s linear infinite" : "none" }} />
                            {isSavingGrade ? "Saving revision…" : "Save Revised Grade"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showExtendModal && (
          <ExtendDeadlineModal
            assignmentId={assignmentId}
            currentDueDate={assignment?.due_date}
            onClose={() => setShowExtendModal(false)}
            onExtended={handleExtended}
          />
        )}

        {showHistory && (
          <DeadlineHistoryModal history={history} onClose={() => setShowHistory(false)} />
        )}

        {showGradeHistoryModal && (
          <GradeHistoryModal
            history={gradeHistory}
            studentName={selected?.student_name}
            onClose={() => setShowGradeHistoryModal(false)}
          />
        )}
      </PageShell>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({ title, value, sub, icon, color, bg, border }) {
  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", borderLeft: `3px solid ${color}` }}>
      <div style={{ width: "34px", height: "34px", borderRadius: "6px", background: bg, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <i className={`ti ${icon}`} style={{ fontSize: "16px", color }} />
      </div>
      <div>
        <p style={{ fontSize: "11px", fontWeight: "600", color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 2px" }}>{title}</p>
        <span style={{ fontSize: "18px", fontWeight: "700", color: C.textPrimary }}>{value}</span>
        <span style={{ fontSize: "11px", color: C.textMuted, display: "block", marginTop: "1px" }}>{sub}</span>
      </div>
    </div>
  );
}

function StudentRow({ submission: s, badges = [], isSelected, isLast, onClick }) {
  const [hovered, setHovered] = useState(false);

  const cta = {
    ai_evaluated:     { label: "Review & grade", icon: "ti-clipboard-check", style: { background: C.primary, color: C.primaryText, border: "none" } },
    teacher_reviewed: { label: "View / Edit",    icon: "ti-edit",            style: { background: "transparent", color: C.textSecondary, border: `1px solid ${C.border}` } },
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
        background: isSelected ? C.subtleBg : hovered ? C.subtleBg : "none",
        borderLeft: isSelected ? `3px solid ${C.primary}` : "3px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <div onClick={!cta.disabled ? onClick : undefined}
        style={{ minWidth: 0, flex: 1, cursor: cta.disabled ? "default" : "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
          <p style={{ fontSize: "13px", fontWeight: isSelected ? "600" : "500", color: C.textPrimary, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.student_name || `Student #${s.student_id}`}
          </p>
          {badges.map((b) => (
            <BadgePill key={b.id} badge={b} size="sm" showTooltip={false} />
          ))}
        </div>
      </div>

      {s.plagiarism_score !== null && s.plagiarism_score !== undefined && s.plagiarism_score > 0 && (
        <span style={{
          fontSize: "11px", fontWeight: "600", padding: "2px 6px", borderRadius: "12px",
          background: s.plagiarism_score >= 40 ? C.dangerBg : s.plagiarism_score >= 15 ? C.warningBg : C.successBg,
          color: s.plagiarism_score >= 40 ? C.dangerText : s.plagiarism_score >= 15 ? C.warningText : C.successText,
          border: `1px solid ${s.plagiarism_score >= 40 ? C.dangerBorder : s.plagiarism_score >= 15 ? C.warningBorder : C.successBorder}`,
          whiteSpace: "nowrap"
        }}>
          {s.plagiarism_score.toFixed(0)}% sim
        </span>
      )}

      <StatusPill status={s.status} />

      <button
        onClick={!cta.disabled ? onClick : undefined}
        disabled={cta.disabled}
        className="btn-interactive"
        style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          padding: "6px 11px", borderRadius: "6px",
          fontSize: "12px", fontWeight: "500", fontFamily: "inherit",
          cursor: cta.disabled ? "not-allowed" : "pointer",
          whiteSpace: "nowrap", flexShrink: 0,
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "20px", background: map.bg, color: map.txt, whiteSpace: "nowrap", flexShrink: 0, marginLeft: "4px" }}>
      <i className={`ti ${map.icon}`} style={{ fontSize: "11px" }} />
      {map.label}
    </span>
  );
}

function ActionBtn({ icon, label, onClick, variant = "default" }) {
  const isAccent = variant === "accent";
  return (
    <button
      onClick={onClick}
      className="btn-interactive"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 12px",
        borderRadius: "6px",
        background: isAccent ? C.accentTint : C.subtleBg,
        border: `1px solid ${isAccent ? C.accentBorder : C.border}`,
        color: isAccent ? C.accentText : C.textPrimary,
        fontSize: "13px",
        fontWeight: "600",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: "15px" }} />
      {label}
    </button>
  );
}

function InlineBanner({ children, variant = "error" }) {
  const isErr = variant === "error";
  return (
    <div style={{ background: isErr ? C.dangerBg : C.successBg, border: `1px solid ${isErr ? C.dangerBorder : C.successBorder}`, borderRadius: "8px", padding: "12px 16px", fontSize: "13px", color: isErr ? C.dangerText : C.successText, display: "flex", alignItems: "center", gap: "8px" }}>
      <i className={`ti ${isErr ? "ti-alert-circle" : "ti-circle-check"}`} style={{ fontSize: "16px", flexShrink: 0 }} />
      {children}
    </div>
  );
}

function PlagiarismCard({ submissionId, assignmentId, onRecomputed }) {
  const [report, setReport]           = useState(null);
  const [loading, setLoading]         = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [expanded, setExpanded]       = useState(false);

  const fetchReport = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const { data } = await assignmentsApi.getPlagiarismReport(submissionId);
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleRecompute = async () => {
    if (!assignmentId) return;
    setRecomputing(true);
    try {
      await assignmentsApi.recomputePlagiarism(assignmentId);
      await fetchReport();
      if (onRecomputed) onRecomputed();
    } catch {
      /* ignore */
    } finally {
      setRecomputing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "16px", textAlign: "center" }}>
        <i className="ti ti-loader-2" style={{ fontSize: "22px", color: C.accent, animation: "spin 1s linear infinite", marginBottom: "6px" }} />
        <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>Checking plagiarism report…</p>
      </div>
    );
  }

  if (!report) return null;

  const isHigh   = (report.risk_level || "").toUpperCase() === "HIGH";
  const isMedium = (report.risk_level || "").toUpperCase() === "MEDIUM";

  const riskColor = isHigh ? C.dangerText : isMedium ? C.warningText : C.successText;
  const riskBg = isHigh ? C.dangerBg : isMedium ? C.warningBg : C.successBg;
  const riskBorder = isHigh ? C.dangerBorder : isMedium ? C.warningBorder : C.successBorder;
  const totalScore = (report.percentage_score ?? (report.similarity_score * 100) ?? 0).toFixed(1);

  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "16px", marginBottom: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <i className="ti ti-shield-search" style={{ fontSize: "18px", color: C.accent }} />
          <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>Plagiarism Analysis</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="btn-interactive"
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 8px", borderRadius: "6px", background: C.subtleBg, border: `1px solid ${C.border}`, color: C.textSecondary, fontSize: "11px", fontWeight: "600", cursor: recomputing ? "not-allowed" : "pointer" }}
          >
            <i className={`ti ${recomputing ? "ti-loader-2" : "ti-refresh"}`} style={{ fontSize: "12px", animation: recomputing ? "spin 1s linear infinite" : "none" }} />
            Recheck
          </button>
          <span style={{ fontSize: "11px", fontWeight: "700", padding: "3px 8px", borderRadius: "12px", background: riskBg, color: riskColor, border: `1px solid ${riskBorder}` }}>
            {(report.risk_level || "LOW").toUpperCase()} RISK ({totalScore}%)
          </span>
        </div>
      </div>

      <div style={{ background: C.infoBg, border: `1px solid ${C.infoBorder}`, borderRadius: "6px", padding: "8px 10px", marginBottom: "12px", display: "flex", alignItems: "center", gap: "7px", fontSize: "11px", color: C.infoText, lineHeight: "1.4" }}>
        <i className="ti ti-info-circle" style={{ fontSize: "14px", flexShrink: 0 }} />
        <span>Similarity findings inform grading decisions but do not mandate a penalty. Evaluate assignment mastery & originality directly.</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "8px", marginBottom: "12px" }}>
        <div style={{ background: C.subtleBg, padding: "8px 10px", borderRadius: "6px" }}>
          <span style={{ fontSize: "11px", color: C.textMuted, display: "block" }}>TF-IDF Similarity</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>{((report.tfidf_score || 0) * 100).toFixed(1)}%</span>
        </div>
        <div style={{ background: C.subtleBg, padding: "8px 10px", borderRadius: "6px" }}>
          <span style={{ fontSize: "11px", color: C.textMuted, display: "block" }}>Shingle Overlap</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>{((report.shingle_score || 0) * 100).toFixed(1)}%</span>
        </div>
        <div style={{ background: C.subtleBg, padding: "8px 10px", borderRadius: "6px" }}>
          <span style={{ fontSize: "11px", color: C.textMuted, display: "block" }}>Semantic Embeddings</span>
          <span style={{ fontSize: "14px", fontWeight: "600", color: C.textPrimary }}>{((report.semantic_score ?? report.embedding_score ?? 0) * 100).toFixed(1)}%</span>
        </div>
      </div>

      {report.summary && (
        <p style={{ fontSize: "12px", color: C.textSecondary, margin: "0 0 12px", lineHeight: "1.5" }}>
          {report.summary}
        </p>
      )}

      {report.matching_spans && report.matching_spans.length > 0 ? (
        <div style={{ marginTop: "10px" }}>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "8px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: "12px", color: C.textPrimary, fontWeight: "600" }}
          >
            <span><i className="ti ti-highlight" style={{ marginRight: "6px", color: C.warningText }} />{report.matching_spans.length} Highlighted Matching Text Section{report.matching_spans.length > 1 ? "s" : ""}</span>
            <i className={`ti ${expanded ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: "13px" }} />
          </button>
          {expanded && (
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
              {report.matching_spans.map((span, idx) => (
                <div key={idx} style={{ background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: "6px", padding: "9px 12px", fontSize: "12px", color: C.textPrimary }}>
                  <p style={{ margin: 0, fontStyle: "italic", lineHeight: "1.4", wordBreak: "break-word" }}>"{span.text}"</p>
                  <span style={{ fontSize: "10px", color: C.textMuted, display: "block", marginTop: "4px" }}>
                    Matching section length: {span.length} characters (Position {span.source_start}–{span.source_end})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: C.subtleBg, border: `1px dashed ${C.border}`, borderRadius: "6px", padding: "10px 12px", fontSize: "12px", color: C.textMuted, lineHeight: "1.4" }}>
          No direct text overlap passages detected.
        </div>
      )}
    </div>
  );
}

function OCRBlock({ text, confidence, engine, status, needsReview, processingTime, submissionId, onReprocess }) {
  const [open, setOpen] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);

  const handleReprocess = async (e) => {
    e.stopPropagation();
    if (!submissionId) return;
    setReprocessing(true);
    try {
      await assignmentsApi.reprocessOcr(submissionId);
      if (onReprocess) onReprocess();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to trigger OCR re-processing");
    } finally {
      setReprocessing(false);
    }
  };

  const engineLabel = {
    pymupdf: "PyMuPDF (typed)",
    tesseract: "Tesseract",
    trocr: "TrOCR (handwriting)",
    "vlm+trocr": "Hybrid VLM + TrOCR",
    vlm: "Ollama VLM",
    "tesseract+trocr": "Tesseract + TrOCR",
    tesseract_fallback: "Tesseract (fallback)",
  }[engine] || engine;

  const isUncertain = needsReview || status === "ocr_needs_review" || status === "ocr_low_confidence";

  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${isUncertain ? C.warningBorder || "#F59E0B" : C.border}`, overflow: "hidden", marginBottom: "16px" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ width: "100%", padding: "12px 16px", background: isUncertain ? C.warningBg : "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", flexWrap: "wrap", gap: "8px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <i className="ti ti-scan" style={{ fontSize: "16px", color: isUncertain ? C.warningText : C.accent }} />
          <span style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary }}>Extracted OCR Text</span>
          {isUncertain && (
            <span style={{ fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "12px", background: C.warningBg, border: `1px solid ${C.warningText}`, color: C.warningText, display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: "12px" }} />
              OCR Uncertain (Needs Review)
            </span>
          )}
          {engine && (
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: C.subtleBg, border: `1px solid ${C.border}`, color: C.textSecondary }}>
              Engine: {engineLabel}
            </span>
          )}
          {confidence != null && (
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: C.subtleBg, border: `1px solid ${C.border}`, color: C.textSecondary }}>
              Quality Score: {Math.round(confidence)}%
            </span>
          )}
          {processingTime != null && (
            <span style={{ fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "12px", background: C.subtleBg, border: `1px solid ${C.border}`, color: C.textMuted }}>
              {processingTime}s
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {submissionId && (
            <button
              onClick={handleReprocess}
              disabled={reprocessing}
              className="btn-interactive"
              style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "4px 10px", borderRadius: "5px",
                background: C.subtleBg, border: `1px solid ${C.border}`,
                color: C.textSecondary, fontSize: "11px", fontWeight: "600",
                cursor: reprocessing ? "not-allowed" : "pointer",
              }}
            >
              <i className={`ti ${reprocessing ? "ti-loader-2" : "ti-refresh"}`} style={{ fontSize: "11px", animation: reprocessing ? "spin 1s linear infinite" : "none" }} />
              Reprocess OCR
            </button>
          )}
          <i className={`ti ${open ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: "14px", color: C.textMuted }} />
        </div>
      </button>

      {open && (
        <div style={{ padding: "16px", borderTop: `1px solid ${C.border}` }}>
          <pre style={{ fontSize: "12px", color: C.textSecondary, background: C.subtleBg, padding: "14px", borderRadius: "6px", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: "monospace", maxHeight: "400px", overflowY: "auto" }}>
            {text}
          </pre>
        </div>
      )}
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

function ScoreCard({
  scores,
  totalScore,
  criteriaList = [],
  rubricTotalMarks = 0,
  onScoreChange,
  alreadyGraded,
  isEditing,
}) {
  const criteriaKeys = new Set(criteriaList.map((c) => c.key));
  const criteriaLabels = new Set(criteriaList.map((c) => c.label));

  const items = criteriaList.map((c) => {
    const val = scores[c.key] !== undefined ? scores[c.key] : (scores[c.label] !== undefined ? scores[c.label] : 0);
    return {
      key: c.key,
      label: c.label || c.key.replace(/_/g, " "),
      maxMarks: c.max_marks,
      description: c.description,
      value: val,
    };
  });

  for (const [k, v] of Object.entries(scores)) {
    if (!criteriaKeys.has(k) && !criteriaLabels.has(k)) {
      items.push({
        key: k,
        label: k.replace(/_/g, " "),
        maxMarks: undefined,
        description: null,
        value: v,
      });
    }
  }

  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: isEditing ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
        <i className="ti ti-clipboard-check" style={{ fontSize: "15px", color: isEditing ? C.accent : C.textMuted }} />
        <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Rubric Scores</span>
        {isEditing ? (
          <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.accentBorder}` }}>
            Editing Marks
          </span>
        ) : alreadyGraded ? (
          <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "600", color: C.successText, background: C.successBg, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.successBorder}` }}>
            Finalized
          </span>
        ) : null}
      </div>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((item) => {
            const isOverMax = typeof item.maxMarks === "number" && Number(item.value) > item.maxMarks;
            const isNegative = Number(item.value) < 0;
            const hasError = isOverMax || isNegative;

            return (
              <div key={item.key} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={{ display: "block", fontSize: "13px", color: C.textPrimary, textTransform: "capitalize", fontWeight: "500", lineHeight: "1.3" }}>
                      {item.label}
                    </label>
                    {item.description && (
                      <span style={{ fontSize: "11px", color: C.textMuted, display: "block", marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.description}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="number"
                      min="0"
                      max={item.maxMarks}
                      value={item.value}
                      disabled={alreadyGraded}
                      onChange={(e) => onScoreChange(item.key, e.target.value)}
                      onBlur={(e) => {
                        if (!alreadyGraded) {
                          e.target.style.borderColor = hasError ? C.dangerBorder : isEditing ? C.accent : C.border;
                          e.target.style.background = alreadyGraded ? C.subtleBg : hasError ? C.dangerBg : C.inputBg;
                          e.target.style.boxShadow = "none";
                          if (e.target.value === "" || isNaN(Number(e.target.value))) {
                            onScoreChange(item.key, 0);
                          }
                        }
                      }}
                      onFocus={(e) => {
                        if (!alreadyGraded) {
                          e.target.style.borderColor = hasError ? C.dangerBorder : C.focusBorder;
                          e.target.style.background = C.inputFocus;
                          e.target.style.boxShadow = hasError
                            ? "0 0 0 3px rgba(239, 68, 68, 0.15)"
                            : "0 0 0 3px rgba(17,17,17,0.08)";
                        }
                      }}
                      style={{
                        width: "60px",
                        background: alreadyGraded ? C.subtleBg : hasError ? C.dangerBg : C.inputBg,
                        border: `1.5px solid ${hasError ? C.dangerBorder : isEditing ? C.accent : C.border}`,
                        borderRadius: "6px",
                        padding: "6px 8px",
                        fontSize: "14px",
                        fontWeight: "600",
                        color: hasError ? C.dangerText : C.textPrimary,
                        fontFamily: "inherit",
                        outline: "none",
                        textAlign: "center",
                        cursor: alreadyGraded ? "default" : "text",
                      }}
                    />
                    {typeof item.maxMarks === "number" && (
                      <span style={{ fontSize: "12px", fontWeight: "600", color: C.textMuted, minWidth: "38px" }}>
                        / {item.maxMarks}
                      </span>
                    )}
                  </div>
                </div>
                {hasError && (
                  <span style={{ fontSize: "11px", color: C.dangerText, fontWeight: "600", textAlign: "right" }}>
                    {isOverMax
                      ? `Exceeds max allowed (${item.maxMarks} marks)`
                      : "Marks cannot be negative"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Total */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px", paddingTop: "12px", borderTop: `2px solid ${C.border}` }}>
          <div>
            <span style={{ fontSize: "13px", fontWeight: "700", color: C.textPrimary, display: "block" }}>Total Marks</span>
            {rubricTotalMarks > 0 && totalScore > rubricTotalMarks && (
              <span style={{ fontSize: "11px", color: C.dangerText, fontWeight: "600" }}>
                Exceeds rubric total ({rubricTotalMarks})
              </span>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <span
              style={{
                fontSize: "22px",
                fontWeight: "800",
                letterSpacing: "-0.03em",
                color: rubricTotalMarks > 0 && totalScore > rubricTotalMarks
                  ? C.dangerText
                  : isEditing
                  ? C.accent
                  : C.textPrimary,
              }}
            >
              {totalScore}
            </span>
            {rubricTotalMarks > 0 && (
              <span style={{ fontSize: "13px", fontWeight: "600", color: C.textMuted, marginLeft: "4px" }}>
                / {rubricTotalMarks}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentsCard({ value, onChange, alreadyGraded, isEditing }) {
  return (
    <div style={{ background: C.cardBg, borderRadius: "8px", border: isEditing ? `1.5px solid ${C.accent}` : `1px solid ${C.border}`, overflow: "hidden" }}>
      <div style={{ padding: "13px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "8px" }}>
        <i className="ti ti-message" style={{ fontSize: "15px", color: isEditing ? C.accent : C.textMuted }} />
        <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>Your Comments</span>
        <span style={{ fontSize: "11px", color: C.textMuted, marginLeft: "2px" }}>{isEditing ? "(editable)" : "(optional)"}</span>
        {isEditing && (
          <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "700", color: C.accentText, background: C.accentTint, padding: "2px 8px", borderRadius: "20px", border: `1px solid ${C.accentBorder}` }}>
            Editing Feedback
          </span>
        )}
      </div>
      <div style={{ padding: "12px 16px" }}>
        <textarea
          value={value}
          disabled={alreadyGraded}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder="Add anything the AI feedback missed…"
          style={{ width: "100%", background: alreadyGraded ? C.subtleBg : C.inputBg, border: `1.5px solid ${isEditing ? C.accent : "transparent"}`, borderRadius: "6px", padding: "9px 12px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", cursor: alreadyGraded ? "default" : "text" }}
          onFocus={(e) => { if (!alreadyGraded) { e.target.style.borderColor = C.focusBorder; e.target.style.background = C.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; } }}
          onBlur={(e)  => { e.target.style.borderColor = isEditing ? C.accent : "transparent"; e.target.style.background = alreadyGraded ? C.subtleBg : C.inputBg; e.target.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

function ExtendDeadlineModal({ assignmentId, currentDueDate, onClose, onExtended }) {
  const [newDueDate, setNewDueDate] = useState(toLocalInputValue(currentDueDate));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!newDueDate) { setError("Please choose a new due date."); return; }
    setError("");
    setSaving(true);
    try {
      await assignmentsApi.extendDeadline(assignmentId, new Date(newDueDate).toISOString(), reason || undefined);
      onExtended();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't update the deadline.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary }}>Extend Deadline</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: "4px" }}>
          <i className="ti ti-x" style={{ fontSize: "16px" }} />
        </button>
      </div>
      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
        {error && <InlineBanner variant="error">{error}</InlineBanner>}
        {currentDueDate && (
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            Current deadline: {new Date(currentDueDate).toLocaleString()}
          </p>
        )}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: C.textPrimary, marginBottom: "6px" }}>New due date & time</label>
          <input
            type="datetime-local"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "9px 12px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: C.textPrimary, marginBottom: "6px" }}>Reason <span style={{ fontWeight: "400", color: C.textMuted }}>(optional)</span></label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Extended due to server downtime"
            style={{ width: "100%", boxSizing: "border-box", background: C.inputBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "9px 12px", fontSize: "13px", color: C.textPrimary, fontFamily: "inherit", outline: "none", resize: "vertical" }}
          />
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-interactive"
          style={{ padding: "9px 16px", borderRadius: "7px", border: "none", background: C.primary, color: C.primaryText, fontSize: "13px", fontWeight: "600", fontFamily: "inherit", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: "6px" }}
        >
          <i className="ti ti-check" style={{ fontSize: "14px" }} />{saving ? "Saving…" : "Save deadline"}
        </button>
      </div>
    </ModalOverlay>
  );
}

function DeadlineHistoryModal({ history, onClose }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary }}>Deadline Extension History</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: "4px" }}>
          <i className="ti ti-x" style={{ fontSize: "16px" }} />
        </button>
      </div>
      <div style={{ padding: history.length ? "8px 0" : "32px 20px", textAlign: history.length ? "left" : "center" }}>
        {history.length === 0 ? (
          <>
            <i className="ti ti-clock-off" style={{ fontSize: "26px", color: C.border, display: "block", marginBottom: "8px" }} />
            <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>No deadline changes yet.</p>
          </>
        ) : (
          history.map((h, i) => (
            <div key={h.id} style={{ padding: "12px 20px", borderBottom: i === history.length - 1 ? "none" : `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", marginBottom: "4px" }}>
                <span style={{ color: C.textMuted, textDecoration: "line-through" }}>
                  {h.previous_due_date ? new Date(h.previous_due_date).toLocaleString() : "No deadline"}
                </span>
                <i className="ti ti-arrow-right" style={{ fontSize: "12px", color: C.textMuted }} />
                <span style={{ fontWeight: "600", color: C.textPrimary }}>{new Date(h.new_due_date).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
                By {h.updated_by} · {new Date(h.updated_at).toLocaleString()}
              </p>
              {h.reason && <p style={{ fontSize: "12px", color: C.textSecondary, margin: "4px 0 0" }}>"{h.reason}"</p>}
            </div>
          ))
        )}
      </div>
    </ModalOverlay>
  );
}

function GradeHistoryModal({ history, studentName, onClose }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: "15px", fontWeight: "700", color: C.textPrimary, display: "block" }}>Grade Revision History</span>
          {studentName && <span style={{ fontSize: "12px", color: C.textMuted }}>{studentName}</span>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, padding: "4px" }}>
          <i className="ti ti-x" style={{ fontSize: "16px" }} />
        </button>
      </div>
      <div style={{ padding: history && history.length ? "8px 0" : "32px 20px", textAlign: history && history.length ? "left" : "center", maxHeight: "60vh", overflowY: "auto" }}>
        {!history || history.length === 0 ? (
          <>
            <i className="ti ti-history-toggle-off" style={{ fontSize: "28px", color: C.border, display: "block", marginBottom: "8px" }} />
            <p style={{ fontSize: "13px", color: C.textMuted, margin: 0 }}>No revisions recorded yet.</p>
          </>
        ) : (
          history.map((h, i) => {
            const diff = h.new_total_score - h.previous_total_score;
            return (
              <div key={h.id || i} style={{ padding: "14px 20px", borderBottom: i === history.length - 1 ? "none" : `1px solid ${C.border}`, background: i === 0 ? C.subtleBg : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px" }}>
                    <span style={{ color: C.textMuted, textDecoration: "line-through", fontWeight: "600" }}>
                      {h.previous_total_score} pts
                    </span>
                    <i className="ti ti-arrow-right" style={{ fontSize: "12px", color: C.textMuted }} />
                    <span style={{ fontWeight: "700", color: C.primary }}>
                      {h.new_total_score} pts
                    </span>
                    <span style={{
                      fontSize: "11px", fontWeight: "700", padding: "1px 6px", borderRadius: "10px",
                      background: diff > 0 ? C.successBg : diff < 0 ? C.dangerBg : C.subtleBg,
                      color: diff > 0 ? C.successText : diff < 0 ? C.dangerText : C.textMuted,
                      border: `1px solid ${diff > 0 ? C.successBorder : diff < 0 ? C.dangerBorder : C.border}`
                    }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: C.textMuted }}>
                    {new Date(h.updated_at).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: C.textMuted, margin: "0 0 6px" }}>
                  Revised by <strong>{h.updated_by_name || "Instructor"}</strong>
                </p>
                {h.reason && (
                  <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px 10px", marginBottom: "8px", fontSize: "12px", color: C.textSecondary }}>
                    <strong style={{ color: C.textPrimary }}>Reason:</strong> {h.reason}
                  </div>
                )}
                {h.new_criteria_scores && Object.keys(h.new_criteria_scores).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                    {Object.entries(h.new_criteria_scores).map(([k, newVal]) => {
                      const oldVal = h.previous_criteria_scores ? h.previous_criteria_scores[k] : undefined;
                      const cDiff = oldVal !== undefined ? newVal - oldVal : null;
                      return (
                        <span key={k} style={{ fontSize: "11px", padding: "2px 7px", borderRadius: "4px", background: C.cardBg, border: `1px solid ${C.border}`, color: C.textPrimary, textTransform: "capitalize" }}>
                          {k.replace(/_/g, " ")}: {oldVal !== undefined && oldVal !== newVal ? `${oldVal} ➔ ` : ""}{newVal}
                          {cDiff !== null && cDiff !== 0 && (
                            <span style={{ color: cDiff > 0 ? C.successText : C.dangerText, marginLeft: "4px", fontWeight: "700" }}>
                              ({cDiff > 0 ? `+${cDiff}` : cDiff})
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
                {h.new_comments && (
                  <p style={{ fontSize: "12px", color: C.textSecondary, margin: "6px 0 0", fontStyle: "italic" }}>
                    Feedback: "{h.new_comments}"
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({ children, onClose }) {
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "20px", boxSizing: "border-box" }}
    >
      <div onClick={(e) => e.stopPropagation()} className="animate-slide-up" style={{ background: C.cardBg, borderRadius: "10px", border: `1px solid ${C.border}`, width: "100%", maxWidth: "440px", maxHeight: "80vh", overflowY: "auto", boxShadow: "0 12px 40px rgba(0,0,0,0.2)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function toLocalInputValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}