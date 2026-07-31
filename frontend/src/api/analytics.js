// src/api/analytics.js
import client from "./client";

export const getCourseRisk = (courseId) =>
  client.get(`/analytics/${courseId}/risk`);

export const recomputeCourseRisk = (courseId) =>
  client.post(`/analytics/${courseId}/risk/recompute`);
