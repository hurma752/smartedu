// src/components/teacher/AssignmentsPanel.jsx
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import * as assignmentsApi from "../../api/assignments";
import { getErrorMessage } from "../../utils/errorMessage";

export default function AssignmentsPanel({ courseId }) {
  const [assignments, setAssignments] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  const isPastDeadline = (assignment) => {
    if (!assignment.due_date) return false;
    return new Date() > new Date(assignment.due_date);
  };

  // Assignment form state — criteria are now inline
  const [form, setForm] = useState({
    title: "",
    description: "",
    due_date: "",
    criteria: [{ label: "", max_marks: 5, description: "" }],
  });

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

    const emptyCriteria = form.criteria.filter(c => !c.label.trim());
    if (emptyCriteria.length > 0) {
      setError("All rubric criteria must have a label.");
      return;
    }

    try {
      await assignmentsApi.createAssignment(courseId, {
        title: form.title,
        description: form.description,
        due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
        criteria: form.criteria.map(c => ({
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
    <div className="space-y-6">
      {error && <div className="bg-[#FBEAEA] text-[#C0392B] text-sm rounded-lg px-3 py-2">{error}</div>}

      <div className="bg-white rounded-[18px] shadow-sm border border-[#E4E4E8] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg text-[#1A1A1F]">Assignments</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#6C72E0] hover:bg-[#5A60D6] text-white text-sm font-semibold px-4 py-2 rounded-[10px] transition-colors"
          >
            {showForm ? "Cancel" : "New assignment"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="border border-[#E4E4E8] rounded-[12px] p-5 mb-5 space-y-4">
            <h3 className="font-semibold text-[#1A1A1F]">Create assignment</h3>

            <div>
              <label className="block text-xs font-medium text-[#6B6B76] mb-1">Title</label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-[#F0F0F3] rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 transition-colors"
                placeholder="e.g. Cybersecurity Case Study"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6B76] mb-1">
                Description / Instructions
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full bg-[#F0F0F3] rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 transition-colors preserve-format"
                rows={4}
                placeholder="Describe what students need to do..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#6B6B76] mb-1">Due date & time (optional)</label>
              <input
                type="datetime-local"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full bg-[#F0F0F3] rounded-[8px] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30 transition-colors"
              />
            </div>

            {/* Inline rubric builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-[#6B6B76]">
                  Rubric criteria
                  <span className="ml-2 text-[#6C72E0] font-semibold">Total: {totalMarks} marks</span>
                </label>
              </div>

              <div className="space-y-2">
                {form.criteria.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center bg-[#F7F7F9] rounded-[8px] px-3 py-2">
                    <input
                      required
                      placeholder={`Criterion ${i + 1} (e.g. Research Quality)`}
                      value={c.label}
                      onChange={(e) => updateCriterion(i, "label", e.target.value)}
                      className="flex-1 bg-white rounded-[6px] px-3 py-1.5 text-sm border border-[#E4E4E8] focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min="1"
                        required
                        value={c.max_marks}
                        onChange={(e) => updateCriterion(i, "max_marks", e.target.value)}
                        className="w-16 bg-white rounded-[6px] px-2 py-1.5 text-sm text-center border border-[#E4E4E8] focus:outline-none focus:ring-2 focus:ring-[#6C72E0]/30"
                      />
                      <span className="text-xs text-[#6B6B76]">marks</span>
                    </div>
                    {form.criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCriterion(i)}
                        className="text-[#C0392B] text-xs hover:underline shrink-0"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addCriterion}
                className="mt-2 text-sm text-[#6C72E0] hover:underline"
              >
                + Add criterion
              </button>
            </div>

            <button
              type="submit"
              className="w-full bg-[#6C72E0] hover:bg-[#5A60D6] text-white text-sm font-semibold rounded-[10px] py-2.5 transition-colors"
            >
              Create assignment ({totalMarks} marks total)
            </button>
          </form>
        )}

        {assignments.length === 0 ? (
          <p className="text-sm text-[#6B6B76]">No assignments yet. Create one above.</p>
        ) : (
          <ul className="space-y-3">
            {assignments.map((a, i) => (
              <li key={a.id} className="border border-[#EFEBE3] rounded-[12px] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1A1F]">{a.title}</p>
                    {a.description && (
                      <p className="text-xs text-[#6B6B76] mt-1 line-clamp-2 preserve-format">{a.description}</p>
                    )}
                    {a.due_date && (
                      <p className="text-xs font-bold text-[#C0392B] mt-1">
                        Due {new Date(a.due_date).toLocaleString()}
                        {isPastDeadline(a) && <span className="ml-1 font-normal text-[#6B6B76]">(closed)</span>}
                      </p>
                    )}
                    {/* Rubric summary */}
                    {a.criteria && a.criteria.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {a.criteria.map((c) => (
                          <span key={c.id} className="text-xs bg-[#EEF0FC] text-[#6C72E0] rounded-full px-2 py-0.5">
                            {c.label} ({c.max_marks})
                          </span>
                        ))}
                        <span className="text-xs bg-[#F7F7F9] text-[#1A1A1F] font-semibold rounded-full px-2 py-0.5">
                          Total: {a.total_marks}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Link
                      to={`/teacher/assignments/${a.id}/submissions`}
                      className="text-sm text-[#6C72E0] font-medium hover:underline whitespace-nowrap"
                    >
                      View submissions
                    </Link>
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-xs text-[#C0392B] hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}