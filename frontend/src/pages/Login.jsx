// src/pages/Login.jsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import backgroundImage from "../assets/alpha-bg.jpg";
import { C, T } from "../theme";

export default function Login() {
  const { loginUser } = useAuth();
  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState("");
  const [loading, setLoading]           = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser(email, password);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(Array.isArray(detail) ? "Invalid email or password." : detail || "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif", backgroundImage: `url(${backgroundImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", position: "relative" }}>

      {/* Subtle dark overlay so text reads well over the bg */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", pointerEvents: "none" }} />

      <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: "12px", width: "100%", maxWidth: "420px", position: "relative", zIndex: 1, boxShadow: "0 8px 40px rgba(0,0,0,0.18)", overflow: "hidden" }}>

        {/* Red top accent stripe */}
        <div style={{ height: "4px", background: C.accent }} />

        <div style={{ padding: "36px 36px 32px" }}>

          {/* ── Alpha Logo — large & prominent ── */}
          <div style={{ textAlign: "center", marginBottom: "28px" }}>
            {/* Logo pill — significantly larger than before */}
            <div style={{ display: "inline-flex", background: "#111111", borderRadius: "8px", padding: "11px 14px", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ background: C.accent, color: "#fff", fontWeight: "800", fontSize: "18px", padding: "5px 10px", borderRadius: "5px", lineHeight: 1, letterSpacing: "0.01em" }}>alpha</span>
              <span style={{ color: "#fff", fontWeight: "700", fontSize: "10px", lineHeight: "1.3", letterSpacing: "0.06em", textTransform: "uppercase", paddingLeft: "10px" }}>
                ALPHA<br />EDUCATION<br />NETWORK
              </span>
            </div>

            {/* SmartEdu label */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
              <span style={{ fontSize: "11px", fontWeight: "700", color: C.textMuted, letterSpacing: "0.1em", textTransform: "uppercase" }}>SmartEdu LMS</span>
              <div style={{ height: "1px", width: "28px", background: C.border }} />
            </div>
          </div>

          {/* Heading */}
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: C.textPrimary, textAlign: "center", marginBottom: "6px", letterSpacing: "-0.03em" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: "14px", color: C.textMuted, textAlign: "center", marginBottom: "26px" }}>
            Sign in to your account to continue
          </p>

          {/* Error */}
          {error && (
            <div role="alert" style={{ background: C.dangerBg, color: C.dangerText, border: `1px solid ${C.dangerBorder}`, borderRadius: "7px", padding: "11px 13px", marginBottom: "16px", display: "flex", alignItems: "flex-start", gap: "9px", fontSize: "14px" }}>
              <i className="ti ti-alert-circle" style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }} />
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate>
            <EmailField value={email} onChange={setEmail} />
            <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword(!showPassword)} />

            <div style={{ textAlign: "right", marginBottom: "20px", marginTop: "-6px" }}>
              <Link to="/forgot-password" style={{ fontSize: "14px", color: C.accent, textDecoration: "none", fontWeight: "500" }}>
                Forgot password?
              </Link>
            </div>

            <button type="submit" disabled={loading}
              style={{ width: "100%", background: loading ? "#555" : C.primary, color: "#fff", border: "none", borderRadius: "8px", padding: "13px", fontSize: "15px", fontWeight: "600", fontFamily: "inherit", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "9px", letterSpacing: "0.01em" }}>
              {loading
                ? <><i className="ti ti-loader-2" style={{ fontSize: "17px", animation: "spin 1s linear infinite" }} />Signing in…</>
                : <><i className="ti ti-lock" style={{ fontSize: "16px" }} />Sign in</>
              }
            </button>
          </form>
        </div>

        {/* Footer */}
        <div style={{ background: "#F9FAFB", borderTop: `1px solid ${C.border}`, padding: "12px 36px", textAlign: "center" }}>
          <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
            Copyright 2024–25 &nbsp;·&nbsp; Alpha Education Network &nbsp;·&nbsp; All rights reserved
          </p>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function EmailField({ value, onChange }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: "14px" }}>
      <i className="ti ti-mail" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "17px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
      <input type="email" required autoComplete="email" placeholder="Email address" value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", background: focused ? "#fff" : C.inputBg, border: `1.5px solid ${focused ? C.focusBorder : "transparent"}`, boxShadow: focused ? "0 0 0 3px rgba(17,17,17,0.08)" : "none", borderRadius: "8px", padding: "12px 13px 12px 42px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
      />
    </div>
  );
}

function PasswordField({ value, onChange, show, onToggle }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: "10px" }}>
      <i className="ti ti-lock" style={{ position: "absolute", left: "13px", top: "50%", transform: "translateY(-50%)", fontSize: "17px", color: focused ? C.textPrimary : C.textMuted, pointerEvents: "none" }} />
      <input type={show ? "text" : "password"} required autoComplete="current-password" placeholder="Password" value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        style={{ width: "100%", background: focused ? "#fff" : C.inputBg, border: `1.5px solid ${focused ? C.focusBorder : "transparent"}`, boxShadow: focused ? "0 0 0 3px rgba(17,17,17,0.08)" : "none", borderRadius: "8px", padding: "12px 44px 12px 42px", fontSize: "15px", color: C.textPrimary, fontFamily: "inherit", outline: "none" }}
      />
      <button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}
        style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: "17px", padding: "2px", display: "flex", alignItems: "center" }}>
        <i className={show ? "ti ti-eye-off" : "ti ti-eye"} />
      </button>
    </div>
  );
}