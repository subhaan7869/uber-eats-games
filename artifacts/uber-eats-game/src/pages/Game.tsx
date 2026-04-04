import { useEffect, useRef, useState, useCallback } from "react";
import { playNewOrder, playAccept, playDecline, playArrived, playDelivered, playRankUp, playTap } from "../sounds";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "offline" | "waiting" | "incoming" | "cancelled" | "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

interface MenuItem { name: string; price: number; }
interface Restaurant { name: string; emoji: string; color: string; address: string; menu: MenuItem[]; }
interface Customer { name: string; rating: number; address: string; orders: number; }
interface Order { restaurant: Restaurant; customer: Customer; items: MenuItem[]; total: number; distance: string; duration: string; }

// ─── Rank System ──────────────────────────────────────────────────────────────

interface Rank { name: string; icon: string; color: string; gradient: string; min: number; max: number | null; perks: string[]; }
const RANKS: Rank[] = [
  { name: "Blue",     icon: "🔵", color: "#4FC3F7", gradient: "linear-gradient(135deg,#0277BD,#4FC3F7)", min: 0,  max: 9,    perks: ["Standard order matching", "Basic driver support"] },
  { name: "Gold",     icon: "🥇", color: "#FFD54F", gradient: "linear-gradient(135deg,#F57F17,#FFD54F)", min: 10, max: 24,   perks: ["Priority order matching", "Gold driver badge", "Dedicated support line"] },
  { name: "Platinum", icon: "💎", color: "#B0BEC5", gradient: "linear-gradient(135deg,#546E7A,#CFD8DC)", min: 25, max: 49,   perks: ["Surge pricing access", "Free Uber One membership", "Top restaurant priority"] },
  { name: "Diamond",  icon: "✨", color: "#CE93D8", gradient: "linear-gradient(135deg,#6A1B9A,#E040FB)", min: 50, max: null, perks: ["Earnings boost +15%", "Exclusive high-value orders", "VIP driver lounge"] },
];
function getRank(t: number): Rank { return [...RANKS].reverse().find(r => t >= r.min) ?? RANKS[0]; }
function getNextRank(t: number): Rank | null { const i = RANKS.findIndex(r => r === getRank(t)); return i < RANKS.length - 1 ? RANKS[i + 1] : null; }
function rankPct(t: number): number { const r = getRank(t); if (!r.max) return 100; return Math.min(100, ((t - r.min) / (r.max - r.min + 1)) * 100); }

// ─── Data ─────────────────────────────────────────────────────────────────────

const RESTAURANTS: Restaurant[] = [
  { name: "McDonald's",  emoji: "🍔", color: "#FF6000", address: "Market Square, Nottingham",
    menu: [{ name: "Big Mac Meal", price: 7.49 }, { name: "McFlurry", price: 2.19 }, { name: "Chicken McNuggets x6", price: 4.39 }, { name: "Fries (Large)", price: 2.89 }] },
  { name: "Burger King", emoji: "👑", color: "#D62300", address: "Upper Parliament St",
    menu: [{ name: "Whopper Meal", price: 8.29 }, { name: "Chicken Royale", price: 6.49 }, { name: "Onion Rings", price: 2.49 }, { name: "Vanilla Shake", price: 2.79 }] },
  { name: "KFC",         emoji: "🍗", color: "#E4002B", address: "Clumber Street",
    menu: [{ name: "Zinger Burger Meal", price: 7.99 }, { name: "Bucket for One", price: 9.49 }, { name: "Popcorn Chicken", price: 3.99 }, { name: "Gravy", price: 1.29 }] },
  { name: "Pizza Hut",   emoji: "🍕", color: "#EE3124", address: "Victoria Centre",
    menu: [{ name: "Pepperoni Passion (M)", price: 13.99 }, { name: "BBQ Chicken (M)", price: 13.49 }, { name: "Dough Balls x8", price: 4.99 }, { name: "Garlic Bread", price: 3.49 }] },
  { name: "Nando's",     emoji: "🔥", color: "#FF6600", address: "Trinity Square",
    menu: [{ name: "1/2 Chicken (Hot)", price: 9.75 }, { name: "Peri Peri Wrap", price: 8.25 }, { name: "Peri Fries", price: 3.75 }, { name: "Halloumi Starter", price: 4.95 }] },
  { name: "Subway",      emoji: "🥖", color: "#009743", address: "Derby Road",
    menu: [{ name: "Foot-long Meatball", price: 7.49 }, { name: "6\" BMT", price: 5.99 }, { name: "Veggie Delite", price: 5.49 }, { name: "Cookies x3", price: 2.49 }] },
  { name: "Wagamama",    emoji: "🍜", color: "#A00000", address: "Cornerhouse",
    menu: [{ name: "Chicken Katsu Curry", price: 13.50 }, { name: "Ramen Noodle Bowl", price: 12.95 }, { name: "Gyoza x6", price: 6.50 }, { name: "Matcha Ice Cream", price: 4.50 }] },
  { name: "Greggs",      emoji: "🥐", color: "#0066CC", address: "Mansfield Road",
    menu: [{ name: "Sausage Roll", price: 1.35 }, { name: "Steak Bake", price: 1.75 }, { name: "Chicken Bake", price: 1.75 }, { name: "Latte", price: 1.75 }] },
];

const CUSTOMERS: Customer[] = [
  { name: "James R.",  rating: 4.92, address: "42 Castle Blvd, NG7",  orders: 347 },
  { name: "Sophie M.", rating: 4.85, address: "17 Lenton Ave, NG7",   orders: 182 },
  { name: "Chris T.",  rating: 4.97, address: "8 Forest Rd West, NG7",orders: 521 },
  { name: "Priya K.",  rating: 4.78, address: "3 Meadows Way, NG2",   orders: 94  },
  { name: "Daniel W.", rating: 4.88, address: "55 Gregory Blvd, NG7", orders: 263 },
  { name: "Emma L.",   rating: 4.95, address: "22 Wollaton Rd, NG8",  orders: 408 },
  { name: "Ravi S.",   rating: 4.81, address: "11 Alfreton Rd, NG7",  orders: 137 },
  { name: "Lucy H.",   rating: 4.90, address: "7 Bunbury Ct, NG7",    orders: 312 },
];

const TIPS = [0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 2, 2.5];
const DURATIONS = ["4 min", "6 min", "8 min", "10 min", "12 min", "7 min", "9 min"];
const DISTANCES = ["0.8 km", "1.2 km", "1.6 km", "2.1 km", "2.4 km", "1.9 km", "3.1 km"];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function fmt(n: number) { return `£${n.toFixed(2)}`; }

function generateOrder(): Order {
  const restaurant = pick(RESTAURANTS);
  const customer = pick(CUSTOMERS);
  const count = Math.floor(rand(1, 4));
  const items = [...restaurant.menu].sort(() => Math.random() - 0.5).slice(0, count);
  const fare = parseFloat((items.reduce((s, i) => s + i.price, 0) * 0.35 + rand(1.5, 3.5)).toFixed(2));
  return { restaurant, customer, items, total: fare, distance: pick(DISTANCES), duration: pick(DURATIONS) };
}

// ─── Animated Road View ───────────────────────────────────────────────────────

function RoadView({ phase, order, progress }: { phase: Phase; order: Order | null; progress: number }) {
  const moving = phase === "to-restaurant" || phase === "to-customer";
  const atRest = phase === "at-restaurant";
  const toCustomer = phase === "to-customer";
  const destEmoji = toCustomer ? "🏠" : (order?.restaurant.emoji ?? "🍔");
  const destLabel = toCustomer ? order?.customer.name : order?.restaurant.name;
  const destColor = toCustomer ? "#276EF1" : (order?.restaurant.color ?? "#06C167");

  return (
    <div style={{ position: "relative", flex: 1, background: "#111", overflow: "hidden", minHeight: 0 }}>
      {/* Sky */}
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,#0a0a1a 0%,#111827 40%,#1a1a1a 100%)" }} />

      {/* City silhouette */}
      <Skyline />

      {/* Road surface */}
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "44%", top: "28%", background: "#1c1c1c", boxShadow: "0 0 40px rgba(0,0,0,0.8)" }}>
        {/* Road edges */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "#FFD700", opacity: 0.6 }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, background: "#FFD700", opacity: 0.6 }} />

        {/* Center dashes — animate when moving */}
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0, width: 4,
          transform: "translateX(-50%)",
          backgroundImage: "repeating-linear-gradient(to bottom, #fff 0px, #fff 28px, transparent 28px, transparent 56px)",
          backgroundSize: "4px 56px",
          animation: moving ? "roadScroll 0.4s linear infinite" : "none",
          opacity: 0.35,
        }} />

        {/* Progress fill */}
        {(moving || atRest) && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            height: `${100 - progress}%`,
            background: `linear-gradient(to top, ${destColor}18, transparent)`,
            transition: "height 0.3s ease",
          }} />
        )}
      </div>

      {/* Side lane markings */}
      {["-28%", "72%"].map((left, i) => (
        <div key={i} style={{
          position: "absolute", top: "28%", bottom: 0, left, width: "6%",
          background: "#161616",
          borderLeft: i === 0 ? "3px solid #2a2a2a" : "none",
          borderRight: i === 1 ? "3px solid #2a2a2a" : "none",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "repeating-linear-gradient(to bottom, #2a2a2a 0px, #2a2a2a 20px, transparent 20px, transparent 40px)",
            animation: moving ? "roadScroll 0.4s linear infinite" : "none",
            opacity: 0.5,
          }} />
        </div>
      ))}

      {/* Destination building at top */}
      {order && (phase === "to-restaurant" || phase === "at-restaurant" || phase === "to-customer") && (
        <div style={{
          position: "absolute", top: "6%", left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          animation: "fadeIn 0.5s ease",
          zIndex: 10,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: destColor + "22",
            border: `2px solid ${destColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26,
            boxShadow: `0 0 20px ${destColor}66`,
            animation: atRest ? "glow 1.5s ease-in-out infinite alternate" : "none",
          }}>{destEmoji}</div>
          <div style={{
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
            border: `1px solid ${destColor}44`,
            borderRadius: 8, padding: "4px 12px",
            color: "#fff", fontSize: 12, fontWeight: 600,
          }}>{destLabel}</div>
        </div>
      )}

      {/* Progress bar along road */}
      {(moving) && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)",
          width: "38%",
        }}>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, background: destColor, width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Start</span>
            <span style={{ color: destColor, fontSize: 10, fontWeight: 700 }}>{Math.round(progress)}%</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10 }}>Dest.</span>
          </div>
        </div>
      )}

      {/* Car */}
      <div style={{
        position: "absolute",
        bottom: atRest ? "68%" : (moving ? `${20 + progress * 0.52}%` : "22%"),
        left: "50%", transform: "translateX(-50%)",
        transition: "bottom 0.3s ease",
        zIndex: 20,
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.8))",
        animation: moving ? "carBounce 0.3s ease-in-out infinite alternate" : "none",
        fontSize: 36,
        lineHeight: 1,
      }}>🚗</div>

      {/* Headlight beams */}
      {moving && (
        <div style={{
          position: "absolute",
          bottom: `${20 + progress * 0.52 + 5}%`,
          left: "50%", transform: "translateX(-50%)",
          width: 60, height: 80,
          background: "linear-gradient(to top, rgba(255,240,150,0.15), transparent)",
          clipPath: "polygon(20% 100%, 80% 100%, 100% 0%, 0% 0%)",
          zIndex: 15,
        }} />
      )}

      {/* Status overlays */}
      {phase === "waiting" && <IdleRoadOverlay />}
      {phase === "offline" && <OfflineRoadOverlay />}
      {phase === "at-restaurant" && <AtRestaurantOverlay order={order!} />}
      {phase === "delivered" && <DeliveredOverlay />}
      {phase === "cancelled" && <CancelledOverlay />}
    </div>
  );
}

function Skyline() {
  const buildings = [
    { left: "2%", w: 28, h: 90 }, { left: "7%", w: 18, h: 60 }, { left: "12%", w: 22, h: 110 },
    { left: "17%", w: 16, h: 75 }, { left: "22%", w: 30, h: 130 }, { left: "29%", w: 14, h: 55 },
    { left: "55%", w: 30, h: 120 }, { left: "62%", w: 20, h: 85 }, { left: "68%", w: 16, h: 65 },
    { left: "73%", w: 26, h: 100 }, { left: "80%", w: 18, h: 70 }, { left: "86%", w: 32, h: 140 },
    { left: "92%", w: 14, h: 55 },
  ];
  return (
    <div style={{ position: "absolute", bottom: "28%", left: 0, right: 0, height: 160, overflow: "hidden" }}>
      {buildings.map((b, i) => (
        <div key={i} style={{
          position: "absolute", bottom: 0, left: b.left, width: b.w, height: b.h,
          background: `hsl(${220 + i * 5}, 15%, ${8 + (i % 3) * 3}%)`,
          borderTop: `1px solid rgba(255,255,255,0.04)`,
        }}>
          {Array.from({ length: Math.floor(b.h / 14) }).map((_, j) => (
            <div key={j} style={{
              position: "absolute", top: j * 14 + 3, left: 3, right: 3, height: 6,
              background: Math.random() > 0.6 ? "rgba(255,240,150,0.15)" : "transparent",
              display: "flex", gap: 2,
            }}>
              {Array.from({ length: Math.floor(b.w / 7) }).map((_, k) => (
                <div key={k} style={{ flex: 1, background: Math.random() > 0.5 ? "rgba(255,240,150,0.2)" : "transparent" }} />
              ))}
            </div>
          ))}
        </div>
      ))}
      {/* Street lights */}
      {["33%", "67%"].map((l, i) => (
        <div key={i} style={{ position: "absolute", bottom: 0, left: l, width: 3, height: 50, background: "#333" }}>
          <div style={{ position: "absolute", top: -6, left: -6, width: 14, height: 6, background: "#444", borderRadius: "3px 3px 0 0" }} />
          <div style={{ position: "absolute", top: -10, left: -4, width: 10, height: 4, background: "rgba(255,240,150,0.5)", borderRadius: 2, boxShadow: "0 0 12px rgba(255,240,150,0.6)" }} />
        </div>
      ))}
    </div>
  );
}

function RoadOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 30,
      animation: "fadeIn 0.3s ease",
    }}>{children}</div>
  );
}
function IdleRoadOverlay() {
  return (
    <RoadOverlay>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8, animation: "carBounce 1s ease-in-out infinite alternate" }}>🚗</div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Ready to roll</div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4 }}>Waiting for an order...</div>
      </div>
    </RoadOverlay>
  );
}
function OfflineRoadOverlay() {
  return (
    <RoadOverlay>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 15 }}>You're offline</div>
        <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 4 }}>Go online to start earning</div>
      </div>
    </RoadOverlay>
  );
}
function AtRestaurantOverlay({ order }: { order: Order }) {
  return (
    <RoadOverlay>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 8, animation: "glow 1s ease-in-out infinite alternate" }}>{order.restaurant.emoji}</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18 }}>Arrived!</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>Collect order from {order.restaurant.name}</div>
      </div>
    </RoadOverlay>
  );
}
function DeliveredOverlay() {
  return (
    <RoadOverlay>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18 }}>Delivered!</div>
      </div>
    </RoadOverlay>
  );
}
function CancelledOverlay() {
  return (
    <RoadOverlay>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 8 }}>🚫</div>
        <div style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 15 }}>Order Declined</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 4 }}>Finding next order...</div>
      </div>
    </RoadOverlay>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Game() {
  const phaseRef = useRef<Phase>("offline");
  const moveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);
  const totalStepsRef = useRef(100);

  const [phase, setPhase] = useState<Phase>("offline");
  const [order, setOrder] = useState<Order | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [rankedUp, setRankedUp] = useState<Rank | null>(null);
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    if (phase === "offline") {
      if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
    } else if (!sessionTimerRef.current) {
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    }
  }, [phase]);

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}` : `${m}:${String(sc).padStart(2,"0")}`;
  }

  function clearAll() {
    if (moveInterval.current) clearInterval(moveInterval.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    if (pingInterval.current) clearInterval(pingInterval.current);
    moveInterval.current = null; countdownInterval.current = null; pingInterval.current = null;
  }

  const spawnOrder = useCallback(() => {
    if (phaseRef.current !== "waiting") return;
    const o = generateOrder();
    setOrder(o);
    setCurrentTip(pick(TIPS));
    phaseRef.current = "incoming";
    setPhase("incoming");
    setCountdown(5);

    // Play new order ping immediately, then repeat every 1.2s during countdown
    playNewOrder();
    if (pingInterval.current) clearInterval(pingInterval.current);
    pingInterval.current = setInterval(() => playNewOrder(), 1200);

    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval.current!);
          countdownInterval.current = null;
          if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
          handleDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleDecline = useCallback(() => {
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
    playDecline();
    phaseRef.current = "cancelled"; setPhase("cancelled");
    setTimeout(() => {
      if (phaseRef.current !== "cancelled") return;
      phaseRef.current = "waiting"; setPhase("waiting");
      setTimeout(spawnOrder, rand(1500, 3500));
    }, 1800);
  }, [spawnOrder]);

  function startMoving(targetPhase: "to-restaurant" | "to-customer", steps: number) {
    progressRef.current = 0;
    totalStepsRef.current = steps;
    setProgress(0);
    if (moveInterval.current) clearInterval(moveInterval.current);
    moveInterval.current = setInterval(() => {
      progressRef.current = Math.min(100, progressRef.current + (100 / steps));
      setProgress(Math.min(100, progressRef.current));
      if (progressRef.current >= 100) {
        clearInterval(moveInterval.current!); moveInterval.current = null;
        if (targetPhase === "to-restaurant") {
          phaseRef.current = "at-restaurant"; setPhase("at-restaurant");
        } else {
          phaseRef.current = "delivered"; setPhase("delivered");
        }
      }
    }, 100);
  }

  const handleAccept = useCallback(() => {
    if (!order) return;
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    if (pingInterval.current) { clearInterval(pingInterval.current); pingInterval.current = null; }
    playAccept();
    phaseRef.current = "to-restaurant"; setPhase("to-restaurant");
    const steps = Math.floor(rand(40, 90));
    startMoving("to-restaurant", steps);
  }, [order]);

  const handlePickedUp = useCallback(() => {
    playTap();
    phaseRef.current = "to-customer"; setPhase("to-customer");
    const steps = Math.floor(rand(50, 100));
    startMoving("to-customer", steps);
  }, []);

  const handleDeliveryComplete = useCallback(() => {
    if (!order) return;
    const prevRank = getRank(tripCount);
    const newCount = tripCount + 1;
    const newRank = getRank(newCount);
    setTripCount(newCount);
    setTotalEarnings(e => parseFloat((e + order.total + currentTip).toFixed(2)));
    if (newRank.name !== prevRank.name) {
      setRankedUp(newRank);
      setTimeout(() => playRankUp(), 400);
    } else {
      playDelivered();
    }
  }, [order, tripCount, currentTip]);

  useEffect(() => {
    if (phase === "at-restaurant") playArrived();
    if (phase === "delivered") handleDeliveryComplete();
  }, [phase]);

  const handleNextOrder = useCallback(() => {
    setRankedUp(null);
    phaseRef.current = "waiting"; setPhase("waiting");
    setProgress(0);
    setTimeout(spawnOrder, rand(1200, 2800));
  }, [spawnOrder]);

  const goOnline = useCallback(() => {
    playTap();
    phaseRef.current = "waiting"; setPhase("waiting");
    setTimeout(spawnOrder, rand(1500, 3000));
  }, [spawnOrder]);

  const goOffline = useCallback(() => {
    clearAll();
    phaseRef.current = "offline"; setPhase("offline");
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
  }, []);

  const rank = getRank(tripCount);
  const nextRank = getNextRank(tripCount);
  const pct = rankPct(tripCount);
  const circumference = 2 * Math.PI * 18;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", background: "#111", overflow: "hidden" }}>

      {/* ── Top HUD (online only) ── */}
      {phase !== "offline" && (
        <div style={{
          flexShrink: 0, background: "rgba(0,0,0,0.9)", borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "10px 16px", display: "flex", gap: 10, alignItems: "center",
        }}>
          {/* Brand */}
          <div style={{ background: "#111", borderRadius: 7, padding: "5px 9px", display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 14 }}>🚗</span>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 11, letterSpacing: "0.5px" }}>UBER EATS</span>
          </div>

          {/* Rank badge */}
          <div style={{
            background: rank.gradient, borderRadius: 7, padding: "5px 10px",
            display: "flex", alignItems: "center", gap: 5,
            boxShadow: `0 0 12px ${rank.color}44`,
          }}>
            <span style={{ fontSize: 13 }}>{rank.icon}</span>
            <span style={{ color: "#fff", fontWeight: 800, fontSize: 11 }}>{rank.name}</span>
          </div>

          {/* Stats */}
          <div style={{ flex: 1, display: "flex", gap: 0, background: "rgba(255,255,255,0.04)", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
            <HudStat label="Earnings" value={fmt(totalEarnings)} highlight />
            <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
            <HudStat label="Trips" value={String(tripCount)} />
            <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
            <HudStat label="Online" value={fmtTime(sessionTime)} />
          </div>

          <button onClick={goOffline} style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7,
            padding: "6px 10px", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0,
          }}>Offline</button>
        </div>
      )}

      {/* ── Road View ── */}
      <RoadView phase={phase} order={order} progress={progress} />

      {/* ── Bottom Panel ── */}
      <div style={{ flexShrink: 0 }}>
        {phase === "offline" && <OfflinePanel earnings={fmt(totalEarnings)} trips={tripCount} rank={rank} nextRank={nextRank} pct={pct} onGoOnline={goOnline} />}
        {phase === "waiting" && <WaitingPanel onGoOffline={goOffline} />}
        {(phase === "incoming" || phase === "cancelled") && order && (
          <IncomingPanel order={order} countdown={countdown} circumference={circumference} cancelled={phase === "cancelled"} onAccept={handleAccept} onDecline={handleDecline} />
        )}
        {phase === "to-restaurant" && order && <NavPanel direction="to-restaurant" order={order} progress={progress} />}
        {phase === "at-restaurant" && order && <PickupPanel order={order} onPickedUp={handlePickedUp} />}
        {phase === "to-customer" && order && <NavPanel direction="to-customer" order={order} progress={progress} />}
        {phase === "delivered" && order && <DeliveredPanel order={order} tip={currentTip} rankedUp={rankedUp} onNext={handleNextOrder} />}
      </div>

      <style>{`
        @keyframes slideUp { from { transform:translateY(12px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes roadScroll { from { background-position-y:0 } to { background-position-y:56px } }
        @keyframes carBounce  { from { transform:translateX(-50%) translateY(0) } to { transform:translateX(-50%) translateY(-3px) } }
        @keyframes glow { from { box-shadow:0 0 10px currentColor } to { box-shadow:0 0 24px currentColor } }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes rankUp { 0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        .ubtn { transition:all 0.15s ease;cursor:pointer; }
        .ubtn:hover { filter:brightness(0.88); }
        .ubtn:active { transform:scale(0.96); }
      `}</style>
    </div>
  );
}

// ─── UI Components ────────────────────────────────────────────────────────────

function HudStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ flex: 1, padding: "6px 10px" }}>
      <div style={{ color: highlight ? "#06C167" : "#fff", fontWeight: 800, fontSize: 13 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: 1, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#1a1a1a", borderRadius: "18px 18px 0 0", boxShadow: "0 -6px 24px rgba(0,0,0,0.5)", animation: "slideUp 0.25s ease" }}>
      <div style={{ width: 32, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, margin: "10px auto 12px" }} />
      {children}
    </div>
  );
}

function OfflinePanel({ earnings, trips, rank, nextRank, pct, onGoOnline }: {
  earnings: string; trips: number; rank: Rank; nextRank: Rank | null; pct: number; onGoOnline: () => void;
}) {
  return (
    <Panel>
      <div style={{ padding: "0 16px 24px" }}>
        {/* Rank card */}
        <div style={{ background: "linear-gradient(135deg,#1e1e1e,#252525)", border: `1px solid ${rank.color}33`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: rank.gradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, boxShadow: `0 0 16px ${rank.color}55` }}>
              {rank.icon}
            </div>
            <div>
              <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" }}>Current Rank</div>
              <div style={{ color: rank.color, fontWeight: 800, fontSize: 20, marginTop: 2 }}>{rank.name}</div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>{earnings}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>{trips} trip{trips !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Perks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {rank.perks.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <span style={{ color: rank.color, fontSize: 11 }}>✓</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{p}</span>
              </div>
            ))}
          </div>

          {/* Progress to next */}
          {nextRank ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{nextRank.icon} Progress to {nextRank.name}</span>
                <span style={{ color: rank.color, fontSize: 11, fontWeight: 700 }}>{trips}/{nextRank.min} trips</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 4, background: rank.gradient, width: `${pct}%`, transition: "width 0.5s ease" }} />
              </div>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 11, marginTop: 5, textAlign: "center" }}>
                {nextRank.min - trips} more trip{nextRank.min - trips !== 1 ? "s" : ""} to reach {nextRank.name}
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", color: rank.color, fontWeight: 700, fontSize: 12, marginTop: 4 }}>
              ✨ Maximum rank achieved!
            </div>
          )}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <StatCard label="Acceptance" value="94%" />
          <StatCard label="Completion" value="100%" />
          <StatCard label="Rating" value="4.93 ⭐" />
        </div>

        <button className="ubtn" onClick={onGoOnline} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px",
        }}>Go Online</button>
      </div>
    </Panel>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#242424", borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function WaitingPanel({ onGoOffline }: { onGoOffline: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "0 16px 22px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: "50%", background: "#06C16718", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 18, height: 18, border: "3px solid #06C167", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 3 }}>Finding nearby orders...</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginBottom: 18 }}>Stay in the zone for more requests</div>
        <button className="ubtn" onClick={onGoOffline} style={{
          background: "#242424", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10,
          color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 13, padding: "11px 28px",
        }}>Go Offline</button>
      </div>
    </Panel>
  );
}

function IncomingPanel({ order, countdown, circumference, cancelled, onAccept, onDecline }: {
  order: Order; countdown: number; circumference: number; cancelled: boolean; onAccept: () => void; onDecline: () => void;
}) {
  const dashOffset = circumference - (countdown / 5) * circumference;
  if (cancelled) {
    return (
      <Panel>
        <div style={{ padding: "16px 16px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>🚫</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Order Declined</div>
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 3 }}>Looking for your next delivery...</div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      <div style={{ padding: "0 16px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>New Delivery Request</div>
            <div style={{ color: "#06C167", fontWeight: 800, fontSize: 26, marginTop: 2 }}>{fmt(order.total)}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 1 }}>{order.duration} · {order.distance}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ background: "#06C167", borderRadius: 6, padding: "2px 8px", color: "#fff", fontWeight: 700, fontSize: 10, marginBottom: 4, display: "inline-block" }}>EATS</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{order.customer.name} · {order.customer.rating} ⭐</div>
          </div>
        </div>

        {/* Restaurant row */}
        <div style={{ background: "#242424", borderRadius: 11, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: order.restaurant.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{order.restaurant.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{order.restaurant.name}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{order.restaurant.address}</div>
            </div>
            <div style={{ color: "#06C167", fontWeight: 700, fontSize: 12 }}>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
            {order.items.map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{item.name}</span>
                </div>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{fmt(item.price)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Addresses */}
        <div style={{ background: "#242424", borderRadius: 11, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px" }}>
            <span style={{ fontSize: 14 }}>{order.restaurant.emoji}</span>
            <div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" }}>Pickup</div>
              <div style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}>{order.restaurant.address}</div>
            </div>
          </div>
          <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 12px 0 36px" }} />
          <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px" }}>
            <span style={{ fontSize: 14 }}>🏠</span>
            <div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" }}>Dropoff</div>
              <div style={{ color: "#fff", fontSize: 12, fontWeight: 500 }}>{order.customer.address}</div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="ubtn" onClick={onAccept} style={{ flex: 1, background: "#06C167", border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px" }}>Accept</button>
          <button className="ubtn" onClick={onDecline} style={{ width: 52, height: 52, background: "#2a2a2a", border: "none", borderRadius: 11, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="52" height="52" viewBox="0 0 52 52" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
              <circle cx="26" cy="26" r="18" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
              <circle cx="26" cy="26" r="18" fill="none" stroke="#e53935" strokeWidth="3" strokeDasharray={circumference} strokeDashoffset={dashOffset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.9s linear" }} />
            </svg>
            <span style={{ position: "relative", zIndex: 1, color: "#e53935", fontWeight: 700, fontSize: 15 }}>✕</span>
          </button>
        </div>
      </div>
    </Panel>
  );
}

function NavPanel({ direction, order, progress }: { direction: "to-restaurant" | "to-customer"; order: Order; progress: number }) {
  const toRest = direction === "to-restaurant";
  const color = toRest ? "#06C167" : "#276EF1";
  return (
    <Panel>
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{toRest ? "Head to restaurant" : "Head to customer"}</span>
          <span style={{ marginLeft: "auto", color: color, fontWeight: 700, fontSize: 13 }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 4, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", borderRadius: 4, background: color, width: `${progress}%`, transition: "width 0.3s ease" }} />
        </div>
        <div style={{ background: "#242424", borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 18 }}>{toRest ? order.restaurant.emoji : "🏠"}</span>
          <div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, letterSpacing: "0.4px", textTransform: "uppercase" }}>{toRest ? "Pickup" : "Dropoff"}</div>
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 500 }}>{toRest ? order.restaurant.address : order.customer.address}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{fmt(order.total)}</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>{order.distance}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PickupPanel({ order, onPickedUp }: { order: Order; onPickedUp: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18, marginBottom: 2 }}>You've arrived!</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Collect order from {order.restaurant.name}</div>
        </div>
        <div style={{ background: "#242424", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < order.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{item.name}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{fmt(item.price)}</span>
            </div>
          ))}
        </div>
        <button className="ubtn" onClick={onPickedUp} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px" }}>
          Picked Up — Start Delivery
        </button>
      </div>
    </Panel>
  );
}

function DeliveredPanel({ order, tip, rankedUp, onNext }: { order: Order; tip: number; rankedUp: Rank | null; onNext: () => void }) {
  const total = (order.total + tip).toFixed(2);
  return (
    <Panel>
      <div style={{ padding: "0 16px 22px" }}>
        {rankedUp ? (
          <div style={{
            background: rankedUp.gradient, borderRadius: 12, padding: "14px", marginBottom: 14,
            textAlign: "center", animation: "rankUp 0.5s ease",
            boxShadow: `0 0 24px ${rankedUp.color}66`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>{rankedUp.icon}</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Rank Up! You're now {rankedUp.name}</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 4 }}>
              {rankedUp.perks[0]}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>✅</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Delivery Complete!</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 3 }}>Delivered to {order.customer.name}</div>
          </div>
        )}

        {/* Earnings breakdown */}
        <div style={{ background: "#242424", borderRadius: 12, padding: "12px 14px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Delivery fare</span>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{fmt(order.total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Tip</span>
            <span style={{ color: tip > 0 ? "#06C167" : "rgba(255,255,255,0.3)", fontWeight: 600, fontSize: 13 }}>{fmt(tip)}</span>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Total earned</span>
            <span style={{ color: "#06C167", fontWeight: 800, fontSize: 18 }}>£{total}</span>
          </div>
        </div>

        {/* Trip stats */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <StatCard label="Distance" value={order.distance} />
          <StatCard label="Duration" value={order.duration} />
          <StatCard label="Customer" value={`${order.customer.rating}⭐`} />
        </div>

        <button className="ubtn" onClick={onNext} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px" }}>
          Find Next Order
        </button>
      </div>
    </Panel>
  );
}
