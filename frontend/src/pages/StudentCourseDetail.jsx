// src/pages/StudentCourseDetail.jsx
import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import Layout from "../components/Layout";
import CourseTabs from "../components/CourseTabs";
import * as coursesApi from "../api/courses";
import * as documentsApi from "../api/documents";
import * as chatApi from "../api/chat";

export default function StudentCourseDetail() {
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [activeTab, setActiveTab] = useState("materials");

  const [messages, setMessages] = useState([
    { role: "assistant", content: "Ask me anything about this course's material." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
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
  if (!input.trim() || loading) return;
  const question = input.trim();
  setInput("");
  setMessages((prev) => [...prev, { role: "user", content: question }]);
  setLoading(true);

  // Add an empty assistant message that we'll fill in as tokens arrive
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
        content: err.response?.status === 403 ? "You don't have access to this course's material." : "Something went wrong.",
        isError: true,
      };
      return updated;
    });
  } finally {
    setLoading(false);
  }
};

  if (!course) return <Layout><p className="text-sm text-[#6B6B6B]">Loading…</p></Layout>;

  return (
    <Layout>
      {/* Course Info — always visible, not behind a tab */}
      <div className="bg-white rounded-xl border border-[#E8E4DC] p-5 mb-6">
        <p className="text-xs font-medium text-[#A8A199] mb-1">{course.code}</p>
        <h1 className="text-2xl font-serif text-[#1A1A1A] mb-1">{course.name}</h1>
        {course.description && <p className="text-sm text-[#6B6B6B]">{course.description}</p>}
      </div>

      <CourseTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "materials" && (
        <div className="bg-white rounded-xl border border-[#E8E4DC] p-5">
          {documents.length === 0 ? (
            <p className="text-sm text-[#6B6B6B]">No lecture materials uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between border border-[#EFEBE3] rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-[#1A1A1A]">{doc.filename}</p>
                    <p className="text-xs text-[#A8A199]">
                      Uploaded {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-3">
  <button
    onClick={() => documentsApi.viewDocument(courseId, doc.id)}
    className="text-sm text-[#1F4E3D] font-medium hover:underline"
  >
    View
  </button>

  <button
    onClick={() =>
      documentsApi.downloadDocument(
        courseId,
        doc.id,
        doc.filename
      )
    }
    className="text-sm text-[#1F4E3D] font-medium hover:underline"
  >
    Download
  </button>
</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {activeTab === "chatbot" && (
        <div className="bg-white rounded-xl border border-[#E8E4DC] flex flex-col h-[55vh]">
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-lg rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === "user" ? "bg-[#1F4E3D] text-white rounded-br-sm"
                  : msg.isError ? "bg-[#FBEAE8] text-[#9B3A30] rounded-bl-sm"
                  : "bg-[#F1EEE7] text-[#1A1A1A] rounded-bl-sm"
                }`}>
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  {msg.sources?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-black/10">
                      <p className="text-xs opacity-60 font-medium mb-1">Sources</p>
                      {msg.sources.map((s, j) => <p key={j} className="text-xs opacity-60 italic">"{s}"</p>)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-[#F1EEE7] rounded-2xl rounded-bl-sm px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#A8A199] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#A8A199] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-[#A8A199] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-[#E8E4DC] p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask a question…"
              disabled={loading}
              className="flex-1 border border-[#D8D3C8] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F4E3D]/30"
            />
            <button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="bg-[#1F4E3D] hover:bg-[#173B2E] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}