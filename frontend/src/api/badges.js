// src/api/badges.js
import client from "./client";

export const getMyBadges = (courseId) =>
  client.get(courseId ? `/badges/my-badges?course_id=${courseId}` : "/badges/my-badges");
export const getCourseBadges = (courseId) => client.get(`/badges/course/${courseId}`);
export const getAssignmentBadges = (assignmentId) => client.get(`/badges/assignment/${assignmentId}`);

