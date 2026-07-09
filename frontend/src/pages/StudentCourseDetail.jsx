// src/pages/StudentCourseDetail.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader, Alert } from "../components/Layout";
import StudentAssignmentsPanel from "../components/student/AssignmentsPanel";
import * as coursesApi from "../api/courses";
import * as documentsApi from "../api/documents";
import * as chatApi from "../api/chat";
import { C, T } from "../theme";

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const location     = useLocation();

  // Active tab driven by ?tab= param — same approach as TeacherCourseDetail
  const searchParams = new URLSearchParams(location.search);
  const activeTab    = searchParams.get("tab") || "materials";

  const [course,    setCourse]    = useState(null);
  const [documents, setDocuments] = useState([]);

  // Chat state
  const [messages,  setMessages]  = useState([
    { role: "assistant", content: "Ask me anything about this course's material." },
  ]);
  const [input,     setInput]     = useState("");
  const [chatting,  setChatting]  = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    coursesApi.getCourse(courseId).then(({ data }) => setCourse(data));
    documentsApi.listDocuments(courseId).then(({ data }) =>
      setDocuments(data.filter((d) => d.status === "indexed"))
    );
  }, [courseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || chatting) return;
    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatting(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await chatApi.sendMessageStream(courseId, question, (partialText) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: partialText };
          return updated;
        });
      });
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: err.response?.status === 403
            ? "You don't have access to this course's material."
            : "Something went wrong. Please try again.",
          isError: true,
        };
        return updated;
      });
    } finally {
      setChatting(false);
    }
  };

  if (!course) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ color: C.textMuted, fontSize: "14px" }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );

  const tabLabel = { materials: "Lectures", assignments: "Assignments", chatbot: "AI Assistant" }[activeTab] || "Lectures";

  return (
    <Layout>
      <PageShell title={tabLabel} subtitle={`${course.name} · ${course.code}`}>

        {/* ── Lecture Materials ── */}
        {activeTab === "materials" && (
          <>
            {course.description && (
              <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, padding: "14px 18px", marginBottom: "20px" }}>
                <p style={{ fontSize: "14px", color: C.textSecondary, lineHeight: "1.6", margin: 0 }}>{course.description}</p>
              </div>
            )}
            <Card>
              <CardHeader title="Lecture Materials" count={documents.length} />
              <div style={{ padding: "8px 0" }}>
                {documents.length === 0 ? (
                  <div style={{ padding: "40px 20px", textAlign: "center" }}>
                    <i className="ti ti-file-upload" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
                    <p style={{ fontSize: "14px", color: C.textMuted, margin: 0 }}>No lecture materials uploaded yet.</p>
                  </div>
                ) : (
                  documents.map((doc, i) => (
                    <DocRow
                      key={doc.id}
                      doc={doc}
                      last={i === documents.length - 1}
                      onView={() => documentsApi.viewDocument(courseId, doc.id)}
                      onDownload={() => documentsApi.downloadDocument(courseId, doc.id, doc.filename)}
                    />
                  ))
                )}
              </div>
            </Card>
          </>
        )}

        {/* ── Assignments ── */}
        {activeTab === "assignments" && (
          <StudentAssignmentsPanel courseId={courseId} />
        )}

        {/* ── AI Assistant (Chatbot) ── */}
        {activeTab === "chatbot" && (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: "400px" }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: "12px" }}>
                  {msg.role === "assistant" && (
                    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: "8px", alignSelf: "flex-end" }}>
                      <i className="ti ti-sparkles" style={{ fontSize: "13px", color: "#fff" }} />
                    </div>
                  )}
                  <div style={{
                    maxWidth: "68%", borderRadius: "12px", padding: "11px 14px", fontSize: "14px", lineHeight: "1.6",
                    background: msg.role === "user" ? C.primary : msg.isError ? C.dangerBg : C.subtleBg,
                    color: msg.role === "user" ? "#fff" : msg.isError ? C.dangerText : C.textPrimary,
                    borderBottomRightRadius: msg.role === "user" ? "3px" : "12px",
                    borderBottomLeftRadius: msg.role === "assistant" ? "3px" : "12px",
                  }}>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
                  </div>
                </div>
              ))}
              {/* Typing indicator */}
              {chatting && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: "8px" }}>
                    <i className="ti ti-sparkles" style={{ fontSize: "13px", color: "#fff" }} />
                  </div>
                  <div style={{ background: C.subtleBg, borderRadius: "12px", borderBottomLeftRadius: "3px", padding: "14px 16px", display: "flex", gap: "4px", alignItems: "center" }}>
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} style={{ width: "6px", height: "6px", background: C.textMuted, borderRadius: "50%", display: "inline-block", animation: "bounce 1s infinite", animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} style={{ height: "20px" }} />
            </div>

            {/* Input */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", gap: "10px" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Ask about this course…"
                disabled={chatting}
                style={{ flex: 1, background: C.inputBg, border: "1.5px solid transparent", borderRadius: "7px", padding: "10px 13px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
                onFocus={(e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; }}
              />
              <button
                onClick={handleSend}
                disabled={chatting || !input.trim()}
                style={{ background: C.primary, color: "#fff", border: "none", borderRadius: "7px", padding: "10px 18px", fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: chatting || !input.trim() ? "not-allowed" : "pointer", opacity: chatting || !input.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: "6px" }}
              >
                <i className="ti ti-send" style={{ fontSize: "15px" }} />Send
              </button>
            </div>
            <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

function DocRow({ doc, last, onView, onDownload }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "center", gap: "14px", padding: "13px 18px", borderBottom: last ? "none" : `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, transition: "background 0.12s" }}
    >
      <i className="ti ti-file-type-pdf" style={{ fontSize: "20px", color: C.accent, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ fontSize: "14px", fontWeight: "500", color: C.textPrimary, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</p>
        {doc.created_at && (
          <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>
            Added {new Date(doc.created_at).toLocaleDateString()}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: "10px", flexShrink: 0 }}>
        <button onClick={onView}
          style={{ fontSize: "13px", fontWeight: "500", color: C.textSecondary, background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}>
          <i className="ti ti-eye" style={{ fontSize: "13px" }} />View
        </button>
        <button onClick={onDownload}
          style={{ fontSize: "13px", fontWeight: "500", color: C.textSecondary, background: "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px" }}>
          <i className="ti ti-download" style={{ fontSize: "13px" }} />Download
        </button>
      </div>
    </div>
  );
}