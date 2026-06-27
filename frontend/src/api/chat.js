// src/api/chat.js
import client from "./client";

export const sendMessage = (courseId, message) =>
  client.post("/chat/", { course_id: courseId, message });

// src/api/chat.js — add alongside the existing sendMessage
export const sendMessageStream = async (courseId, message, onToken) => {
  const token = localStorage.getItem("token");
  const response = await fetch("http://localhost:8000/api/chat/stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ course_id: courseId, message }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw { response: { status: response.status, data: err } };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    fullText += chunk;
    onToken(fullText);
  }

  return fullText;
};