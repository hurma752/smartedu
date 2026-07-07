// src/pages/TeacherCourseDetail.jsx
import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import CourseTabs from "../components/CourseTabs";
import StatusBadge from "../components/StatusBadge";
import AssignmentsPanel from "../components/teacher/AssignmentsPanel";
import * as documentsApi from "../api/documents";
import * as coursesApi from "../api/courses";

export default function TeacherCourseDetail() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [roster, setRoster] = useState([]);
  const [activeTab, setActiveTab] = useState("materials");
  const [uploading, setUploading] = useState(false);
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
      await loadDocuments();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
      e.target.value = "";
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

  const handleView = async (docId) => {
    try {
      await documentsApi.viewDocument(courseId, docId);
    } catch {
      setError("Couldn't open this document.");
    }
  };

  const handleDownload = async (docId, filename) => {
    try {
      await documentsApi.downloadDocument(courseId, docId, filename);
    } catch {
      setError("Couldn't download this document.");
    }
  };

  if (!course) return <Layout><p className="text-sm text-[#6B6B6B]">Loading…</p></Layout>;

  return (
    <Layout>
      <div className="bg-white rounded-xl border border-[#E8E4DC] p-5 mb-6">
        <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
        <h1 className="text-2xl font-serif text-[#1A1A1A] mb-1">{course.name}</h1>
        {course.description && (
          <p className="text-sm text-[#6B6B6B]">{course.description}</p>
        )}
      </div>

      {error && (
        <div className="bg-[#FBEAE8] text-[#9B3A30] text-sm rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <CourseTabs
        tabs={[
          { id: "materials", label: "Lecture Materials" },
          { id: "assignments", label: "Assignments" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "materials" && (
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg text-[#1A1A1A]">Course material</h2>
            <label className="text-sm font-medium text-white bg-[#1F4E3D] hover:bg-[#173B2E] px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
              {uploading ? "Uploading…" : "Upload PDF"}
              <input
                type="file"
                accept=".pdf"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {documents.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">No material uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between border border-[#EFEBE3] rounded-lg px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1A1A1A] truncate">{doc.filename}</p>
                    <p className="text-xs text-[#A8A199] mt-0.5">
                      {doc.status === "indexed"
                        ? `${doc.chunk_count} chunks indexed`
                        : doc.status === "processing"
                        ? "Processing…"
                        : doc.error_message || "Failed"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {doc.status === "indexed" && (
                      <>
                        <button
                          onClick={() => handleView(doc.id)}
                          className="text-xs text-[#6C72E0] hover:underline"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDownload(doc.id, doc.filename)}
                          className="text-xs text-[#6C72E0] hover:underline"
                        >
                          Download
                        </button>
                      </>
                    )}
                    <StatusBadge status={doc.status} />
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs text-[#C0392B] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "assignments" && <AssignmentsPanel courseId={courseId} />}

      <div className="bg-white rounded-xl border border-[#E8E4DC] p-5 mt-6">
        <h2 className="font-serif text-lg text-[#1A1A1A] mb-4">Enrolled students</h2>
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
    </Layout>
  );
}