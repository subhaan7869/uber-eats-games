import { useState } from "react";
import type { DriverProfile } from "./Onboarding";

interface Props {
  profile: DriverProfile;
  onLogin: (code: string) => boolean;
}

type View = "login" | "forgot" | "revealed";

export default function Login({ profile, onLogin }: Props) {
  const [code, setCode]     = useState("");
  const [error, setError]   = useState("");
  const [view, setView]     = useState<View>("login");

  const [forgotName, setForgotName]       = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotError, setForgotError]     = useState("");
  const [newCode, setNewCode]             = useState(profile.driverCode);

  function handleSubmit() {
    const trimmed = code.trim().toUpperCase();
    const ok = onLogin(trimmed);
    if (!ok) {
      setError("Incorrect driver code. Please try again.");
      setCode("");
    }
  }

  function handleVerifyIdentity() {
    const nameMatch = forgotName.trim().toLowerCase() === profile.name.trim().toLowerCase();
    const passMatch = forgotPassword === profile.password;
    if (nameMatch && passMatch) {
      setForgotError("");
      setView("revealed");
    } else {
      setForgotError("Name or password didn't match. Please try again.");
    }
  }

  function handleResetCode() {
    const num = Math.floor(100000 + Math.random() * 900000);
    const generated = `DRV-${num}`;
    setNewCode(generated);
    const updated = { ...profile, driverCode: generated };
    localStorage.setItem("uber_eats_driver_profile", JSON.stringify(updated));
  }

  function handleUseCode() {
    setCode(newCode);
    setView("login");
    setForgotName("");
    setForgotPassword("");
  }

  const ready = code.trim().length >= 3;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100dvh",
      background: "#000", fontFamily: "'Inter',-apple-system,sans-serif",
      padding: "0 24px", animation: "fadeInUp 0.3s ease",
    }}>

      {/* ── MAIN LOGIN ── */}
      {view === "login" && (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ marginBottom: 36, animation: "badgePop 0.5s ease" }}>
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
                <rect width="72" height="72" rx="18" fill="#06C167"/>
                <path d="M18 23h10v20a9 9 0 0018 0V23h10v20a19 19 0 01-38 0V23z" fill="white"/>
              </svg>
            </div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 30, letterSpacing: "-0.8px", marginBottom: 4, textAlign: "center" }}>Welcome back</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginBottom: 44, textAlign: "center" }}>
              Sign in to your driver account
            </div>

            <div style={{ alignSelf: "stretch", background: "#111", borderRadius: 18, padding: "18px 16px", marginBottom: 14, border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
                  {profile.avatar}
                </div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{profile.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 3 }}>{profile.vehicleEmoji} {profile.vehicle} · {profile.city}</div>
                </div>
              </div>

              <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Driver Code</label>
              <input
                autoFocus
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder="DRV-000000"
                onKeyDown={e => e.key === "Enter" && ready && handleSubmit()}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#1a1a1a", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 14px",
                  color: "#fff", fontSize: 18, fontWeight: 700,
                  caretColor: "#06C167", fontFamily: "monospace",
                  letterSpacing: "0.12em",
                }}
              />
              {error && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{error}</div>}
            </div>

            {/* Forgot link */}
            <button
              onClick={() => { setView("forgot"); setForgotError(""); }}
              style={{ background: "none", border: "none", color: "#06C167", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "6px 0" }}
            >
              Forgot your driver code?
            </button>
          </div>

          <div style={{ paddingBottom: 46 }}>
            <button
              onClick={handleSubmit}
              disabled={!ready}
              style={{
                width: "100%", background: ready ? "#06C167" : "#111",
                border: "none", borderRadius: 100,
                color: ready ? "#fff" : "rgba(255,255,255,0.2)",
                fontWeight: 800, fontSize: 17, padding: "18px",
                cursor: ready ? "pointer" : "default",
                transition: "background 0.2s ease",
              }}
            >Log In</button>
            <div style={{ color: "rgba(255,255,255,0.18)", fontSize: 12, textAlign: "center", marginTop: 14 }}>
              Your driver code was shown during sign-up
            </div>
          </div>
        </>
      )}

      {/* ── FORGOT CODE: VERIFY IDENTITY ── */}
      {view === "forgot" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", animation: "fadeInUp 0.25s ease" }}>
          <div style={{ paddingTop: 64, marginBottom: 32 }}>
            <button
              onClick={() => setView("login")}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>←</span> Back
            </button>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 18 }}>
              🔑
            </div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 26, letterSpacing: "-0.5px", marginBottom: 6 }}>Reset driver code</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Verify your identity to recover or reset your code</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <div>
              <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Full Name
              </label>
              <input
                autoFocus
                value={forgotName}
                onChange={e => { setForgotName(e.target.value); setForgotError(""); }}
                placeholder={profile.name}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#111", border: "2px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 14px",
                  color: "#fff", fontSize: 16,
                  caretColor: "#06C167",
                }}
              />
            </div>
            <div>
              <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                Password
              </label>
              <input
                type="password"
                value={forgotPassword}
                onChange={e => { setForgotPassword(e.target.value); setForgotError(""); }}
                placeholder="Your password"
                onKeyDown={e => e.key === "Enter" && forgotName && forgotPassword && handleVerifyIdentity()}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "#111", border: forgotError ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)",
                  borderRadius: 14, padding: "16px 14px",
                  color: "#fff", fontSize: 16,
                  caretColor: "#06C167",
                }}
              />
            </div>
            {forgotError && (
              <div style={{ background: "#FF3B3015", border: "1px solid #FF3B3040", borderRadius: 10, padding: "10px 14px", color: "#FF3B30", fontSize: 13 }}>
                {forgotError}
              </div>
            )}
          </div>

          <div style={{ paddingBottom: 46 }}>
            <button
              onClick={handleVerifyIdentity}
              disabled={!forgotName.trim() || !forgotPassword}
              style={{
                width: "100%",
                background: forgotName.trim() && forgotPassword ? "#06C167" : "#111",
                border: "none", borderRadius: 100,
                color: forgotName.trim() && forgotPassword ? "#fff" : "rgba(255,255,255,0.2)",
                fontWeight: 800, fontSize: 17, padding: "18px",
                cursor: forgotName.trim() && forgotPassword ? "pointer" : "default",
              }}
            >
              Verify Identity
            </button>
          </div>
        </div>
      )}

      {/* ── REVEALED CODE ── */}
      {view === "revealed" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", animation: "fadeInUp 0.25s ease" }}>
          <div style={{ paddingTop: 64, marginBottom: 32 }}>
            <button
              onClick={() => setView("login")}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 14, cursor: "pointer", padding: "0 0 20px", display: "flex", alignItems: "center", gap: 6 }}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>←</span> Back to login
            </button>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#06C16720", border: "1px solid #06C16740", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 18 }}>
              ✅
            </div>
            <div style={{ color: "#fff", fontWeight: 900, fontSize: 26, letterSpacing: "-0.5px", marginBottom: 6 }}>Identity verified</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Here is your current driver code</div>
          </div>

          {/* Code display card */}
          <div style={{ background: "#111", borderRadius: 18, padding: "24px 20px", border: "1px solid rgba(255,255,255,0.07)", marginBottom: 16 }}>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>Your Driver Code</div>
            <div style={{
              background: "#1a1a1a", borderRadius: 14, padding: "20px",
              textAlign: "center", border: "2px solid #06C16750",
              fontFamily: "monospace", fontSize: 28, fontWeight: 900,
              color: "#06C167", letterSpacing: "0.12em",
            }}>
              {newCode}
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", marginTop: 10 }}>
              Keep this code safe — you need it to log in
            </div>
          </div>

          <button
            onClick={handleResetCode}
            style={{
              width: "100%", background: "none",
              border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 100,
              color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 15, padding: "16px",
              cursor: "pointer", marginBottom: 12,
            }}
          >
            🔄 Generate a New Code
          </button>

          <div style={{ flex: 1 }} />

          <div style={{ paddingBottom: 46 }}>
            <button
              onClick={handleUseCode}
              style={{
                width: "100%", background: "#06C167",
                border: "none", borderRadius: 100,
                color: "#fff", fontWeight: 800, fontSize: 17, padding: "18px",
                cursor: "pointer",
              }}
            >
              Use This Code to Log In
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes badgePop  { 0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        input:focus { outline: none; border-color: #06C167 !important; }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
