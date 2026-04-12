import { useState } from "react";
import type { DriverProfile } from "./Onboarding";

interface Props {
  profile: DriverProfile;
  onLogin: (email: string, password: string) => boolean;
}

export default function Login({ profile, onLogin }: Props) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  function handleSubmit() {
    const ok = onLogin(email.trim().toLowerCase(), password);
    if (!ok) {
      setError("Incorrect email or password. Please try again.");
      setPassword("");
    }
  }

  const ready = email.trim().length > 0 && password.length >= 1;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100dvh",
      background: "#000", fontFamily: "'Inter',-apple-system,sans-serif",
      padding: "0 24px", animation: "fadeInUp 0.3s ease",
    }}>
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

        <div style={{ alignSelf: "stretch", background: "#111", borderRadius: 18, padding: "18px 16px", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
              {profile.avatar}
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{profile.name}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 2 }}>{profile.vehicleEmoji} {profile.vehicle} · {profile.city}</div>
            </div>
          </div>

          <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Email</label>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(""); }}
            placeholder="you@example.com"
            onKeyDown={e => e.key === "Enter" && ready && handleSubmit()}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#1a1a1a", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)",
              borderRadius: 14, padding: "16px 14px", marginBottom: 14,
              color: "#fff", fontSize: 15, fontWeight: 500,
              caretColor: "#06C167",
            }}
          />

          <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Your password"
              onKeyDown={e => e.key === "Enter" && ready && handleSubmit()}
              style={{
                width: "100%", boxSizing: "border-box",
                background: "#1a1a1a", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)",
                borderRadius: 14, padding: "16px 44px 16px 14px",
                color: "#fff", fontSize: 15, fontWeight: 500,
                caretColor: "#06C167",
              }}
            />
            <button
              onClick={() => setShowPass(v => !v)}
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(255,255,255,0.35)", fontSize: 12, cursor: "pointer", padding: 4 }}
            >{showPass ? "Hide" : "Show"}</button>
          </div>
          {error && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 10 }}>{error}</div>}
        </div>
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
          Sign in with the email and password you used at sign-up
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes badgePop  { 0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        input:focus { outline: none; border-color: #06C167 !important; }
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
