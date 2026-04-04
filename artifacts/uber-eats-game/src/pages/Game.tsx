import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window { L: typeof import("leaflet"); }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = "offline" | "waiting" | "incoming" | "cancelled" | "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

interface MenuItem { name: string; price: number; }
interface Restaurant {
  name: string; emoji: string; color: string;
  lat: number; lng: number; address: string;
  menu: MenuItem[];
}
interface Customer { name: string; rating: number; lat: number; lng: number; address: string; }
interface Order {
  restaurant: Restaurant;
  customer: Customer;
  items: MenuItem[];
  total: number;
  distance: string;
  duration: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const RESTAURANTS: Restaurant[] = [
  { name: "McDonald's", emoji: "🍔", color: "#FF6000",
    lat: 52.9530, lng: -1.1481, address: "Market Square, Nottingham",
    menu: [{ name: "Big Mac Meal", price: 7.49 }, { name: "McFlurry", price: 2.19 }, { name: "Chicken McNuggets x6", price: 4.39 }, { name: "Quarter Pounder", price: 6.99 }, { name: "Fries (Large)", price: 2.89 }] },
  { name: "Burger King", emoji: "👑", color: "#D62300",
    lat: 52.9534, lng: -1.1502, address: "Upper Parliament St",
    menu: [{ name: "Whopper Meal", price: 8.29 }, { name: "Chicken Royale", price: 6.49 }, { name: "Onion Rings", price: 2.49 }, { name: "Bacon Double Cheese", price: 7.99 }, { name: "Vanilla Shake", price: 2.79 }] },
  { name: "KFC", emoji: "🍗", color: "#E4002B",
    lat: 52.9502, lng: -1.1478, address: "Clumber Street",
    menu: [{ name: "Zinger Burger Meal", price: 7.99 }, { name: "Bucket for One", price: 9.49 }, { name: "Popcorn Chicken", price: 3.99 }, { name: "Gravy", price: 1.29 }, { name: "Krushems", price: 2.99 }] },
  { name: "Pizza Hut", emoji: "🍕", color: "#EE3124",
    lat: 52.9547, lng: -1.1464, address: "Victoria Centre",
    menu: [{ name: "Pepperoni Passion (M)", price: 13.99 }, { name: "BBQ Chicken (M)", price: 13.49 }, { name: "Dough Balls x8", price: 4.99 }, { name: "Garlic Bread", price: 3.49 }, { name: "Cheesy Bites", price: 5.99 }] },
  { name: "Nando's", emoji: "🔥", color: "#FF6600",
    lat: 52.9513, lng: -1.1498, address: "Trinity Square",
    menu: [{ name: "1/2 Chicken (Hot)", price: 9.75 }, { name: "Peri Peri Wrap", price: 8.25 }, { name: "Peri Fries", price: 3.75 }, { name: "Mango Sorbet", price: 3.50 }, { name: "Halloumi Starter", price: 4.95 }] },
  { name: "Subway", emoji: "🥖", color: "#009743",
    lat: 52.9567, lng: -1.162, address: "Derby Road",
    menu: [{ name: "Foot-long Meatball", price: 7.49 }, { name: "6\" BMT", price: 5.99 }, { name: "Veggie Delite", price: 5.49 }, { name: "Cookies x3", price: 2.49 }, { name: "Footlong Chicken", price: 7.99 }] },
  { name: "Wagamama", emoji: "🍜", color: "#A00000",
    lat: 52.9528, lng: -1.149, address: "Cornerhouse",
    menu: [{ name: "Chicken Katsu Curry", price: 13.50 }, { name: "Ramen Noodle Bowl", price: 12.95 }, { name: "Gyoza x6", price: 6.50 }, { name: "Bang Bang Cauliflower", price: 8.50 }, { name: "Matcha Ice Cream", price: 4.50 }] },
  { name: "Greggs", emoji: "🥐", color: "#0066CC",
    lat: 52.9612, lng: -1.1392, address: "Mansfield Road",
    menu: [{ name: "Sausage Roll", price: 1.35 }, { name: "Steak Bake", price: 1.75 }, { name: "Chicken Bake", price: 1.75 }, { name: "Yum Yum", price: 0.99 }, { name: "Latte", price: 1.75 }] },
];

const CUSTOMERS: Customer[] = [
  { name: "James R.", rating: 4.92, lat: 52.949, lng: -1.162, address: "42 Castle Blvd, Nottingham" },
  { name: "Sophie M.", rating: 4.85, lat: 52.9445, lng: -1.148, address: "17 Lenton Ave, Nottingham" },
  { name: "Chris T.", rating: 4.97, lat: 52.9601, lng: -1.171, address: "8 Forest Rd West" },
  { name: "Priya K.", rating: 4.78, lat: 52.9461, lng: -1.139, address: "3 Meadows Way, NG2" },
  { name: "Daniel W.", rating: 4.88, lat: 52.9657, lng: -1.145, address: "55 Gregory Blvd" },
  { name: "Emma L.", rating: 4.95, lat: 52.9488, lng: -1.175, address: "22 Wollaton Rd" },
  { name: "Ravi S.", rating: 4.81, lat: 52.9623, lng: -1.158, address: "11 Alfreton Rd" },
  { name: "Lucy H.", rating: 4.90, lat: 52.9427, lng: -1.163, address: "7 Bunbury Ct, NG7" },
];

const DRIVER_START: [number, number] = [52.9541, -1.155];
const STEP = 0.0003;
const TIPS = ["£0.00", "£0.50", "£1.00", "£1.50", "£2.00"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function fmt(n: number) { return `£${n.toFixed(2)}`; }
function etaFromDist(deg: number) {
  const km = deg * 111;
  return `${Math.max(1, Math.round((km / 25) * 60))} min`;
}
function distLabel(deg: number) { return `${(deg * 111).toFixed(1)} km`; }
function dist(a: [number, number], b: [number, number]) {
  const d = [b[0] - a[0], b[1] - a[1]];
  return Math.sqrt(d[0] * d[0] + d[1] * d[1]);
}
function step(cur: [number, number], tgt: [number, number]): { pos: [number, number]; arrived: boolean } {
  const d = dist(cur, tgt);
  if (d <= STEP) return { pos: tgt, arrived: true };
  const r = STEP / d;
  return { pos: [cur[0] + (tgt[0] - cur[0]) * r, cur[1] + (tgt[1] - cur[1]) * r], arrived: false };
}

function generateOrder(): Order {
  const restaurant = pick(RESTAURANTS);
  const customer = pick(CUSTOMERS);
  const count = Math.floor(rand(1, 4));
  const shuffled = [...restaurant.menu].sort(() => Math.random() - 0.5);
  const items = shuffled.slice(0, count);
  const itemsTotal = items.reduce((s, i) => s + i.price, 0);
  const deliveryFee = parseFloat(rand(1.5, 3.5).toFixed(2));
  const total = parseFloat((itemsTotal * 0.35 + deliveryFee).toFixed(2));
  const d = dist([restaurant.lat, restaurant.lng], [customer.lat, customer.lng]);
  return {
    restaurant, customer, items, total,
    distance: distLabel(d + rand(0.005, 0.02)),
    duration: etaFromDist(d + rand(0.005, 0.02)),
  };
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

function pinIcon(L: typeof import("leaflet"), color: string, emoji: string) {
  return L.divIcon({
    html: `<div style="width:44px;height:52px;position:relative;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5))">
      <div style="width:44px;height:44px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};display:flex;align-items:center;justify-content:center;border:3px solid rgba(255,255,255,0.9)">
        <span style="transform:rotate(45deg);font-size:20px;line-height:1">${emoji}</span>
      </div></div>`,
    className: "", iconSize: [44, 52], iconAnchor: [22, 52],
  });
}
function carIcon(L: typeof import("leaflet")) {
  return L.divIcon({
    html: `<div style="width:40px;height:40px;background:#1a1a1a;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.6);font-size:20px">🚗</div>`,
    className: "", iconSize: [40, 40], iconAnchor: [20, 20],
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Game() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<ReturnType<typeof window.L.map> | null>(null);
  const driverMarker = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const restMarker = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const custMarker = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const routeLine = useRef<ReturnType<typeof window.L.polyline> | null>(null);
  const driverPos = useRef<[number, number]>(DRIVER_START);
  const phaseRef = useRef<Phase>("offline");
  const moveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("offline");
  const [order, setOrder] = useState<Order | null>(null);
  const [eta, setEta] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [tripCount, setTripCount] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [tip] = useState(() => pick(TIPS));

  // Init map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: false, attributionControl: true })
      .setView(DRIVER_START, 14);
    mapInstance.current = map;
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: "abcd", maxZoom: 20,
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    const dm = L.marker(DRIVER_START, { icon: carIcon(L) }).addTo(map);
    driverMarker.current = dm;
    const rl = L.polyline([], { color: "#06C167", weight: 4, opacity: 0.7, dashArray: "8 6" }).addTo(map);
    routeLine.current = rl;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  // Session timer
  useEffect(() => {
    if (phase === "offline") {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    } else if (phase === "waiting" && !sessionTimerRef.current) {
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    }
  }, [phase]);

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  }

  const goOnline = useCallback(() => {
    phaseRef.current = "waiting";
    setPhase("waiting");
    setTimeout(spawnOrder, rand(1500, 3000));
  }, []);

  const goOffline = useCallback(() => {
    clearAll();
    phaseRef.current = "offline";
    setPhase("offline");
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
  }, []);

  function clearAll() {
    if (moveInterval.current) clearInterval(moveInterval.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    moveInterval.current = null; countdownInterval.current = null;
  }

  const spawnOrder = useCallback(() => {
    if (phaseRef.current !== "waiting") return;
    const o = generateOrder();
    setOrder(o);
    phaseRef.current = "incoming";
    setPhase("incoming");
    setCountdown(5);

    const L = window.L;
    if (restMarker.current) { restMarker.current.remove(); restMarker.current = null; }
    if (custMarker.current) { custMarker.current.remove(); custMarker.current = null; }
    if (mapInstance.current) {
      restMarker.current = L.marker([o.restaurant.lat, o.restaurant.lng], {
        icon: pinIcon(L, o.restaurant.color, o.restaurant.emoji),
      }).addTo(mapInstance.current).bindPopup(`<b>${o.restaurant.name}</b>`);
      custMarker.current = L.marker([o.customer.lat, o.customer.lng], {
        icon: pinIcon(L, "#276EF1", "🏠"),
      }).addTo(mapInstance.current).bindPopup(`<b>${o.customer.name}</b>`);
    }

    if (countdownInterval.current) clearInterval(countdownInterval.current);
    countdownInterval.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval.current!);
          countdownInterval.current = null;
          handleDecline();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleDecline = useCallback(() => {
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    phaseRef.current = "cancelled";
    setPhase("cancelled");
    setTimeout(() => {
      if (phaseRef.current !== "cancelled") return;
      phaseRef.current = "waiting";
      setPhase("waiting");
      setTimeout(spawnOrder, rand(2000, 4000));
    }, 1500);
  }, [spawnOrder]);

  const handleAccept = useCallback(() => {
    if (!order) return;
    if (countdownInterval.current) { clearInterval(countdownInterval.current); countdownInterval.current = null; }
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    const tgt: [number, number] = [order.restaurant.lat, order.restaurant.lng];
    setEta(etaFromDist(dist(driverPos.current, tgt)));
    if (routeLine.current) {
      routeLine.current.setLatLngs([driverPos.current, tgt]);
      routeLine.current.setStyle({ color: "#06C167" });
    }
    if (moveInterval.current) clearInterval(moveInterval.current);
    moveInterval.current = setInterval(() => tickMove("to-restaurant"), 100);
  }, [order]);

  function tickMove(direction: "to-restaurant" | "to-customer") {
    if (!order || !driverMarker.current) return;
    const tgt: [number, number] = direction === "to-restaurant"
      ? [order.restaurant.lat, order.restaurant.lng]
      : [order.customer.lat, order.customer.lng];
    const { pos, arrived } = step(driverPos.current, tgt);
    driverPos.current = pos;
    driverMarker.current.setLatLng(pos);
    setEta(etaFromDist(dist(pos, tgt)));
    if (routeLine.current) routeLine.current.setLatLngs([pos, tgt]);
    if (mapInstance.current) mapInstance.current.panTo(pos, { animate: true, duration: 0.1 });
    if (arrived) {
      clearInterval(moveInterval.current!); moveInterval.current = null;
      if (direction === "to-restaurant") {
        phaseRef.current = "at-restaurant"; setPhase("at-restaurant"); setEta("");
      } else {
        phaseRef.current = "delivered"; setPhase("delivered"); setEta("");
        if (routeLine.current) routeLine.current.setLatLngs([]);
        setTripCount(t => t + 1);
        setTotalEarnings(e => parseFloat((e + (order?.total ?? 0)).toFixed(2)));
      }
    }
  }

  const handlePickedUp = useCallback(() => {
    if (!order) return;
    phaseRef.current = "to-customer"; setPhase("to-customer");
    const tgt: [number, number] = [order.customer.lat, order.customer.lng];
    setEta(etaFromDist(dist(driverPos.current, tgt)));
    if (routeLine.current) {
      routeLine.current.setLatLngs([driverPos.current, tgt]);
      routeLine.current.setStyle({ color: "#276EF1" });
    }
    if (moveInterval.current) clearInterval(moveInterval.current);
    moveInterval.current = setInterval(() => tickMove("to-customer"), 100);
  }, [order]);

  const handleNextOrder = useCallback(() => {
    if (restMarker.current) { restMarker.current.remove(); restMarker.current = null; }
    if (custMarker.current) { custMarker.current.remove(); custMarker.current = null; }
    phaseRef.current = "waiting"; setPhase("waiting");
    setTimeout(spawnOrder, rand(1500, 3000));
  }, [spawnOrder]);

  const isOffline = phase === "offline";
  const circumference = 2 * Math.PI * 18;

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%", fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden" }}>

      {/* ── Map ── */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0, filter: isOffline ? "brightness(0.4)" : "none", transition: "filter 0.5s ease" }} />

      {/* ── Top HUD ── */}
      {!isOffline && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 1000,
          background: "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)",
          padding: "14px 18px 36px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Brand */}
            <div style={{ background: "#000", borderRadius: 8, padding: "5px 10px", display: "flex", alignItems: "center", gap: 7 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z" /></svg>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, letterSpacing: "0.5px" }}>UBER EATS</span>
            </div>

            {/* Earnings bar */}
            <div style={{ flex: 1, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "7px 14px", display: "flex", gap: 18, alignItems: "center" }}>
              <HudStat label="Earnings" value={fmt(totalEarnings)} highlight />
              <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />
              <HudStat label="Trips" value={String(tripCount)} />
              <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }} />
              <HudStat label="Online" value={fmtTime(sessionTime)} />
            </div>

            {/* Offline button */}
            <button onClick={goOffline} style={{
              background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
              padding: "7px 12px", color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Go Offline</button>
          </div>
        </div>
      )}

      {/* ── ETA Badge ── */}
      {eta && (phase === "to-restaurant" || phase === "to-customer") && (
        <div style={{
          position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)",
          background: "#000", borderRadius: 20, padding: "7px 18px",
          color: "#fff", fontWeight: 700, fontSize: 15,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 1000,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill={phase === "to-restaurant" ? "#06C167" : "#276EF1"}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
          </svg>
          {eta} away
        </div>
      )}

      {/* ── Bottom Panel ── */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 1000 }}>
        {isOffline && <OfflinePanel earnings={fmt(totalEarnings)} trips={tripCount} onGoOnline={goOnline} />}
        {phase === "waiting" && <WaitingPanel onGoOffline={goOffline} />}
        {(phase === "incoming" || phase === "cancelled") && order && (
          <IncomingPanel
            order={order} countdown={countdown} circumference={circumference}
            cancelled={phase === "cancelled"} onAccept={handleAccept} onDecline={handleDecline}
          />
        )}
        {phase === "to-restaurant" && order && <NavPanel phase="to-restaurant" order={order} eta={eta} />}
        {phase === "at-restaurant" && order && <PickupPanel order={order} onPickedUp={handlePickedUp} />}
        {phase === "to-customer" && order && <NavPanel phase="to-customer" order={order} eta={eta} />}
        {phase === "delivered" && order && (
          <DeliveredPanel order={order} tip={tip} onNext={handleNextOrder} />
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.35; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ubtn { transition: all 0.15s ease; cursor: pointer; }
        .ubtn:hover { filter: brightness(0.88); }
        .ubtn:active { transform: scale(0.96); }
        .leaflet-control-attribution { font-size: 9px !important; }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HudStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div style={{ color: highlight ? "#06C167" : "#fff", fontWeight: 800, fontSize: 14 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 1 }}>{label}</div>
    </div>
  );
}

function Panel({ children, anim = true }: { children: React.ReactNode; anim?: boolean }) {
  return (
    <div style={{
      background: "#1a1a1a", borderRadius: "20px 20px 0 0", padding: "8px 0 0",
      boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
      animation: anim ? "slideUp 0.3s ease" : "none",
    }}>
      <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, margin: "0 auto 14px" }} />
      {children}
    </div>
  );
}

function AddressRow({ icon, label, address, color }: { icon: string; label: string; address: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 20px" }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: color + "22", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
      </div>
      <div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</div>
        <div style={{ color: "#fff", fontSize: 13, fontWeight: 500, marginTop: 1 }}>{address}</div>
      </div>
    </div>
  );
}

function OfflinePanel({ earnings, trips, onGoOnline }: { earnings: string; trips: number; onGoOnline: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "6px 20px 28px" }}>
        <div style={{ textAlign: "center", marginBottom: 22 }}>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 6 }}>You're Offline</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 32 }}>{earnings}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 4 }}>Today · {trips} trip{trips !== 1 ? "s" : ""} completed</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <StatCard label="Acceptance" value="94%" />
          <StatCard label="Completion" value="100%" />
          <StatCard label="Rating" value="4.93" />
        </div>

        <button className="ubtn" onClick={onGoOnline} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 14,
          color: "#fff", fontWeight: 800, fontSize: 17, padding: "17px",
        }}>Go Online</button>
      </div>
    </Panel>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#242424", borderRadius: 10, padding: "12px 0", textAlign: "center" }}>
      <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function WaitingPanel({ onGoOffline }: { onGoOffline: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "6px 20px 26px", textAlign: "center" }}>
        <div style={{ display: "inline-flex", width: 48, height: 48, borderRadius: "50%", background: "#06C16722", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 20, height: 20, border: "3px solid #06C167", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Finding nearby orders...</div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 20 }}>Stay in the zone to receive requests</div>
        <button className="ubtn" onClick={onGoOffline} style={{
          background: "#2a2a2a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
          color: "rgba(255,255,255,0.6)", fontWeight: 600, fontSize: 14, padding: "13px 32px",
        }}>Go Offline</button>
      </div>
    </Panel>
  );
}

function IncomingPanel({ order, countdown, circumference, cancelled, onAccept, onDecline }: {
  order: Order; countdown: number; circumference: number; cancelled: boolean;
  onAccept: () => void; onDecline: () => void;
}) {
  const dashOffset = circumference - (countdown / 5) * circumference;
  if (cancelled) {
    return (
      <Panel>
        <div style={{ padding: "22px 20px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🚫</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>Order Declined</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 4 }}>Looking for your next delivery...</div>
        </div>
      </Panel>
    );
  }
  return (
    <Panel>
      {/* Header */}
      <div style={{ padding: "0 20px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>New Delivery Request</div>
          <div style={{ color: "#06C167", fontWeight: 800, fontSize: 28, marginTop: 2 }}>{fmt(order.total)}</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>{order.duration} · {order.distance}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ background: "#06C167", borderRadius: 7, padding: "3px 9px", color: "#fff", fontWeight: 700, fontSize: 11, marginBottom: 5 }}>EATS</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{order.customer.name} · {order.customer.rating} ⭐</div>
        </div>
      </div>

      {/* Restaurant card */}
      <div style={{ background: "#242424", borderRadius: 12, margin: "0 20px 10px", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 9, background: order.restaurant.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{order.restaurant.emoji}</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{order.restaurant.name}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginTop: 2 }}>{order.restaurant.address}</div>
          </div>
          <div style={{ marginLeft: "auto", color: "#06C167", fontWeight: 700, fontSize: 13 }}>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.25)" }} />
                <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{item.name}</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{fmt(item.price)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Addresses */}
      <div style={{ margin: "0 20px", background: "#242424", borderRadius: 12, overflow: "hidden" }}>
        <AddressRow icon={order.restaurant.emoji} label="Pickup" address={order.restaurant.address} color={order.restaurant.color} />
        <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 16px 0 58px" }} />
        <AddressRow icon="🏠" label="Dropoff" address={order.customer.address} color="#276EF1" />
      </div>

      {/* Buttons */}
      <div style={{ padding: "14px 20px 26px", display: "flex", gap: 10, alignItems: "center" }}>
        <button className="ubtn" onClick={onAccept} style={{
          flex: 1, background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px",
        }}>Accept</button>

        <button className="ubtn" onClick={onDecline} style={{
          width: 54, height: 54, background: "#2a2a2a", border: "none", borderRadius: 12,
          position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <svg width="54" height="54" viewBox="0 0 54 54" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx="27" cy="27" r="18" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3" />
            <circle cx="27" cy="27" r="18" fill="none" stroke="#e53935" strokeWidth="3"
              strokeDasharray={circumference} strokeDashoffset={dashOffset}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.9s linear" }} />
          </svg>
          <span style={{ position: "relative", zIndex: 1, color: "#e53935", fontWeight: 700, fontSize: 16 }}>✕</span>
        </button>
      </div>
    </Panel>
  );
}

function NavPanel({ phase, order, eta }: { phase: "to-restaurant" | "to-customer"; order: Order; eta: string }) {
  const toRest = phase === "to-restaurant";
  const color = toRest ? "#06C167" : "#276EF1";
  const label = toRest ? "Head to restaurant" : "Head to customer";
  const address = toRest ? order.restaurant.address : order.customer.address;
  const icon = toRest ? order.restaurant.emoji : "🏠";
  return (
    <Panel>
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>{label}</span>
          {eta && <span style={{ marginLeft: "auto", color: color, fontWeight: 700, fontSize: 14 }}>{eta}</span>}
        </div>
        <div style={{ background: "#242424", borderRadius: 12, overflow: "hidden" }}>
          <AddressRow icon={icon} label={toRest ? "Pickup" : "Dropoff"} address={address} color={color} />
        </div>
        {toRest && (
          <div style={{ background: "#242424", borderRadius: 12, padding: "11px 14px", marginTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Order for</span>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{order.customer.name} · {fmt(order.total)}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

function PickupPanel({ order, onPickedUp }: { order: Order; onPickedUp: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20, marginBottom: 3 }}>You've arrived!</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Collect the order from {order.restaurant.name}</div>
        </div>
        <div style={{ background: "#242424", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: i < order.items.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{item.name}</span>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{fmt(item.price)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#242424", borderRadius: 12, padding: "11px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>📦</span>
          <div><div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>Scan QR at counter</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Show barcode to staff to collect order</div>
          </div>
        </div>
        <button className="ubtn" onClick={onPickedUp} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px",
        }}>Picked Up — Start Delivery</button>
      </div>
    </Panel>
  );
}

function DeliveredPanel({ order, tip, onNext }: { order: Order; tip: string; onNext: () => void }) {
  const tipVal = parseFloat(tip.replace("£", ""));
  const total = (order.total + tipVal).toFixed(2);
  return (
    <Panel>
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ textAlign: "center", paddingBottom: 18, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, marginBottom: 3 }}>Delivery Complete!</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13 }}>Delivered to {order.customer.name}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", padding: "18px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <EStat label="Fare" value={fmt(order.total)} />
          <EStat label="Tip" value={tip} highlight={tipVal > 0} />
          <EStat label="Total" value={`£${total}`} big />
        </div>
        <div style={{ display: "flex", gap: 8, padding: "14px 0 0" }}>
          <div style={{ flex: 1, background: "#242424", borderRadius: 10, padding: "10px", textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{order.distance}</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>Distance</div>
          </div>
          <div style={{ flex: 1, background: "#242424", borderRadius: 10, padding: "10px", textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{order.duration}</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>Duration</div>
          </div>
          <div style={{ flex: 1, background: "#242424", borderRadius: 10, padding: "10px", textAlign: "center" }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{order.customer.rating} ⭐</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>Customer</div>
          </div>
        </div>
        <button className="ubtn" onClick={onNext} style={{
          width: "100%", marginTop: 14, background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 700, fontSize: 16, padding: "15px",
        }}>Find Next Order</button>
      </div>
    </Panel>
  );
}

function EStat({ label, value, highlight, big }: { label: string; value: string; highlight?: boolean; big?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: highlight ? "#06C167" : big ? "#fff" : "rgba(255,255,255,0.8)", fontWeight: 800, fontSize: big ? 22 : 18 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 3 }}>{label}</div>
    </div>
  );
}
