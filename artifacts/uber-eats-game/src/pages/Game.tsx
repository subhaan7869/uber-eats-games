import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    L: typeof import("leaflet");
  }
}

type GamePhase = "idle" | "cancelled" | "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

const NOTTINGHAM: [number, number] = [52.9541, -1.155];
const RESTAURANT: [number, number] = [52.958, -1.15];
const CUSTOMER: [number, number] = [52.949, -1.162];
const DRIVER_START: [number, number] = [52.953, -1.148];
const STEP_SIZE = 0.0003;

function distanceBetween(a: [number, number], b: [number, number]) {
  const dlat = b[0] - a[0];
  const dlng = b[1] - a[1];
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

function moveToward(
  current: [number, number],
  target: [number, number],
  step: number
): { pos: [number, number]; arrived: boolean } {
  const d = distanceBetween(current, target);
  if (d <= step) return { pos: target, arrived: true };
  const dlat = target[0] - current[0];
  const dlng = target[1] - current[1];
  return {
    pos: [current[0] + (dlat / d) * step, current[1] + (dlng / d) * step],
    arrived: false,
  };
}

function makePinIcon(L: typeof import("leaflet"), color: string, emoji: string) {
  return L.divIcon({
    html: `
      <div style="
        width:44px;height:52px;position:relative;
        filter:drop-shadow(0 3px 8px rgba(0,0,0,0.5));
      ">
        <div style="
          width:44px;height:44px;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);background:${color};
          display:flex;align-items:center;justify-content:center;
          border:3px solid rgba(255,255,255,0.9);
        ">
          <span style="transform:rotate(45deg);font-size:20px;line-height:1">${emoji}</span>
        </div>
      </div>`,
    className: "",
    iconSize: [44, 52],
    iconAnchor: [22, 52],
  });
}

function makeCarIcon(L: typeof import("leaflet")) {
  return L.divIcon({
    html: `
      <div style="
        width:40px;height:40px;
        background:#1a1a1a;
        border-radius:50%;
        border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 4px 12px rgba(0,0,0,0.6);
        font-size:20px;
      ">🚗</div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function etaText(distDeg: number): string {
  const km = distDeg * 111;
  const mins = Math.max(1, Math.round((km / 30) * 60));
  return `${mins} min`;
}

export default function Game() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ReturnType<typeof window.L.map> | null>(null);
  const driverMarkerRef = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const restaurantMarkerRef = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const customerMarkerRef = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const routeLineRef = useRef<ReturnType<typeof window.L.polyline> | null>(null);
  const driverPosRef = useRef<[number, number]>(DRIVER_START);
  const phaseRef = useRef<GamePhase>("idle");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [phase, setPhase] = useState<GamePhase>("idle");
  const [eta, setEta] = useState("");
  const [earnings] = useState("£8.45");
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (phase !== "idle") return;
    setCountdown(5);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          handleCancel();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [phase]);

  function handleCancel() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPhase("cancelled" as GamePhase);
    setTimeout(() => {
      setPhase("idle");
      setCountdown(5);
    }, 1500);
  }

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    const L = window.L;

    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView(NOTTINGHAM, 14);

    mapInstanceRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }
    ).addTo(map);

    L.control.zoom({ position: "topright" }).addTo(map);

    const restaurantMarker = L.marker(RESTAURANT, {
      icon: makePinIcon(L, "#06C167", "🍔"),
    }).addTo(map).bindPopup("<b>McDonald's Nottingham</b><br>Market Square");
    restaurantMarkerRef.current = restaurantMarker;

    const customerMarker = L.marker(CUSTOMER, {
      icon: makePinIcon(L, "#276EF1", "🏠"),
    }).addTo(map).bindPopup("<b>James R.</b><br>42 Castle Boulevard");
    customerMarkerRef.current = customerMarker;

    const driverMarker = L.marker(DRIVER_START, {
      icon: makeCarIcon(L),
    }).addTo(map);
    driverMarkerRef.current = driverMarker;

    const routeLine = L.polyline([DRIVER_START, RESTAURANT], {
      color: "#06C167",
      weight: 4,
      opacity: 0.7,
      dashArray: "8 6",
    }).addTo(map);
    routeLineRef.current = routeLine;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  function startDelivery() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    driverPosRef.current = DRIVER_START;
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    if (driverMarkerRef.current) driverMarkerRef.current.setLatLng(DRIVER_START);
    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs([DRIVER_START, RESTAURANT]);
      routeLineRef.current.setStyle({ color: "#06C167" });
    }
    const dist = distanceBetween(DRIVER_START, RESTAURANT);
    setEta(etaText(dist));

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 100);
  }

  function tick() {
    if (!driverMarkerRef.current) return;
    const currentPhase = phaseRef.current;
    if (currentPhase !== "to-restaurant" && currentPhase !== "to-customer") return;

    const target = currentPhase === "to-restaurant" ? RESTAURANT : CUSTOMER;
    const { pos, arrived } = moveToward(driverPosRef.current, target, STEP_SIZE);
    driverPosRef.current = pos;
    driverMarkerRef.current.setLatLng(pos);

    const dist = distanceBetween(pos, target);
    setEta(etaText(dist));

    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs([pos, target]);
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.panTo(pos, { animate: true, duration: 0.1 });
    }

    if (arrived) {
      if (currentPhase === "to-restaurant") {
        phaseRef.current = "at-restaurant";
        setPhase("at-restaurant");
        setEta("");
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        phaseRef.current = "delivered";
        setPhase("delivered");
        setEta("");
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (routeLineRef.current) {
          routeLineRef.current.setLatLngs([pos, pos]);
        }
      }
    }
  }

  function confirmPickup() {
    phaseRef.current = "to-customer";
    setPhase("to-customer");
    const dist = distanceBetween(driverPosRef.current, CUSTOMER);
    setEta(etaText(dist));
    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs([driverPosRef.current, CUSTOMER]);
      routeLineRef.current.setStyle({ color: "#276EF1" });
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(tick, 100);
  }

  function restart() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    driverPosRef.current = DRIVER_START;
    phaseRef.current = "idle";
    setPhase("idle");
    setEta("");
    if (driverMarkerRef.current) driverMarkerRef.current.setLatLng(DRIVER_START);
    if (routeLineRef.current) {
      routeLineRef.current.setLatLngs([DRIVER_START, RESTAURANT]);
      routeLineRef.current.setStyle({ color: "#06C167" });
    }
    if (mapInstanceRef.current) mapInstanceRef.current.setView(NOTTINGHAM, 14);
  }

  return (
    <div style={{ position: "relative", height: "100vh", width: "100%", fontFamily: "'Inter', -apple-system, sans-serif", overflow: "hidden" }}>
      {/* Map */}
      <div ref={mapRef} style={{ position: "absolute", inset: 0 }} />

      {/* Top Bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)",
        padding: "16px 20px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        zIndex: 1000,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: "#000", borderRadius: 8, padding: "6px 12px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z"/>
            </svg>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, letterSpacing: "0.5px" }}>UBER EATS</span>
          </div>
        </div>
        {phase !== "idle" && (
          <button onClick={restart} style={{
            background: "rgba(255,255,255,0.15)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 20, padding: "6px 16px",
            color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            New Trip
          </button>
        )}
      </div>

      {/* ETA floating badge */}
      {eta && (phase === "to-restaurant" || phase === "to-customer") && (
        <div style={{
          position: "absolute", top: 70, left: "50%", transform: "translateX(-50%)",
          background: "#000", borderRadius: 20, padding: "8px 20px",
          color: "#fff", fontWeight: 700, fontSize: 16,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          zIndex: 1000, display: "flex", alignItems: "center", gap: 8,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#06C167">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
          </svg>
          {eta} away
        </div>
      )}

      {/* Bottom Panel */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        zIndex: 1000,
      }}>
        {(phase === "idle" || phase === "cancelled") && <IdlePanel onStart={startDelivery} onCancel={handleCancel} earnings={earnings} countdown={countdown} cancelled={phase === "cancelled"} />}
        {phase === "to-restaurant" && <HeadingToRestaurantPanel eta={eta} />}
        {phase === "at-restaurant" && <AtRestaurantPanel onPickup={confirmPickup} />}
        {phase === "to-customer" && <HeadingToCustomerPanel eta={eta} />}
        {phase === "delivered" && <DeliveredPanel onRestart={restart} earnings={earnings} />}
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .uber-btn {
          transition: all 0.15s ease;
        }
        .uber-btn:hover {
          filter: brightness(0.9);
        }
        .uber-btn:active {
          transform: scale(0.97);
        }
        .leaflet-control-attribution {
          font-size: 9px !important;
        }
      `}</style>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "#1a1a1a",
      borderRadius: "20px 20px 0 0",
      padding: "8px 0 0",
      boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
      animation: "slideUp 0.3s ease",
    }}>
      <div style={{
        width: 36, height: 4, background: "rgba(255,255,255,0.15)",
        borderRadius: 2, margin: "0 auto 16px",
      }} />
      {children}
    </div>
  );
}

function OrderCard() {
  return (
    <div style={{
      background: "#242424", borderRadius: 12, margin: "0 20px 12px",
      padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10,
          background: "#FF6000", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
        }}>🍔</div>
        <div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>McDonald's</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 2 }}>Market Square, Nottingham</div>
        </div>
        <div style={{ marginLeft: "auto", color: "#06C167", fontWeight: 700, fontSize: 15 }}>2 items</div>
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        <OrderItem name="Big Mac Meal" />
        <OrderItem name="McFlurry" />
      </div>
    </div>
  );
}

function OrderItem({ name }: { name: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.3)", flexShrink: 0 }} />
      <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{name}</span>
    </div>
  );
}

function AddressRow({ icon, label, address, color }: { icon: string; label: string; address: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "10px 20px" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        background: color + "22",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, marginTop: 2,
      }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
      </div>
      <div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>{label}</div>
        <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginTop: 2 }}>{address}</div>
      </div>
    </div>
  );
}

function IdlePanel({ onStart, onCancel, earnings, countdown, cancelled }: {
  onStart: () => void;
  onCancel: () => void;
  earnings: string;
  countdown: number;
  cancelled: boolean;
}) {
  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference - (countdown / 5) * circumference;

  if (cancelled) {
    return (
      <Panel>
        <div style={{ padding: "24px 20px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 36 }}>🚫</div>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Order Declined</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Looking for the next delivery...</div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div style={{ padding: "0 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>New Order</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 26, marginTop: 4 }}>{earnings}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>Est. 18 min · 2.4 km</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            background: "#06C167", borderRadius: 8, padding: "4px 10px",
            color: "#fff", fontWeight: 700, fontSize: 12, marginBottom: 6,
          }}>EATS</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>James R. • 4.9 ⭐</div>
        </div>
      </div>

      <OrderCard />

      <div style={{ margin: "0 20px", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 4 }}>
        <AddressRow icon="🍔" label="Pickup" address="McDonald's, Market Square" color="#06C167" />
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 20px 0 66px" }} />
        <AddressRow icon="🏠" label="Dropoff" address="42 Castle Blvd, Nottingham" color="#276EF1" />
      </div>

      <div style={{ padding: "16px 20px 28px", display: "flex", gap: 12, alignItems: "center" }}>
        <button className="uber-btn" onClick={onStart} style={{
          flex: 1, background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 700, fontSize: 16, padding: "16px",
          cursor: "pointer",
        }}>
          Accept Delivery
        </button>

        <button
          className="uber-btn"
          onClick={onCancel}
          style={{
            width: 56, height: 56, background: "#2a2a2a", border: "none", borderRadius: 12,
            color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 18,
            cursor: "pointer", position: "relative", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
            <circle cx="28" cy="28" r="18" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="28" cy="28" r="18" fill="none"
              stroke="#e53935" strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.9s linear" }}
            />
          </svg>
          <span style={{ position: "relative", zIndex: 1, fontSize: 16, color: "#e53935", fontWeight: 700 }}>✕</span>
        </button>
      </div>
    </Panel>
  );
}

function HeadingToRestaurantPanel({ eta }: { eta: string }) {
  return (
    <Panel>
      <div style={{ padding: "0 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#06C167",
            animation: "pulse 1.2s ease-in-out infinite",
          }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Head to restaurant</span>
          {eta && <span style={{ marginLeft: "auto", color: "#06C167", fontWeight: 700, fontSize: 15 }}>{eta}</span>}
        </div>
      </div>

      <div style={{ margin: "0 20px", background: "#242424", borderRadius: 12, overflow: "hidden" }}>
        <AddressRow icon="🍔" label="Pickup" address="McDonald's, Market Square" color="#06C167" />
      </div>

      <div style={{ padding: "14px 20px 28px" }}>
        <div style={{ background: "#242424", borderRadius: 12, padding: "12px 16px", display: "flex", justifyContent: "space-between" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>Order for</div>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>James R. · 2 items · £8.45</div>
        </div>
      </div>
    </Panel>
  );
}

function AtRestaurantPanel({ onPickup }: { onPickup: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "0 20px 10px" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#06C167", fontWeight: 800, fontSize: 22, marginBottom: 4 }}>You've arrived!</div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 14 }}>Go inside and collect the order</div>
        </div>
      </div>

      <OrderCard />

      <div style={{ padding: "8px 20px", background: "#242424", margin: "0 20px 16px", borderRadius: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}>
          <span style={{ fontSize: 20 }}>📦</span>
          <div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>Scan QR at counter</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>Show barcode to staff to collect order</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="rgba(255,255,255,0.3)">
              <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
            </svg>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 20px 28px" }}>
        <button className="uber-btn" onClick={onPickup} style={{
          width: "100%", background: "#06C167", border: "none", borderRadius: 12,
          color: "#fff", fontWeight: 700, fontSize: 16, padding: "16px",
          cursor: "pointer",
        }}>
          Picked Up — Start Delivery
        </button>
      </div>
    </Panel>
  );
}

function HeadingToCustomerPanel({ eta }: { eta: string }) {
  return (
    <Panel>
      <div style={{ padding: "0 20px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#276EF1",
            animation: "pulse 1.2s ease-in-out infinite",
          }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Head to customer</span>
          {eta && <span style={{ marginLeft: "auto", color: "#276EF1", fontWeight: 700, fontSize: 15 }}>{eta}</span>}
        </div>
      </div>

      <div style={{ margin: "0 20px", background: "#242424", borderRadius: 12, overflow: "hidden" }}>
        <AddressRow icon="🏠" label="Dropoff" address="42 Castle Blvd, Nottingham" color="#276EF1" />
      </div>

      <div style={{ padding: "14px 20px 28px" }}>
        <div style={{ background: "#242424", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "#276EF1", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, flexShrink: 0,
          }}>👤</div>
          <div>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>James Richardson</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 2 }}>4.92 ⭐ · 347 orders</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
            <button style={{ background: "#333", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>💬</button>
            <button style={{ background: "#333", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16 }}>📞</button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function DeliveredPanel({ onRestart, earnings }: { onRestart: () => void; earnings: string }) {
  return (
    <Panel>
      <div style={{ padding: "0 20px 24px" }}>
        <div style={{ textAlign: "center", paddingBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>✅</div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, marginBottom: 4 }}>Delivery Complete!</div>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Great work! Order delivered to James R.</div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-around", padding: "20px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <EarningStat label="Earned" value={earnings} highlight />
          <EarningStat label="Distance" value="2.4 km" />
          <EarningStat label="Duration" value="18 min" />
        </div>

        <div style={{ paddingTop: 20 }}>
          <button className="uber-btn" onClick={onRestart} style={{
            width: "100%", background: "#242424", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, color: "#fff", fontWeight: 700, fontSize: 15, padding: "15px",
            cursor: "pointer",
          }}>
            New Delivery
          </button>
        </div>
      </div>
    </Panel>
  );
}

function EarningStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ color: highlight ? "#06C167" : "#fff", fontWeight: 800, fontSize: highlight ? 24 : 20 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 4, fontWeight: 500 }}>{label}</div>
    </div>
  );
}
