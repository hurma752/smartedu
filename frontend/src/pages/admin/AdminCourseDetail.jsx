// src/pages/admin/AdminCourseDetail.jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout, { PageShell, Card, CardHeader, Btn, Alert, Select } from "../../components/Layout";
import * as adminApi from "../../api/admin";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AdminCourseDetail() {
  const { courseId } = useParams();
  const navigate     = useNavigate();

  const [course, setCourse]                       = useState(null);
  const [allTeachers, setAllTeachers]             = useState([]);
  const [allStudents, setAllStudents]             = useState([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [error, setError]                         = useState("");
  const [success, setSuccess]                     = useState("");
  const [loading, setLoading]                     = useState(true);

  const loadCourse = useCallback(() => {
    adminApi.listAllCourses()
      .then(({ data }) => setCourse(data.find((c) => c.id === Number(courseId)) || null))
      .catch((err) => setError(getErrorMessage(err, "Could not load course.")))
      .finally(() => setLoading(false));
  }, [courseId]);

  useEffect(() => {
    loadCourse();
    adminApi.listUsers("teacher").then(({ data }) => setAllTeachers(data.filter((u) => u.is_active)));
    adminApi.listUsers("student").then(({ data }) => setAllStudents(data.filter((u) => u.is_active)));
  }, [loadCourse]);

  const clear = () => { setError(""); setSuccess(""); };

  const handleAssignTeacher = async (e) => {
    e.preventDefault(); clear();
    if (!selectedTeacherId) { setError("Please select a teacher."); return; }
    const teacher = allTeachers.find((t) => t.id === Number(selectedTeacherId));
    try {
      await adminApi.assignTeacher(courseId, teacher.email);
      setSuccess(`${teacher.full_name} assigned to this course.`);
      setSelectedTeacherId(""); loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not assign teacher.")); }
  };

  const handleEnrollStudent = async (e) => {
    e.preventDefault(); clear();
    if (!selectedStudentId) { setError("Please select a student."); return; }
    const student = allStudents.find((s) => s.id === Number(selectedStudentId));
    try {
      await adminApi.enrollStudent(courseId, student.email);
      setSuccess(`${student.full_name} enrolled successfully.`);
      setSelectedStudentId(""); loadCourse();
    } catch (err) { setError(getErrorMessage(err, "Could not enroll student.")); }
  };

  if (loading) return (
    <Layout>
      <PageShell title="Loading…">
        <p style={{ ...T.bodyText, color: C.textMuted }}>Fetching course details…</p>
      </PageShell>
    </Layout>
  );
  if (!course) return (
    <Layout>
      <PageShell title="Not found">
        <p style={{ ...T.bodyText, color: C.dangerText }}>Course not found.</p>
      </PageShell>
    </Layout>
  );

  return (
    <Layout>
      <PageShell
        title={course.name}
        subtitle={course.code}
        action={
          <Btn variant="ghost" size="md" onClick={() => navigate("/admin/courses")}>
            <i className="ti ti-arrow-left" style={{ fontSize: "15px" }} />Back to courses
          </Btn>
        }
      >
        <Alert variant="error">{error}</Alert>
        <Alert variant="success">{success}</Alert>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>

          {/* Assign Teacher */}
          <Card>
            <CardHeader title="Assigned teachers" count={course.teachers?.length ?? 0} />
            <div style={{ padding: "18px 20px" }}>
              <form onSubmit={handleAssignTeacher}>
                <Select label="Assign a teacher" value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)}>
                  <option value="">— Select teacher —</option>
                  {allTeachers.map((t) => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </Select>
                <Btn type="submit" size="md" style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}>
                  <i className="ti ti-user-plus" style={{ fontSize: "15px" }} />Assign teacher
                </Btn>
              </form>

              {course.teachers?.length > 0 ? (
                <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {course.teachers.map((teacher) => (
                    <div key={teacher.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "7px", background: C.successBg, border: `1px solid ${C.successBorder}` }}>
                      <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", border: `1px solid ${C.successBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: "13px", fontWeight: "700", color: C.successText }}>{teacher.full_name.charAt(0)}</span>
                      </div>
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: "600", color: C.successText, margin: 0 }}>{teacher.full_name}</p>
                        <p style={{ ...T.caption, color: C.textMuted, margin: 0 }}>{teacher.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ marginTop: "14px", ...T.bodyText, color: C.warningText }}>
                  <i className="ti ti-alert-triangle" style={{ marginRight: "6px" }} />No teacher assigned yet
                </p>
              )}
            </div>
          </Card>

          {/* Enroll Student */}
          <Card>
            <CardHeader title="Enrolled students" count={course.student_count ?? 0} />
            <div style={{ padding: "18px 20px" }}>
              <form onSubmit={handleEnrollStudent}>
                <Select label="Enroll a student" value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
                  <option value="">— Select student —</option>
                  {allStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}{s.registration_number ? ` (${s.registration_number})` : ""}
                    </option>
                  ))}
                </Select>
                <Btn type="submit" size="md" style={{ width: "100%", justifyContent: "center", marginTop: "4px" }}>
                  <i className="ti ti-user-plus" style={{ fontSize: "15px" }} />Enroll student
                </Btn>
              </form>

              <p style={{ marginTop: "14px", ...T.bodyText, color: C.textMuted }}>
                <i className="ti ti-info-circle" style={{ marginRight: "6px" }} />
                {course.student_count ?? 0} student{(course.student_count ?? 0) !== 1 ? "s" : ""} currently enrolled.
              </p>
            </div>
          </Card>
        </div>

        {course.description && (
          <Card style={{ marginTop: "16px", padding: "18px 20px" }}>
            <p style={{ ...T.tableHeader, color: C.textMuted, margin: "0 0 8px" }}>Description</p>
            <p style={{ ...T.bodyText, color: C.textPrimary, margin: 0 }}>{course.description}</p>
          </Card>
        )}
      </PageShell>
    </Layout>
  );
}