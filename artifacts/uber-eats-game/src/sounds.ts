// Uber Eats driver app — synthesized sound effects via Web Audio API

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(frequency: number, startTime: number, duration: number, gain: number, type: OscillatorType = "sine", ac: AudioContext) {
  const osc = ac.createOscillator();
  const gainNode = ac.createGain();
  osc.connect(gainNode);
  gainNode.connect(ac.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startTime);
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function click(ac: AudioContext, startTime: number, gain = 0.3) {
  const buf = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const g = ac.createGain(); g.gain.setValueAtTime(gain, startTime);
  src.connect(g); g.connect(ac.destination);
  src.start(startTime);
}

// ─── Sounds ────────────────────────────────────────────────────────────────────

/** New incoming order — repeating double-ping like Uber's alert */
export function playNewOrder() {
  const ac = getCtx();
  const now = ac.currentTime;
  // Two-ping pattern, repeated twice
  const pattern = [0, 0.18, 0.55, 0.73];
  pattern.forEach(t => {
    tone(1047, now + t,        0.12, 0.5, "sine", ac); // C6
    tone(1319, now + t + 0.07, 0.10, 0.4, "sine", ac); // E6
  });
}

/** Driver accepted an order */
export function playAccept() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(880,  now,       0.08, 0.3, "sine", ac);
  tone(1175, now + 0.1, 0.14, 0.4, "sine", ac);
}

/** Declined / timed out */
export function playDecline() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(300, now,       0.18, 0.3, "triangle", ac);
  tone(220, now + 0.15, 0.25, 0.2, "triangle", ac);
  click(ac, now, 0.15);
}

/** Arrived at restaurant */
export function playArrived() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(784, now,        0.1,  0.35, "sine", ac);
  tone(1047, now + 0.15, 0.18, 0.4, "sine", ac);
}

/** Delivery complete */
export function playDelivered() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(523,  now,        0.1,  0.25, "sine", ac);
  tone(659,  now + 0.12, 0.1,  0.30, "sine", ac);
  tone(784,  now + 0.24, 0.1,  0.30, "sine", ac);
  tone(1047, now + 0.38, 0.28, 0.45, "sine", ac);
}

/** Rank up celebration */
export function playRankUp() {
  const ac = getCtx();
  const now = ac.currentTime;
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((f, i) => tone(f, now + i * 0.11, 0.18, 0.4, "sine", ac));
}

/** Subtle UI tap */
export function playTap() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(1200, now, 0.05, 0.15, "sine", ac);
  click(ac, now, 0.08);
}

/** Incoming message from customer */
export function playMessage() {
  const ac = getCtx();
  const now = ac.currentTime;
  tone(1568, now,        0.06, 0.25, "sine", ac);
  tone(1865, now + 0.08, 0.10, 0.30, "sine", ac);
}
