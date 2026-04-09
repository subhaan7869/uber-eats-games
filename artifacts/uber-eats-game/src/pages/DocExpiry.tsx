import { useState } from "react";
import type { DriverProfile } from "./Onboarding";

interface Props {
  profile: DriverProfile;
  onVerify: (name: string, password: string) => boolean;
}

type Step = "expired" | "form" | "checking" | "done";

export default function DocExpiry({ profile, onVerify }: Props) {
  const [step, setStep] = useState<Step>("expired");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  function handleSubmit() {
    const ok = onVerify(name.trim(), password);
    if (!ok) {
      setError("Name or password incorrect. Please try again.");
      return;
    }
    setStep("checking");
    setCountdown(7);
    const iv = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(iv);
          setStep("done");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  const base: React.CSSProperties = {
    display: "flex", flexDirection: "column", height: "100dvh",
    background: "#000", fontFamily: "'Inter',-apple-system,sans-serif",
    animation: "fadeInUp 0.3s ease",
  };

  if (step === "expired") return (
    <div style={{ ...base, padding: "0 24px", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(255,59,48,0.12)", border: "1.5px solid rgba(255,59,48,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 24 }}>📋</div>
      <div style={{ color: "#FF3B30", fontWeight: 900, fontSize: 24, marginBottom: 8, textAlign: "center", letterSpacing: "-0.5px" }}>Documents Expired</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
        Your driver documents need to be renewed.<br />Verify your identity to continue driving.
      </div>
      <div style={{ background: "#111", border: "1px solid rgba(255,59,48,0.2)", borderRadius: 18, padding: "6px 0", alignSelf: "stretch", marginBottom: 28 }}>
        {[
          { icon: "🪪", label: "Driver Licence" },
          { icon: "🚗", label: "Vehicle Insurance" },
          { icon: "📄", label: "Right to Work" },
        ].map(({ icon, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, flex: 1 }}>{label}</span>
            <span style={{ color: "#FF3B30", fontSize: 11, fontWeight: 700, background: "rgba(255,59,48,0.1)", borderRadius: 100, padding: "3px 10px" }}>EXPIRED</span>
          </div>
        ))}
      </div>
      <button onClick={() => setStep("form")} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 17, padding: "18px", cursor: "pointer" }}>
        Verify Identity →
      </button>
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );

  if (step === "form") return (
    <div style={{ ...base, padding: "0 24px" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, marginBottom: 18 }}>🔐</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 26, marginBottom: 8, letterSpacing: "-0.5px" }}>Re-verify Identity</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginBottom: 36 }}>Enter your account details to renew your documents.</div>

        <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Full Name</label>
        <input autoFocus value={name} onChange={e => { setName(e.target.value); setError(""); }}
          placeholder={`e.g. ${profile.name}`} style={{
            width: "100%", boxSizing: "border-box",
            background: "#111", border: "2px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "17px 14px", color: "#fff", fontSize: 16, fontWeight: 600,
            caretColor: "#06C167", marginBottom: 16,
          }} />

        <label style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Password</label>
        <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
          placeholder="Enter your password"
          onKeyDown={e => e.key === "Enter" && name.trim() && password && handleSubmit()}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "#111", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)",
            borderRadius: 14, padding: "17px 14px", color: "#fff", fontSize: 16, fontWeight: 600,
            caretColor: "#06C167",
          }} />
        {error && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{error}</div>}
      </div>

      <div style={{ paddingBottom: 46 }}>
        <button onClick={handleSubmit} disabled={!name.trim() || !password} style={{
          width: "100%", background: name.trim() && password ? "#06C167" : "#111",
          border: "none", borderRadius: 100,
          color: name.trim() && password ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight: 800, fontSize: 17, padding: "18px",
          cursor: name.trim() && password ? "pointer" : "default",
        }}>Confirm Identity</button>
      </div>

      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input:focus{outline:none;border-color:#06C167!important}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );

  if (step === "checking") return (
    <div style={{ ...base, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", border: "3.5px solid rgba(255,255,255,0.06)", borderTop: "3.5px solid #06C167", animation: "spin 0.9s linear infinite", marginBottom: 32 }} />
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginBottom: 6, letterSpacing: "-0.3px" }}>Processing documents</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, marginBottom: 28 }}>Please wait...</div>
      <div style={{ color: "#06C167", fontWeight: 900, fontSize: 52, letterSpacing: "-2px" }}>{countdown}</div>
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, marginTop: 6 }}>seconds remaining</div>
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );

  return (
    <div style={{ ...base, alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 24 }}>✅</div>
      <div style={{ color: "#06C167", fontWeight: 900, fontSize: 26, marginBottom: 8, letterSpacing: "-0.5px" }}>Documents Renewed!</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", marginBottom: 36, lineHeight: 1.6 }}>
        Your documents have been verified and renewed successfully.
      </div>
      <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Taking you back to the app...</div>
      <style>{`
        @keyframes fadeInUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
