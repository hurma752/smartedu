// src/pages/TeacherCourseDetail.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import StatusBadge from "../components/StatusBadge";
import * as documentsApi from "../api/documents";
import * as coursesApi from "../api/courses";

export default function TeacherCourseDetail() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [roster, setRoster] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [enrollEmail, setEnrollEmail] = useState("");
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  const loadDocuments = useCallback(async () => {
    const { data } = await documentsApi.listDocuments(courseId);
    setDocuments(data);
    return data;
  }, [courseId]);

  const loadRoster = useCallback(async () => {
    const { data } = await coursesApi.listRoster(courseId);
    setRoster(data);
  }, [courseId]);

  useEffect(() => {
    coursesApi.getCourse(courseId).then(({ data }) => setCourse(data));
    loadDocuments();
    loadRoster();
  }, [courseId, loadDocuments, loadRoster]);

  // THE FIX for "frontend doesn't update after upload": poll the
  // documents list every 3 seconds WHILE anything is still "processing".
  // Stops automatically once nothing is pending, so we're not polling forever.
  useEffect(() => {
    const hasPending = documents.some((d) => d.status === "processing");

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        const updated = await loadDocuments();
        const stillPending = updated.some((d) => d.status === "processing");
        if (!stillPending) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [documents, loadDocuments]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }

    setError("");
    setUploading(true);
    try {
      await documentsApi.uploadDocument(courseId, file);
      // Immediately refetch so the new "processing" row appears right away,
      // rather than waiting for the next poll tick
      await loadDocuments();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = ""; // allow re-selecting the same file later
    }
  };

  const handleDelete = async (documentId) => {
    if (!confirm("Delete this document? This removes it from the chatbot's knowledge too.")) return;
    try {
      await documentsApi.deleteDocument(courseId, documentId);
      await loadDocuments();
    } catch {
      setError("Couldn't delete this document.");
    }
  };

  const handleEnroll = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await coursesApi.enrollStudent(courseId, enrollEmail);
      setEnrollEmail("");
      await loadRoster();
    } catch (err) {
      setError(err.response?.data?.detail || "Couldn't enroll that student.");
    }
  };

  const handleRemoveStudent = async (studentId) => {
    try {
      await coursesApi.removeStudent(courseId, studentId);
      await loadRoster();
    } catch {
      setError("Couldn't remove that student.");
    }
  };

  if (!course) return <Layout><p className="text-sm text-[#6B6B6B]">Loading…</p></Layout>;

  return (
    <Layout>
      <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
      <h1 className="text-2xl font-serif text-[#1A1A1A] mb-6">{course.name}</h1>

      {error && (
        <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents panel */}
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-[#1A1A1A]">Course material</h2>
            <label className="text-sm font-medium text-white bg-[#1F4E3D] hover:bg-[#173B2E] px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              {uploading ? "Uploading…" : "Upload PDF"}
              <input type="file" accept=".pdf" onChange={handleUpload} disabled={uploading} className="hidden" />
            </label>
          </div>

          {documents.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">No material uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between border border-[#EFEBE3] rounded-lg px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[#1A1A1A] truncate">{doc.filename}</p>
                    {doc.status === "indexed" && (
                      <p className="text-xs text-[#A8A199]">{doc.chunk_count} chunks indexed</p>
                    )}
                    {doc.status === "failed" && (
                      <p className="text-xs text-[#9B3A30]">{doc.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <StatusBadge status={doc.status} />
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs text-[#9B3A30] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

       {/* Roster panel (READ ONLY for teacher) */}
<div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
  <h2 className="font-serif text-lg text-[#1A1A1A] mb-4">
    Enrolled students
  </h2>

  {roster.length === 0 ? (
    <p className="text-sm text-[#6B6B6B]">
      No students enrolled yet. Contact an admin to enroll students.
    </p>
  ) : (
    <ul className="space-y-2">
      {roster.map((student) => (
        <li
          key={student.id}
          className="border border-[#EFEBE3] rounded-lg px-3 py-2"
        >
          <p className="text-sm text-[#1A1A1A]">{student.full_name}</p>
          <p className="text-xs text-[#A8A199]">{student.email}</p>
        </li>
      ))}
    </ul>
  )}
</div>
      </div>
    </Layout>
  );
}