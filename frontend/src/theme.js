// src/theme.js
// SmartEdu · Alpha College — Concept A "Executive Premium"
// Single source of truth. No dark mode.

export const C = {
  // ── Surfaces ──────────────────────────────────────────────────────
  pageBg:       "#F8F9FA",
  cardBg:       "#FFFFFF",
  subtleBg:     "#F3F4F6",
  border:       "#E5E7EB",
  borderStrong: "#D1D5DB",

  // ── Text ──────────────────────────────────────────────────────────
  textPrimary:   "#111111",
  textSecondary: "#4B5563",
  textMuted:     "#9CA3AF",

  // ── Brand — Alpha charcoal + red ──────────────────────────────────
  // Primary: charcoal black — buttons, active nav, headings
  primary:       "#111111",
  primaryHover:  "#000000",

  // Accent: Alpha red — sparingly, same role as red in the logo
  accent:        "#D62828",
  accentHover:   "#B91C1C",
  accentTint:    "#FEF2F2",
  accentText:    "#991B1B",

  // ── Sidebar — dark field echoing the logo background ──────────────
  sidebarBg:        "#0D0D0D",
  sidebarBorder:    "rgba(255,255,255,0.07)",
  sidebarText:      "rgba(255,255,255,0.45)",
  sidebarTextHover: "rgba(255,255,255,0.75)",
  sidebarActive:    "#FFFFFF",
  sidebarActiveBg:  "rgba(255,255,255,0.09)",
  sidebarMuted:     "rgba(255,255,255,0.25)",

  // ── Inputs ────────────────────────────────────────────────────────
  inputBg:      "#F3F4F6",
  inputFocus:   "#FFFFFF",
  focusBorder:  "#111111",

  // ── Semantic ──────────────────────────────────────────────────────
  successBg:     "#F0FDF4",
  successText:   "#166534",
  successBorder: "#BBF7D0",

  warningBg:     "#FFFBEB",
  warningText:   "#92400E",
  warningBorder: "#FDE68A",

  dangerBg:      "#FEF2F2",
  dangerText:    "#991B1B",
  dangerBorder:  "#FECACA",

  infoBg:        "#EFF6FF",
  infoText:      "#1E40AF",
  infoBorder:    "#BFDBFE",

  // ── Stat card accent bars (left border) ───────────────────────────
  statCourses:  "#D62828",  // red
  statTeachers: "#198754",  // green
  statStudents: "#2563EB",  // blue
  statPending:  "#F59E0B",  // amber

  // ── Misc ──────────────────────────────────────────────────────────
  footerText: "#9CA3AF",
};

// Role badge colours
export const ROLE_COLORS = {
  admin:   { bg: "#F3F4F6", text: "#111111" },
  teacher: { bg: "#F0FDF4", text: "#166534" },
  student: { bg: "#EFF6FF", text: "#1E40AF" },
};

// ── Typography scale — University ERP, spacious & readable ────────────────
export const T = {
  pageTitle:      { fontSize: "28px", fontWeight: "700", letterSpacing: "-0.03em", lineHeight: "1.2" },
  pageSubtitle:   { fontSize: "14px", fontWeight: "500", letterSpacing: "0.04em", textTransform: "uppercase" },
  sectionHeading: { fontSize: "16px", fontWeight: "700", letterSpacing: "-0.01em" },
  cardTitle:      { fontSize: "15px", fontWeight: "600" },
  navItem:        { fontSize: "14px", fontWeight: "400" },
  formLabel:      { fontSize: "14px", fontWeight: "500" },
  inputText:      { fontSize: "15px" },
  buttonText:     { fontSize: "14px", fontWeight: "600", letterSpacing: "0.01em" },
  tableHeader:    { fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em", textTransform: "uppercase" },
  tableCell:      { fontSize: "14px" },
  badge:          { fontSize: "11px", fontWeight: "600" },
  statValue:      { fontSize: "32px", fontWeight: "700", letterSpacing: "-0.04em", lineHeight: "1" },
  statLabel:      { fontSize: "11px", fontWeight: "700", letterSpacing: "0.07em", textTransform: "uppercase" },
  statSub:        { fontSize: "12px", fontWeight: "400" },
  bodyText:       { fontSize: "14px", lineHeight: "1.6" },
  caption:        { fontSize: "12px" },
  tiny:           { fontSize: "11px" },
};