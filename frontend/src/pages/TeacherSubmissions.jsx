// src/pages/TeacherSubmissions.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import SubmissionStatusBadge from "../components/SubmissionStatusBadge";
import * as assignmentsApi from "../api/assignments";

export default function TeacherSubmissions() {
  const { assignmentId } = useParams();
  const [submissions, setSubmissions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [aiEval, setAiEval] = useState(null);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const loadSubmissions = useCallback(async () => {
    const { data } = await assignmentsApi.listSubmissions(assignmentId);
    setSubmissions(data);
  }, [assignmentId]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  useEffect(() => {
    const hasPending = submissions.some((s) =>
      ["processing", "extracted"].includes(s.status)
    );
    if (!hasPending) return;
    const interval = setInterval(loadSubmissions, 3000);
    return () => clearInterval(interval);
  }, [submissions, loadSubmissions]);

  const openReview = async (submission) => {
    setSelected(submission);
    setError("");
    setSaved(false);
    setAiEval(null);

    if (
      submission.status === "ai_evaluated" ||
      submission.status === "teacher_reviewed"
    ) {
      try {
        const { data } = await assignmentsApi.getAiEvaluation(submission.id);
        setAiEval(data);
        setScores(data.criteria_scores);
        setComments("");
      } catch {
        setError("Couldn't load AI evaluation.");
      }
    }
  };

  const handleScoreChange = (key, value) => {
    setScores({ ...scores, [key]: Number(value) });
  };

  const handleSubmitReview = async () => {
    setError("");
    try {
      await assignmentsApi.reviewSubmission(selected.id, {
        criteria_scores: scores,
        teacher_comments: comments,
      });
      setSaved(true);
      loadSubmissions();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't save review.");
    }
  };

  const totalScore = Object.values(scores).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0
  );

  // Only show extracted text for OCR submissions
  const renderExtractedText = (submission) => {
    if (
      !submission.extracted_text ||
      submission.extraction_method !== "ocr"
    )
      return null;

    return (
      <div className="border border-[#EFEBE3] rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-[#A8A199]">
            Extracted text (OCR)
          </p>
          {submission.extraction_confidence !== null && (
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                submission.extraction_confidence < 40
                  ? "bg-[#FBEAE8] text-[#9B3A30]"
                  : submission.extraction_confidence < 70
                  ? "bg-[#FBF3DC] text-[#8A6D1D]"
                  : "bg-[#E3F0E8] text-[#1F4E3D]"
              }`}
            >
              {submission.extraction_confidence}% confidence
            </span>
          )}
        </div>
        <p className="text-xs text-[#1A1A1A] max-h-32 overflow-y-auto whitespace-pre-wrap bg-[#F7F5F2] rounded p-2">
          {submission.extracted_text}
        </p>
      </div>
    );
  };

  // Renders structured AI feedback — criterion cards + strengths/weaknesses
  const renderAIFeedback = (eval_) => {
    if (!eval_) return null;

    let feedback = null;
    try {
      feedback =
        typeof eval_.feedback === "string"
          ? JSON.parse(eval_.feedback)
          : eval_.feedback;
    } catch {
      // Fallback: raw text (handles old-format feedback gracefully)
      return (
        <p className="text-sm text-[#6B6B76] bg-[#F7F5F2] rounded-lg p-3">
          {String(eval_.feedback)}
        </p>
      );
    }

    if (!feedback) return null;

    return (
      <div className="space-y-3">
        {/* Per-criterion cards */}
        {feedback.criteria_feedback?.map((cf, i) => (
          <div
            key={i}
            className="border border-[#E4E4E8] rounded-[8px] p-3"
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-semibold text-[#1A1A1F]">
                {cf.label}
              </p>
              <span className="text-sm font-bold text-[#6C72E0]">
                {cf.score}/{cf.max_score}
              </span>
            </div>
            {cf.what_was_good && (
              <p className="text-xs text-[#1F7A3D]">
                ✓ {cf.what_was_good}
              </p>
            )}
            {cf.what_was_missing && (
              <p className="text-xs text-[#C0392B] mt-0.5">
                ✗ {cf.what_was_missing}
              </p>
            )}
          </div>
        ))}

        {/* Strengths */}
        {feedback.strengths?.length > 0 && (
          <div className="bg-[#E8F5EC] rounded-[8px] p-3">
            <p className="text-xs font-semibold text-[#1F7A3D] mb-1">
              Strengths
            </p>
            {feedback.strengths.map((s, i) => (
              <p key={i} className="text-xs text-[#1F7A3D]">
                • {s}
              </p>
            ))}
          </div>
        )}

        {/* Weaknesses */}
        {feedback.weaknesses?.length > 0 && (
          <div className="bg-[#FBEAEA] rounded-[8px] p-3">
            <p className="text-xs font-semibold text-[#C0392B] mb-1">
              Areas to improve
            </p>
            {feedback.weaknesses.map((w, i) => (
              <p key={i} className="text-xs text-[#C0392B]">
                • {w}
              </p>
            ))}
          </div>
        )}

        {/* Summary */}
        {feedback.summary && (
          <p className="text-xs text-[#6B6B76] italic">{feedback.summary}</p>
        )}
      </div>
    );
  };

  return (
    <Layout>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">
        Submissions to review
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: submission list */}
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          {submissions.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">No submissions yet.</p>
          ) : (
            <ul className="space-y-2">
              {submissions.map((s) => (
                <li
                  key={s.id}
                  onClick={() => openReview(s)}
                  className={`flex items-center justify-between border rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    selected?.id === s.id
                      ? "border-[#1F4E3D]"
                      : "border-[#EFEBE3] hover:border-[#D8D3C8]"
                  }`}
                >
                  <p className="text-sm text-[#1A1A1A]">
                    {s.student_name || `Student #${s.student_id}`}
                  </p>
                  <SubmissionStatusBadge status={s.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: review panel */}
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          {!selected ? (
            <p className="text-sm text-[#6B6B6B]">
              Select a submission to review.
            </p>
          ) : !aiEval ? (
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    assignmentsApi.viewSubmissionFile(selected.id)
                  }
                  className="text-sm text-[#1F4E3D] font-medium hover:underline"
                >
                  View submitted PDF
                </button>
                <button
                  onClick={() =>
                    assignmentsApi.downloadSubmissionFile(selected.id)
                  }
                  className="text-sm text-[#1F4E3D] font-medium hover:underline"
                >
                  Download
                </button>
              </div>

              {selected.status === "failed" ? (
                <>
                  <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2">
                    {selected.error_message}
                  </div>
                  {renderExtractedText(selected)}
                </>
              ) : (
                <p className="text-sm text-[#6B6B6B]">
                  Waiting for AI evaluation to complete…
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {error && (
                <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {saved && (
                <div className="bg-[#E3F0E8] text-[#1F4E3D] text-sm rounded-lg px-3 py-2">
                  Review saved.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() =>
                    assignmentsApi.viewSubmissionFile(selected.id)
                  }
                  className="text-sm text-[#1F4E3D] font-medium hover:underline"
                >
                  View submitted PDF
                </button>
                <button
                  onClick={() =>
                    assignmentsApi.downloadSubmissionFile(selected.id)
                  }
                  className="text-sm text-[#1F4E3D] font-medium hover:underline"
                >
                  Download
                </button>
              </div>

              {renderExtractedText(selected)}

              {/* Structured AI feedback — replaces the raw JSON string */}
              <div>
                <p className="text-xs font-medium text-[#A8A199] mb-3">
                  AI suggested feedback
                </p>
                {renderAIFeedback(aiEval)}
              </div>

              {/* Editable scores */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#A8A199]">
                  Scores (editable)
                </p>
                {Object.entries(scores).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3"
                  >
                    <label className="text-sm text-[#1A1A1A] capitalize">
                      {key.replace(/_/g, " ")}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={value}
                      onChange={(e) => handleScoreChange(key, e.target.value)}
                      className="w-20 border border-[#D8D3C8] rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30"
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2 border-t border-[#EFEBE3]">
                  <p className="text-sm font-medium text-[#1A1A1A]">Total</p>
                  <p className="text-sm font-medium text-[#1F4E3D]">
                    {totalScore}
                  </p>
                </div>
              </div>

              {/* Teacher comments */}
              <div>
                <label className="block text-xs font-medium text-[#A8A199] mb-1">
                  Your comments (optional)
                </label>
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  className="w-full border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30"
                  placeholder="Add anything the AI feedback missed…"
                />
              </div>

              {selected.status !== "teacher_reviewed" ? (
                <button
                  onClick={handleSubmitReview}
                  className="w-full bg-[#1F4E3D] hover:bg-[#173B2E] text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
                >
                  Approve & finalize grade
                </button>
              ) : (
                <p className="text-sm text-[#1F4E3D]">
                  This submission has already been graded.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}