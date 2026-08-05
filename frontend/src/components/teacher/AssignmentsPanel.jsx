// src/components/teacher/AssignmentsPanel.jsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, Btn, Alert } from "../Layout";
import * as assignmentsApi from "../../api/assignments";
import { getErrorMessage } from "../../utils/errorMessage";
import { C, T } from "../../theme";

export default function AssignmentsPanel({ courseId }) {
  const navigate    = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [showForm,    setShowForm]    = useState(false);
  const [error,       setError]       = useState("");
  const [form, setForm] = useState({
    title: "", description: "", due_date: "",
    criteria: [{ label: "", max_marks: 5, description: "" }],
  });

  const isPastDeadline = (a) => a.due_date && new Date() > new Date(a.due_date);

  const loadAll = useCallback(async () => {
    try {
      const { data } = await assignmentsApi.listAssignments(courseId);
      setAssignments(data);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load assignments."));
    }
  }, [courseId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const addCriterion = () =>
    setForm({ ...form, criteria: [...form.criteria, { label: "", max_marks: 5, description: "" }] });

  const updateCriterion = (index, field, value) => {
    const updated = [...form.criteria];
    updated[index][field] = value;
    setForm({ ...form, criteria: updated });
  };

  const removeCriterion = (index) => {
    if (form.criteria.length === 1) return;
    setForm({ ...form, criteria: form.criteria.filter((_, i) => i !== index) });
  };

  const totalMarks = form.criteria.reduce((sum, c) => sum + (Number(c.max_marks) || 0), 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    const empty = form.criteria.filter((c) => !c.label.trim());
    if (empty.length > 0) { setError("All rubric criteria must have a label."); return; }
    try {
      await assignmentsApi.createAssignment(courseId, {
        title: form.title,
        description: form.description,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        criteria: form.criteria.map((c) => ({
          label: c.label.trim(),
          max_marks: Number(c.max_marks),
          description: c.description || null,
        })),
      });
      setForm({ title: "", description: "", due_date: "", criteria: [{ label: "", max_marks: 5, description: "" }] });
      setShowForm(false);
      loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create assignment."));
    }
  };

  const handleDelete = async (assignmentId) => {
    if (!confirm("Delete this assignment and all its submissions?")) return;
    try {
      await assignmentsApi.deleteAssignment(assignmentId);
      loadAll();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't delete assignment."));
    }
  };

  return (
    <div>
      <Alert variant="error">{error}</Alert>

      <Card>
        <CardHeader
          title="Assignments"
          count={assignments.length}
          action={
            <Btn size="sm" onClick={() => { setShowForm(!showForm); setError(""); }}>
              <i className={`ti ${showForm ? "ti-x" : "ti-plus"}`} style={{ fontSize: "14px" }} />
              {showForm ? "Cancel" : "New assignment"}
            </Btn>
          }
        />

        {/* ── Create form ── */}
        {showForm && (
          <div style={{ padding: "20px 18px", borderBottom: `1px solid ${C.border}` }}>
            <form onSubmit={handleCreate}>
              <p style={{ ...T.sectionHeading, color: C.textPrimary, marginBottom: "18px" }}>Create assignment</p>

              {/* Title */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Title <span style={{ color: C.accent }}>*</span>
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Cybersecurity Case Study"
                  style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Description / Instructions
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe what students need to do…"
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Due date */}
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", ...T.formLabel, color: C.textSecondary, marginBottom: "6px" }}>
                  Due date & time <span style={{ ...T.caption, color: C.textMuted }}>(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  style={inputStyle}
                  onFocus={focusOn} onBlur={focusOff}
                />
              </div>

              {/* Rubric builder */}
              <div style={{ marginBottom: "18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <label style={{ ...T.formLabel, color: C.textSecondary }}>Rubric criteria</label>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: C.textPrimary }}>
                    Total: {totalMarks} marks
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {form.criteria.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", background: C.subtleBg, borderRadius: "7px", padding: "10px 12px" }}>
                      <input
                        required
                        placeholder={`Criterion ${i + 1} (e.g. Research Quality)`}
                        value={c.label}
                        onChange={(e) => updateCriterion(i, "label", e.target.value)}
                        style={{ flex: 1, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 10px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
                        onFocus={focusOn} onBlur={focusOff}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", flexShrink: 0 }}>
                        <input
                          type="number" min="1" required
                          value={c.max_marks}
                          onChange={(e) => updateCriterion(i, "max_marks", e.target.value)}
                          style={{ width: "60px", background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px 8px", fontSize: "14px", color: C.textPrimary, fontFamily: "inherit", outline: "none", textAlign: "center" }}
                        />
                        <span style={{ ...T.caption, color: C.textMuted }}>marks</span>
                      </div>
                      {form.criteria.length > 1 && (
                        <button type="button" onClick={() => removeCriterion(i)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.dangerText, fontSize: "16px", padding: "2px", display: "flex", alignItems: "center" }}>
                          <i className="ti ti-trash" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addCriterion}
                  style={{ marginTop: "8px", background: "none", border: "none", cursor: "pointer", color: C.textSecondary, fontSize: "13px", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px", padding: "4px 0" }}>
                  <i className="ti ti-plus" style={{ fontSize: "14px" }} />Add criterion
                </button>
              </div>

              {/* Submit */}
              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={() => setShowForm(false)}
                  style={{ padding: "9px 16px", borderRadius: "7px", border: `1px solid ${C.border}`, background: C.cardBg, color: C.textSecondary, fontSize: "14px", fontWeight: "500", fontFamily: "inherit", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit"
                  style={{ flex: 1, padding: "9px 16px", borderRadius: "7px", border: "none", background: C.primary, color: C.primaryText, fontSize: "14px", fontWeight: "600", fontFamily: "inherit", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px" }}>
                  <i className="ti ti-clipboard-list" style={{ fontSize: "15px" }} />
                  Create assignment ({totalMarks} marks)
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Assignment list ── */}
        <div style={{ padding: assignments.length === 0 ? "40px 20px" : "8px 0" }}>
          {assignments.length === 0 ? (
            <div style={{ textAlign: "center" }}>
              <i className="ti ti-clipboard-list" style={{ fontSize: "30px", color: C.border, display: "block", marginBottom: "10px" }} />
              <p style={{ fontSize: "14px", color: C.textMuted }}>No assignments yet. Create one above.</p>
            </div>
          ) : (
            assignments.map((a, i) => (
              <AssignmentRow
                key={a.id}
                assignment={a}
                last={i === assignments.length - 1}
                isPast={isPastDeadline(a)}
                onViewSubmissions={() => navigate(`/teacher/assignments/${a.id}/submissions`)}
                onDelete={() => handleDelete(a.id)}
              />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function AssignmentRow({ assignment: a, last, isPast, onViewSubmissions, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: "14px 18px", borderBottom: last ? "none" : `1px solid ${C.border}`, background: hovered ? C.subtleBg : C.cardBg, transition: "background 0.12s" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        {/* Left: info */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: "15px", fontWeight: "600", color: C.textPrimary, margin: "0 0 4px" }}>{a.title}</p>
          {a.description && (
            <p style={{ fontSize: "13px", color: C.textMuted, margin: "0 0 6px", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {a.description}
            </p>
          )}
          {a.due_date && (
            <p style={{ fontSize: "12px", fontWeight: "600", color: isPast ? C.textMuted : C.dangerText, margin: "0 0 6px" }}>
              <i className="ti ti-clock" style={{ marginRight: "4px" }} />
              Due {new Date(a.due_date).toLocaleString()}
              {isPast && <span style={{ fontWeight: "400", marginLeft: "6px" }}>(closed)</span>}
            </p>
          )}
          {/* Criteria badges */}
          {a.criteria?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", marginTop: "4px" }}>
              {a.criteria.map((c) => (
                <span key={c.id} style={{ fontSize: "11px", fontWeight: "600", background: C.infoBg, color: C.infoText, border: `1px solid ${C.infoBorder}`, padding: "2px 8px", borderRadius: "20px" }}>
                  {c.label} ({c.max_marks})
                </span>
              ))}
              <span style={{ fontSize: "11px", fontWeight: "700", background: C.subtleBg, color: C.textPrimary, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: "20px" }}>
                Total: {a.total_marks}
              </span>
            </div>
          )}
        </div>
        {/* Right: actions */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
          <button onClick={onViewSubmissions}
            style={{ fontSize: "13px", fontWeight: "600", color: C.textSecondary, background: C.subtleBg, border: `1px solid ${C.border}`, borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
            <i className="ti ti-eye" style={{ fontSize: "13px" }} />View submissions
          </button>
          <button onClick={onDelete}
            style={{ fontSize: "12px", color: C.dangerText, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared input style helpers
const inputStyle = {
  width: "100%", background: C.inputBg, border: "1.5px solid transparent",
  borderRadius: "7px", padding: "10px 13px", fontSize: "15px",
  color: C.textPrimary, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};
const focusOn  = (e) => { e.target.style.borderColor = C.focusBorder; e.target.style.background = C.inputFocus; e.target.style.boxShadow = "0 0 0 3px rgba(17,17,17,0.08)"; };
const focusOff = (e) => { e.target.style.borderColor = "transparent"; e.target.style.background = C.inputBg; e.target.style.boxShadow = "none"; };