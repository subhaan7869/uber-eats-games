import { useState, useEffect } from "react";

export interface DriverProfile {
  name: string;
  password: string;
  driverCode: string;
  avatar: string;
  vehicle: string;
  vehicleEmoji: string;
  city: string;
}

interface Props { onComplete: (profile: DriverProfile) => void; }

const AVATARS = ["😊","😎","🧑","👨‍💼","👩‍💼","🧔","👱","🧑‍🦱","👨‍🦰","👩‍🦰","🧑‍🦳","🥷"];
const VEHICLES = [
  { label: "Car",      emoji: "🚗", desc: "Earn more per order" },
  { label: "Scooter",  emoji: "🛵", desc: "Fast in city traffic" },
  { label: "E-Bike",   emoji: "⚡🚲", desc: "Eco-friendly option" },
  { label: "Bicycle",  emoji: "🚲", desc: "Stay fit while earning" },
];
const CITIES = [
  { name: "Nottingham", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "London",     flag: "🇬🇧" },
  { name: "Manchester", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
  { name: "Birmingham", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
];

function generateDriverCode(): string {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `DRV-${num}`;
}

type Screen = "splash" | "name" | "password" | "avatar" | "vehicle" | "city" | "verify" | "welcome";

function UberEatsLogo({ size = 32 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="8" fill="#06C167"/>
        <path d="M8 10h4v8a4 4 0 008 0v-8h4v8a8 8 0 01-16 0v-8z" fill="white"/>
      </svg>
      <span style={{ color: "white", fontWeight: 900, fontSize: size, letterSpacing: "-1px", lineHeight: 1 }}>
        Uber <span style={{ color: "#06C167" }}>Eats</span>
      </span>
    </div>
  );
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < step ? "#06C167" : "rgba(255,255,255,0.12)",
          transition: "background 0.3s ease",
        }} />
      ))}
    </div>
  );
}

export default function Onboarding({ onComplete }: Props) {
  const [screen, setScreen] = useState<Screen>("splash");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [avatar, setAvatar] = useState("");
  const [vehicle, setVehicle] = useState<typeof VEHICLES[0] | null>(null);
  const [city, setCity] = useState(CITIES[0]);
  const [verifyStep, setVerifyStep] = useState(0);
  const [driverCode] = useState(() => generateDriverCode());
  const [fadeKey, setFadeKey] = useState(0);

  function go(s: Screen) {
    setFadeKey(k => k + 1);
    setScreen(s);
  }

  useEffect(() => {
    if (screen !== "verify") return;
    let i = 0;
    setVerifyStep(0);
    const t = setInterval(() => {
      i++;
      if (i >= 4) {
        clearInterval(t);
        setTimeout(() => go("welcome"), 600);
      } else {
        setVerifyStep(i);
      }
    }, 900);
    return () => clearInterval(t);
  }, [screen]);

  const verifySteps = [
    "Checking identity...",
    "Verifying vehicle details...",
    "Running background check...",
    "Activating driver account...",
  ];

  const passwordsMatch = password.length >= 6 && password === confirmPassword;

  const wrap = (children: React.ReactNode, padded = true) => (
    <div key={fadeKey} style={{
      display: "flex", flexDirection: "column", height: "100dvh",
      background: "#000", fontFamily: "'Inter',-apple-system,sans-serif",
      animation: "fadeInUp 0.3s ease",
      ...(padded ? { padding: "0 24px" } : {}),
    }}>
      {children}
      <style>{`
        @keyframes fadeInUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes badgePop { 0%{transform:scale(0.85);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1} }
        @keyframes checkPop { 0%{transform:scale(0);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1} }
        input:focus{outline:none;border-color:#06C167!important}
        .chip:hover{filter:brightness(1.08)}
        .chip:active{transform:scale(0.97)}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );

  if (screen === "splash") return wrap(
    <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ marginBottom: 32, animation: "badgePop 0.5s ease" }}>
          <svg width={90} height={90} viewBox="0 0 90 90" fill="none">
            <rect width="90" height="90" rx="22" fill="#06C167"/>
            <path d="M22 28h12v22a11 11 0 0022 0V28h12v22a23 23 0 01-46 0V28z" fill="white"/>
          </svg>
        </div>
        <div style={{ color: "#fff", fontWeight: 900, fontSize: 36, letterSpacing: "-1px", marginBottom: 6, textAlign: "center" }}>
          Uber Eats
        </div>
        <div style={{ color: "#06C167", fontWeight: 700, fontSize: 14, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 48, textAlign: "center" }}>
          Driver
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 44, alignSelf: "stretch" }}>
          {[["£15+", "Avg/hr"], ["4.9★", "Rating"], ["1M+", "Drivers"]].map(([val, lbl]) => (
            <div key={lbl} style={{ background: "#111", borderRadius: 14, padding: "16px 12px", textAlign: "center", flex: 1 }}>
              <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20 }}>{val}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 3 }}>{lbl}</div>
            </div>
          ))}
        </div>

        {["Work when you want", "Get paid every week", "Keep 100% of tips"].map(p => (
          <div key={p} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, alignSelf: "stretch" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#06C167", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ color: "#000", fontSize: 13, fontWeight: 900 }}>✓</span>
            </div>
            <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 15 }}>{p}</span>
          </div>
        ))}
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("name")} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 100,
          color: "#fff", fontWeight: 800, fontSize: 17, padding: "18px",
          cursor: "pointer", letterSpacing: "-0.2px",
        }}>
          Get Started
        </button>
        <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 12, textAlign: "center", marginTop: 14 }}>
          By continuing you agree to our Terms of Service
        </div>
      </div>
    </>
  );

  if (screen === "name") return wrap(
    <>
      <div style={{ paddingTop: 60, flex: 1 }}>
        <ProgressBar step={1} total={5} />
        <div style={{ marginTop: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Step 1 of 5</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 8, letterSpacing: "-0.5px" }}>What's your name?</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 36 }}>This appears on your driver profile and receipts.</div>

          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Full name"
            onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && go("password")}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#111", border: "2px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: "18px 16px",
              color: "#fff", fontSize: 18, fontWeight: 600,
              caretColor: "#06C167",
            }}
          />
          {name.trim().length > 0 && name.trim().length < 2 && (
            <div style={{ color: "#FF4444", fontSize: 12, marginTop: 8 }}>Please enter at least 2 characters</div>
          )}
        </div>
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("password")} disabled={name.trim().length < 2} style={{
          width: "100%", background: name.trim().length >= 2 ? "#06C167" : "#111",
          border: "none", borderRadius: 100, color: name.trim().length >= 2 ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight: 800, fontSize: 17, padding: "18px", cursor: name.trim().length >= 2 ? "pointer" : "default",
        }}>Continue</button>
      </div>
    </>
  );

  if (screen === "password") return wrap(
    <>
      <div style={{ paddingTop: 60, flex: 1 }}>
        <ProgressBar step={2} total={5} />
        <div style={{ marginTop: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Step 2 of 5</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 8, letterSpacing: "-0.5px" }}>Create a password</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 36 }}>Minimum 6 characters. Used to verify your identity.</div>

          <input autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" style={{
              width: "100%", boxSizing: "border-box",
              background: "#111", border: "2px solid rgba(255,255,255,0.08)",
              borderRadius: 14, padding: "18px 16px",
              color: "#fff", fontSize: 16, fontWeight: 600,
              caretColor: "#06C167", marginBottom: 14,
            }} />

          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            onKeyDown={e => e.key === "Enter" && passwordsMatch && go("avatar")}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "#111", border: `2px solid ${confirmPassword && !passwordsMatch ? "#FF4444" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 14, padding: "18px 16px",
              color: "#fff", fontSize: 16, fontWeight: 600,
              caretColor: "#06C167",
            }} />
          {confirmPassword && !passwordsMatch && (
            <div style={{ color: "#FF4444", fontSize: 12, marginTop: 8 }}>
              {password.length < 6 ? "Password must be at least 6 characters" : "Passwords don't match"}
            </div>
          )}
          {passwordsMatch && <div style={{ color: "#06C167", fontSize: 12, marginTop: 8 }}>✓ Passwords match</div>}
        </div>
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("avatar")} disabled={!passwordsMatch} style={{
          width: "100%", background: passwordsMatch ? "#06C167" : "#111",
          border: "none", borderRadius: 100, color: passwordsMatch ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight: 800, fontSize: 17, padding: "18px", cursor: passwordsMatch ? "pointer" : "default",
        }}>Continue</button>
      </div>
    </>
  );

  if (screen === "avatar") return wrap(
    <>
      <div style={{ paddingTop: 60, flex: 1 }}>
        <ProgressBar step={3} total={5} />
        <div style={{ marginTop: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Step 3 of 5</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 8, letterSpacing: "-0.5px" }}>Choose your avatar</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 28 }}>How you appear to customers.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {AVATARS.map(a => (
              <button key={a} className="chip" onClick={() => setAvatar(a)} style={{
                background: avatar === a ? "#06C16718" : "#111",
                border: avatar === a ? "2.5px solid #06C167" : "2px solid rgba(255,255,255,0.06)",
                borderRadius: 16, padding: "16px 0", fontSize: 32,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: avatar === a ? "0 0 16px #06C16740" : "none",
                position: "relative",
              }}>
                {a}
                {avatar === a && (
                  <div style={{ position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: "50%", background: "#06C167", display: "flex", alignItems: "center", justifyContent: "center", animation: "checkPop 0.2s ease" }}>
                    <span style={{ color: "#000", fontSize: 9, fontWeight: 900 }}>✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("vehicle")} disabled={!avatar} style={{
          width: "100%", background: avatar ? "#06C167" : "#111",
          border: "none", borderRadius: 100, color: avatar ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight: 800, fontSize: 17, padding: "18px", cursor: avatar ? "pointer" : "default",
        }}>Continue</button>
      </div>
    </>
  );

  if (screen === "vehicle") return wrap(
    <>
      <div style={{ paddingTop: 60, flex: 1 }}>
        <ProgressBar step={4} total={5} />
        <div style={{ marginTop: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Step 4 of 5</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 8, letterSpacing: "-0.5px" }}>Your delivery vehicle</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 28 }}>Choose how you'll make deliveries.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {VEHICLES.map(v => {
              const sel = vehicle?.label === v.label;
              return (
                <button key={v.label} className="chip" onClick={() => setVehicle(v)} style={{
                  background: sel ? "#06C16712" : "#111",
                  border: sel ? "2.5px solid #06C167" : "2px solid rgba(255,255,255,0.06)",
                  borderRadius: 16, padding: "16px",
                  display: "flex", alignItems: "center", gap: 14,
                  cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                }}>
                  <span style={{ fontSize: 34, lineHeight: 1, minWidth: 42, textAlign: "center" }}>{v.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{v.label}</div>
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>{v.desc}</div>
                  </div>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    border: `2.5px solid ${sel ? "#06C167" : "rgba(255,255,255,0.15)"}`,
                    background: sel ? "#06C167" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {sel && <span style={{ color: "#000", fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("city")} disabled={!vehicle} style={{
          width: "100%", background: vehicle ? "#06C167" : "#111",
          border: "none", borderRadius: 100, color: vehicle ? "#fff" : "rgba(255,255,255,0.2)",
          fontWeight: 800, fontSize: 17, padding: "18px", cursor: vehicle ? "pointer" : "default",
        }}>Continue</button>
      </div>
    </>
  );

  if (screen === "city") return wrap(
    <>
      <div style={{ paddingTop: 60, flex: 1 }}>
        <ProgressBar step={5} total={5} />
        <div style={{ marginTop: 40 }}>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 10 }}>Step 5 of 5</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 28, marginBottom: 8, letterSpacing: "-0.5px" }}>Select your city</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 28 }}>We'll match you with nearby orders.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {CITIES.map(c => {
              const sel = city.name === c.name;
              return (
                <button key={c.name} className="chip" onClick={() => setCity(c)} style={{
                  background: sel ? "#06C16712" : "#111",
                  border: sel ? "2.5px solid #06C167" : "2px solid rgba(255,255,255,0.06)",
                  borderRadius: 16, padding: "16px",
                  display: "flex", alignItems: "center", gap: 12,
                  cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                }}>
                  <span style={{ fontSize: 26 }}>{c.flag}</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontSize: 16, flex: 1 }}>{c.name}</span>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    border: `2.5px solid ${sel ? "#06C167" : "rgba(255,255,255,0.15)"}`,
                    background: sel ? "#06C167" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {sel && <span style={{ color: "#000", fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ paddingBottom: 44 }}>
        <button onClick={() => go("verify")} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 100,
          color: "#fff", fontWeight: 800, fontSize: 17, padding: "18px", cursor: "pointer",
        }}>Submit Application</button>
      </div>
    </>
  );

  if (screen === "verify") return wrap(
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0 }}>
      <div style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.06)", borderTop: "3px solid #06C167", animation: "spin 0.9s linear infinite", marginBottom: 32 }} />
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginBottom: 8, letterSpacing: "-0.5px" }}>Verifying your account</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 44 }}>This only takes a moment...</div>

      <div style={{ alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 14 }}>
        {verifySteps.map((step, i) => {
          const done = i < verifyStep;
          const active = i === verifyStep;
          return (
            <div key={step} style={{ display: "flex", alignItems: "center", gap: 14, opacity: i > verifyStep ? 0.15 : 1, transition: "opacity 0.4s" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                background: done ? "#06C167" : active ? "rgba(6,193,103,0.15)" : "rgba(255,255,255,0.04)",
                border: active ? "2px solid #06C167" : done ? "none" : "2px solid rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done && <span style={{ color: "#000", fontSize: 13, fontWeight: 900 }}>✓</span>}
                {active && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06C167", animation: "pulse 1s ease-in-out infinite" }} />}
              </div>
              <span style={{ color: done ? "#06C167" : active ? "#fff" : "rgba(255,255,255,0.3)", fontWeight: done || active ? 600 : 400, fontSize: 15, transition: "color 0.3s" }}>{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (screen === "welcome") {
    const profile: DriverProfile = {
      name, password, driverCode, avatar,
      vehicle: vehicle?.label ?? "Car",
      vehicleEmoji: vehicle?.emoji ?? "🚗",
      city: city.name,
    };
    return wrap(
      <>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflowY: "auto" }}>
          <div style={{ color: "#06C167", fontWeight: 700, fontSize: 13, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 24 }}>
            ✓ APPLICATION APPROVED
          </div>

          <div style={{
            background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "24px",
            alignSelf: "stretch", marginBottom: 20, animation: "badgePop 0.5s ease",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div style={{ width: 68, height: 68, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
                {avatar}
              </div>
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, letterSpacing: "-0.3px" }}>{name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06C167" }} />
                  <span style={{ color: "#06C167", fontWeight: 600, fontSize: 12 }}>Active Driver</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { label: "Vehicle", value: `${vehicle?.emoji} ${vehicle?.label}` },
                { label: "City",    value: `${city.flag} ${city.name}` },
                { label: "Rank",    value: "🔵 Blue (Starter)" },
                { label: "Status",  value: "✅ Verified & Active" },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}>{label}</span>
                  <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: "linear-gradient(135deg,#001a0e,#002d18)",
            border: "2px solid #06C167", borderRadius: 18, padding: "18px 20px",
            alignSelf: "stretch", marginBottom: 16, animation: "badgePop 0.6s ease",
          }}>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8 }}>
              🔐 Your Driver Code
            </div>
            <div style={{ color: "#06C167", fontWeight: 900, fontSize: 28, fontFamily: "monospace", letterSpacing: "3px", marginBottom: 6 }}>
              {driverCode}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
              Keep this safe — you'll need it to log in
            </div>
          </div>
        </div>

        <div style={{ paddingBottom: 44 }}>
          <button onClick={() => onComplete(profile)} style={{
            width: "100%", background: "#06C167", border: "none", borderRadius: 100,
            color: "#fff", fontWeight: 800, fontSize: 17, padding: "18px", cursor: "pointer",
          }}>Start Driving</button>
        </div>
      </>
    );
  }

  return null;
}
