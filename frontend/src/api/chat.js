// src/api/chat.js
import client from "./client";

export async function sendMessageStream(courseId, message, onChunk, signal) {
  const token = localStorage.getItem("token");
  const response = await fetch(
    `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/chat/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ course_id: courseId, message }),
      signal,
    }
  );

  if (!response.ok) {
    const err = new Error("Stream request failed");
    err.response = { status: response.status };
    throw err;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
    onChunk(fullText);
  }
}

export function sendMessage(courseId, message) {
  return client.post("/api/chat/", { course_id: courseId, message });
}

export function getChatHistory(courseId) {
  return client.get(`/api/chat/history/${courseId}`);
}

export function clearChatHistory(courseId) {
  return client.delete(`/api/chat/history/${courseId}`);
}

export function deleteChatMessage(messageId) {
  return client.delete(`/api/chat/message/${messageId}`);
}

export function editChatMessage(messageId, message) {
  return client.put(`/api/chat/message/${messageId}`, { message });
}