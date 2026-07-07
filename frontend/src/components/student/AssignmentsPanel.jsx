// src/components/student/AssignmentsPanel.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import * as assignmentsApi from "../../api/assignments";
import SubmissionStatusBadge from "../SubmissionStatusBadge";

export default function AssignmentsPanel({ courseId }) {
  const [assignments, setAssignments] = useState([]);
  const [submissionsByAssignment, setSubmissionsByAssignment] = useState({});
  const [grades, setGrades] = useState({});
  const [uploadingId, setUploadingId] = useState(null);
  const [error, setError] = useState("");
  const [justSubmitted, setJustSubmitted] = useState({});
  const pollRef = useRef(null);

  const isPastDeadline = (assignment) => {
    if (!assignment.due_date) return false;
    return new Date() > new Date(assignment.due_date);
  };

  const refreshSubmissionStatus = useCallback(async (assignmentId, submissionId) => {
    try {
      const { data } = await assignmentsApi.getSubmissionStatus(submissionId);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));

      if (data.status === "teacher_reviewed") {
        const gradeRes = await assignmentsApi.getFinalGrade(submissionId);
        setGrades((prev) => ({ ...prev, [assignmentId]: gradeRes.data }));
      }
      return data.status;
    } catch {
      return null;
    }
  }, []);

  const handleDeleteSubmission = async (assignmentId, submissionId) => {
  if (!confirm("Delete your submission? You can resubmit before the deadline.")) return;
  try {
    await assignmentsApi.deleteMySubmission(submissionId);
    setSubmissionsByAssignment((prev) => {
      const updated = { ...prev };
      delete updated[assignmentId];
      return updated;
    });
    setGrades((prev) => {
      const updated = { ...prev };
      delete updated[assignmentId];
      return updated;
    });
  } catch (err) {
    setError(err.response?.data?.detail || "Couldn't delete submission.");
  }
};

  const loadExistingSubmissions = useCallback(async (assignmentList) => {
    for (const assignment of assignmentList) {
      try {
        const { data } = await assignmentsApi.getMySubmissionForAssignment(assignment.id);
        if (data) {
          setSubmissionsByAssignment((prev) => ({ ...prev, [assignment.id]: data }));
          if (data.status === "teacher_reviewed") {
            const gradeRes = await assignmentsApi.getFinalGrade(data.id);
            setGrades((prev) => ({ ...prev, [assignment.id]: gradeRes.data }));
          }
        }
      } catch {
        // no submission yet — expected, not an error
      }
    }
  }, []);

  useEffect(() => {
    assignmentsApi.listAssignments(courseId).then(({ data }) => {
      setAssignments(data);
      loadExistingSubmissions(data);
    });
  }, [courseId, loadExistingSubmissions]);

  const handleUpload = async (assignmentId, file) => {
    if (!file) return;
    if (!file.name.endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setError("");
    setUploadingId(assignmentId);
    try {
      const { data } = await assignmentsApi.submitAssignment(assignmentId, file);
      setSubmissionsByAssignment((prev) => ({ ...prev, [assignmentId]: data }));

      setJustSubmitted((prev) => ({ ...prev, [assignmentId]: true }));
      setTimeout(() => {
        setJustSubmitted((prev) => ({ ...prev, [assignmentId]: false }));
      }, 4000);

      pollRef.current = setInterval(async () => {
        const status = await refreshSubmissionStatus(assignmentId, data.id);
        if (status === "teacher_reviewed" || status === "failed") {
          clearInterval(pollRef.current);
        }
      }, 4000);
    } catch (err) {
      // This now also surfaces the backend's deadline-passed message
      // verbatim, since that's a normal err.response.data.detail string
      // like any other validation error.
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploadingId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
      {error && <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2 mb-4">{error}</div>}

      {assignments.length === 0 ? (
        <p className="text-sm text-[#6B6B6B]">No assignments posted yet.</p>
      ) : (
        <ul className="space-y-4">
          {assignments.map((a) => {
            const submission = submissionsByAssignment[a.id];
            const grade = grades[a.id];

            return (
              <li key={a.id} className="border border-[#EFEBE3] rounded-lg p-4">
  <div className="flex items-start justify-between gap-4">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-[#1A1A1A]">{a.title}</p>
      {a.description && <p className="text-xs text-[#6B6B6B] mt-1.5 preserve-format">{a.description}</p>}
      {a.due_date && (
        <p className="text-xs font-bold text-[#9B3A30] mt-2">
          Due {new Date(a.due_date).toLocaleString()}
        </p>
      )}
    </div>
    {submission && <SubmissionStatusBadge status={submission.status} />}
  </div>

  {justSubmitted[a.id] && (
    <div className="mt-3 bg-[#E3F0E8] text-[#1F4E3D] text-sm rounded-lg px-3 py-2">
      ✓ Submitted successfully. We'll grade it shortly.
    </div>
  )}

  {submission && (
  <div className="mt-3 pt-3 border-t border-[#EFEBE3] space-y-2">

    {/* View / Download their own submitted file */}
    <div className="flex gap-3">
      <button
        onClick={() => assignmentsApi.viewSubmissionFile(submission.id)}
        className="text-xs text-[#6C72E0] hover:underline"
      >
        View submitted PDF
      </button>
      <button
        onClick={() => assignmentsApi.downloadSubmissionFile(submission.id)}
        className="text-xs text-[#6C72E0] hover:underline"
      >
        Download
      </button>
    </div>

    {/* Lock status or delete option */}
    {isPastDeadline(a) || submission.status === "teacher_reviewed" ? (
      <p className="text-xs text-[#A8A199]">
        {submission.status === "teacher_reviewed"
          ? "This submission has been graded and is locked."
          : "The deadline has passed. This submission is locked."}
      </p>
    ) : (
      <button
        onClick={() => handleDeleteSubmission(a.id, submission.id)}
        className="text-xs text-[#C0392B] hover:underline"
      >
        Delete submission
      </button>
    )}
  </div>
)}

{!submission && (
  <>
    {/* Rubric preview */}
    {a.criteria && a.criteria.length > 0 && (
      <div className="mt-3 border border-[#E4E4E8] rounded-[8px] p-3 bg-[#F7F7F9]">
        <p className="text-xs font-semibold text-[#1A1A1F] mb-2">
          Marking Rubric — {a.total_marks} marks total
        </p>
        <div className="space-y-1">
          {a.criteria.map((c) => (
            <div key={c.id} className="flex justify-between items-center text-xs">
              <span className="text-[#1A1A1F]">{c.label}</span>
              <span className="font-semibold text-[#6C72E0]">{c.max_marks} marks</span>
            </div>
          ))}
        </div>
      </div>
    )}
    {/* Upload button / deadline passed message */}
    {isPastDeadline(a) ? (
      <div className="mt-3 bg-[#FBEAEA] text-[#C0392B] text-sm rounded-lg px-3 py-2">
        The deadline has passed. Submissions are no longer accepted.
      </div>
    ) : (
      <label className="inline-block mt-3 text-sm font-medium text-white bg-[#6C72E0] hover:bg-[#5A60D6] px-3 py-1.5 rounded-[10px] cursor-pointer transition-colors">
        {uploadingId === a.id ? "Uploading…" : "Submit PDF"}
        <input
          type="file" accept=".pdf" className="hidden"
          onChange={(e) => handleUpload(a.id, e.target.files[0])}
          disabled={uploadingId === a.id}
        />
      </label>
    )}
  </>
)}

{/* Rich grade display after grading */}
{grade && (() => {
  let feedback = null;
  try {
    feedback = typeof grade.ai_feedback === "string"
      ? JSON.parse(grade.ai_feedback)
      : grade.ai_feedback;
  } catch {}

  return (
    <div className="mt-3 pt-3 border-t border-[#EFEBE3] space-y-3">
      {/* Score header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1A1A1F]">Final Grade</p>
        <p className="text-lg font-bold text-[#6C72E0]">{grade.total_score} marks</p>
      </div>

      {/* Criterion breakdown */}
      {feedback?.criteria_feedback && (
        <div className="space-y-2">
          {feedback.criteria_feedback.map((cf, i) => (
            <div key={i} className="bg-[#F7F7F9] rounded-[8px] p-3">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold text-[#1A1A1F]">{cf.label}</p>
                <span className="text-xs font-bold text-[#6C72E0]">
                  {cf.score}/{cf.max_score}
                </span>
              </div>
              {cf.what_was_good && (
                <p className="text-xs text-[#1F7A3D]">✓ {cf.what_was_good}</p>
              )}
              {cf.what_was_missing && (
                <p className="text-xs text-[#C0392B] mt-0.5">✗ {cf.what_was_missing}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Strengths / Weaknesses */}
      {feedback?.strengths?.length > 0 && (
        <div className="bg-[#E8F5EC] rounded-[8px] p-3">
          <p className="text-xs font-semibold text-[#1F7A3D] mb-1">Strengths</p>
          {feedback.strengths.map((s, i) => (
            <p key={i} className="text-xs text-[#1F7A3D]">• {s}</p>
          ))}
        </div>
      )}
      {feedback?.weaknesses?.length > 0 && (
        <div className="bg-[#FBEAEA] rounded-[8px] p-3">
          <p className="text-xs font-semibold text-[#C0392B] mb-1">Areas to Improve</p>
          {feedback.weaknesses.map((w, i) => (
            <p key={i} className="text-xs text-[#C0392B]">• {w}</p>
          ))}
        </div>
      )}
      {feedback?.improvements?.length > 0 && (
        <div className="bg-[#EEF0FC] rounded-[8px] p-3">
          <p className="text-xs font-semibold text-[#6C72E0] mb-1">Suggestions</p>
          {feedback.improvements.map((imp, i) => (
            <p key={i} className="text-xs text-[#6C72E0]">→ {imp}</p>
          ))}
        </div>
      )}

      {/* Summary */}
      {feedback?.summary && (
        <p className="text-xs text-[#6B6B76] italic preserve-format">{feedback.summary}</p>
      )}

      {/* Teacher comments */}
      {grade.teacher_comments && (
        <div className="border-t border-[#EFEBE3] pt-2">
          <p className="text-xs font-semibold text-[#1A1A1F] mb-1">Teacher Comments</p>
          <p className="text-xs text-[#6B6B76] preserve-format">{grade.teacher_comments}</p>
        </div>
      )}
    </div>
  );
})()}

</li>
            );
          })}
        </ul>
      )}
    </div>
  );
}