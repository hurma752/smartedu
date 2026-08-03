// src/pages/StudentCourseDetail.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader } from "../components/Layout";
import StudentAssignmentsPanel from "../components/student/AssignmentsPanel";
import * as coursesApi from "../api/courses";
import * as documentsApi from "../api/documents";
import * as chatApi from "../api/chat";
import { C } from "../theme";

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const location     = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const activeTab    = searchParams.get("tab") || "materials";

  const [course,    setCourse]    = useState(null);
  const [documents, setDocuments] = useState([]);

  // Chat state
  const [messages,  setMessages]  = useState([
    { role: "assistant", content: "Ask me anything about this course's material." },
  ]);
  const [input,    setInput]    = useState("");
  const [chatting, setChatting] = useState(false);

  // AbortController ref — a new one is created each time a message is sent,
  // and its .abort() is called when the user clicks Stop.
  const abortRef = useRef(null);
  const endRef   = useRef(null);

  useEffect(() => {
    coursesApi.getCourse(courseId).then(({ data }) => setCourse(data));
    documentsApi.listDocuments(courseId).then(({ data }) =>
      setDocuments(data.filter((d) => d.status === "indexed"))
    );
  }, [courseId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clean up any in-flight request when the component unmounts
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSend = async () => {
    if (!input.trim() || chatting) return;
    const question = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setChatting(true);
    // Start a fresh empty assistant bubble
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Create a new AbortController for this request
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await chatApi.sendMessageStream(courseId, question, (partialText) => {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", content: partialText };
          return updated;
        });
      }, controller.signal);

    } catch (err) {
      // AbortError means the user clicked Stop — mark the bubble as stopped,
      // not as an error. Any text already streamed is preserved.
      if (err.name === "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const last    = updated[updated.length - 1];
          // Only annotate if the bubble is still empty (nothing was received yet)
          if (last.role === "assistant" && last.content === "") {
            updated[updated.length - 1] = {
              ...last,
              content:  "Generation stopped.",
              isStopped: true,
            };
          } else {
            // Partial text is already in state — just mark it stopped
            updated[updated.length - 1] = { ...last, isStopped: true };
          }
          return updated;
        });
      } else {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role:    "assistant",
            content: err.response?.status === 403
              ? "You don't have access to this course's material."
              : "Something went wrong. Please try again.",
            isError: true,
          };
          return updated;
        });
      }
    } finally {
      abortRef.current = null;
      setChatting(false);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    // setChatting(false) will be called by the finally block above
  };

  if (!course) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ color: C.textMuted, fontSize: "14px" }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );

  const tabLabel = {
    materials:   "Lectures",
    assignments: "Assignments",
    chatbot:     "AI Assistant",
  }[activeTab] || "Lectures";

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
                      key={doc.id} doc={doc} last={i === documents.length - 1}
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

        {/* ── AI Chatbot ── */}
        {activeTab === "chatbot" && (
          <div style={{ background: C.cardBg, borderRadius: "8px", border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", height: "calc(100vh - 200px)", minHeight: "420px" }}>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0" }}>
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}

              {/* Typing indicator — shown only while streaming AND no content yet */}
              {chatting && messages[messages.length - 1]?.content === "" && (
                <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
                  <AssistantAvatar />
                  <div style={{ background: C.subtleBg, borderRadius: "12px", borderBottomLeftRadius: "3px", padding: "14px 16px", display: "flex", gap: "4px", alignItems: "center" }}>
                    {[0, 150, 300].map((delay) => (
                      <span key={delay} style={{ width: "6px", height: "6px", background: C.textMuted, borderRadius: "50%", display: "inline-block", animation: "bounce 1s infinite", animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} style={{ height: "20px" }} />
            </div>

            {/* Suggestion Chips */}
            {messages.length <= 2 && !chatting && (
              <div style={{ padding: "0 20px 12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                  "Summarize available lectures",
                  "List all lecture titles",
                  "What assignments are due?",
                  "How is plagiarism evaluated?"
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => { setInput(chip); }}
                    className="btn-interactive"
                    style={{
                      background: C.subtleBg, border: `1px solid ${C.border}`,
                      borderRadius: "16px", padding: "6px 12px", fontSize: "12px",
                      color: C.textSecondary, cursor: "pointer", fontFamily: "inherit"
                    }}
                  >
                    💡 {chip}
                  </button>
                ))}
              </div>
            )}

            {/* Input row */}
            <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 16px", display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && !chatting && handleSend()}
                placeholder="Ask about this course…"
                disabled={chatting}
                style={{ flex: 1, background: C.inputBg, border: "1.5px solid transparent", borderRadius: "7px", padding: "10px 13px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none", opacity: chatting ? 0.6 : 1 }}
                onFocus={(e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = "#fff"; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; }}
              />

              {/* Stop button — visible only while generating */}
              {chatting ? (
                <button
                  onClick={handleStop}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 16px", borderRadius: "7px", border: `1.5px solid ${C.dangerBorder}`, background: C.dangerBg, color: C.dangerText, fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer", flexShrink: 0, transition: "background 0.12s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#FEE2E2"}
                  onMouseLeave={(e) => e.currentTarget.style.background = C.dangerBg}
                >
                  <i className="ti ti-player-stop-filled" style={{ fontSize: "14px" }} />Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim()}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "7px", background: C.primary, color: "#fff", border: "none", fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: !input.trim() ? "not-allowed" : "pointer", opacity: !input.trim() ? 0.4 : 1, flexShrink: 0 }}
                >
                  <i className="ti ti-send" style={{ fontSize: "15px" }} />Send
                </button>
              )}
            </div>
            <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }`}</style>
          </div>
        )}
      </PageShell>
    </Layout>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AssistantAvatar() {
  return (
    <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: C.primary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: "8px", alignSelf: "flex-end" }}>
      <i className="ti ti-sparkles" style={{ fontSize: "13px", color: "#fff" }} />
    </div>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";

  // Choose bubble appearance
  const bubbleBg =
    isUser        ? C.primary  :
    msg.isError   ? C.dangerBg :
    C.subtleBg;

  const bubbleColor =
    isUser        ? "#fff"           :
    msg.isError   ? C.dangerText     :
    C.textPrimary;

  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: "12px", alignItems: "flex-end", gap: "8px" }}>
      {!isUser && <AssistantAvatar />}
      <div style={{ maxWidth: "68%" }}>
        <div style={{
          borderRadius: "12px", padding: "11px 14px", fontSize: "14px", lineHeight: "1.6",
          background: bubbleBg, color: bubbleColor,
          borderBottomRightRadius: isUser ? "3px" : "12px",
          borderBottomLeftRadius: !isUser  ? "3px" : "12px",
        }}>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg.content}</p>
        </div>
        {/* Stopped indicator — shown beneath the bubble, not inside it */}
        {msg.isStopped && (
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "5px", paddingLeft: "4px" }}>
            <i className="ti ti-player-stop-filled" style={{ fontSize: "11px", color: C.textMuted }} />
            <span style={{ fontSize: "11px", color: C.textMuted }}>Generation stopped</span>
          </div>
        )}
      </div>
    </div>
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
        {doc.created_at && <p style={{ fontSize: "11px", color: C.textMuted, margin: 0 }}>Added {new Date(doc.created_at).toLocaleDateString()}</p>}
      </div>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        <ActionBtn icon="ti-eye"      label="View"     onClick={onView}     />
        <ActionBtn icon="ti-download" label="Download" onClick={onDownload} />
      </div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ fontSize: "13px", fontWeight: "500", color: C.textSecondary, background: hovered ? C.subtleBg : "none", border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px", transition: "background 0.1s" }}>
      <i className={`ti ${icon}`} style={{ fontSize: "13px" }} />{label}
    </button>
  );
}