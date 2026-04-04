import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    L: typeof import("leaflet");
  }
}

type GamePhase = "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

const NOTTINGHAM: [number, number] = [52.9541, -1.1550];
const RESTAURANT: [number, number] = [52.9580, -1.1500];
const CUSTOMER: [number, number] = [52.9490, -1.1620];
const DRIVER_START: [number, number] = [52.9530, -1.1480];
const STEP_SIZE = 0.0003;

function makeEmojiIcon(L: typeof import("leaflet"), emoji: string, size = 32) {
  return L.divIcon({
    html: `<div style="font-size:${size}px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">${emoji}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function moveToward(
  current: [number, number],
  target: [number, number],
  step: number
): { pos: [number, number]; arrived: boolean } {
  const dlat = target[0] - current[0];
  const dlng = target[1] - current[1];
  const dist = Math.sqrt(dlat * dlat + dlng * dlng);
  if (dist <= step) {
    return { pos: target, arrived: true };
  }
  return {
    pos: [current[0] + (dlat / dist) * step, current[1] + (dlng / dist) * step],
    arrived: false,
  };
}

const PHASE_STATUS: Record<GamePhase, string> = {
  "to-restaurant": "🚗 Driver is heading to the restaurant...",
  "at-restaurant": "📦 Arrived at restaurant — scanning to pick up!",
  "to-customer": "🚀 Order picked up! Delivering to customer...",
  "delivered": "✅ Delivered! Enjoy your meal! 🍔",
};

export default function Game() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<ReturnType<typeof window.L.map> | null>(null);
  const driverMarkerRef = useRef<ReturnType<typeof window.L.marker> | null>(null);
  const driverPosRef = useRef<[number, number]>(DRIVER_START);
  const phaseRef = useRef<GamePhase>("to-restaurant");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<GamePhase>("to-restaurant");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true }).setView(NOTTINGHAM, 14);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.marker(RESTAURANT, { icon: makeEmojiIcon(L, "🍔", 36) })
      .addTo(map)
      .bindPopup("<b>Restaurant</b><br>Pickup point");

    L.marker(CUSTOMER, { icon: makeEmojiIcon(L, "🏠", 36) })
      .addTo(map)
      .bindPopup("<b>Customer</b><br>Drop-off point");

    const driverMarker = L.marker(DRIVER_START, { icon: makeEmojiIcon(L, "🚗", 36) })
      .addTo(map)
      .bindPopup("<b>Driver</b>");
    driverMarkerRef.current = driverMarker;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!started) return;

    intervalRef.current = setInterval(() => {
      const L = window.L;
      if (!driverMarkerRef.current || !L) return;

      const currentPhase = phaseRef.current;
      const target = currentPhase === "to-restaurant" ? RESTAURANT : CUSTOMER;
      const { pos, arrived } = moveToward(driverPosRef.current, target, STEP_SIZE);

      driverPosRef.current = pos;
      driverMarkerRef.current.setLatLng(pos);

      if (arrived) {
        if (currentPhase === "to-restaurant") {
          phaseRef.current = "at-restaurant";
          setPhase("at-restaurant");

          setTimeout(() => {
            phaseRef.current = "to-customer";
            setPhase("to-customer");
          }, 2000);
        } else if (currentPhase === "to-customer") {
          phaseRef.current = "delivered";
          setPhase("delivered");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }
    }, 100);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [started]);

  const handleStart = () => {
    driverPosRef.current = DRIVER_START;
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    setStarted(true);
  };

  const handleRestart = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    driverPosRef.current = DRIVER_START;
    if (driverMarkerRef.current) {
      driverMarkerRef.current.setLatLng(DRIVER_START);
    }
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    setStarted(false);
    setTimeout(() => setStarted(true), 50);
  };

  const isDelivered = phase === "delivered";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "Inter, sans-serif", background: "#0f1117" }}>
      <div style={{
        background: "#06C167",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>🍔</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 20, letterSpacing: "-0.3px" }}>UberEats Delivery Game</span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!started && (
            <button
              onClick={handleStart}
              style={{
                background: "#fff",
                color: "#06C167",
                border: "none",
                borderRadius: 8,
                padding: "8px 20px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Start Delivery
            </button>
          )}
          {started && (
            <button
              onClick={handleRestart}
              style={{
                background: "rgba(255,255,255,0.2)",
                color: "#fff",
                border: "2px solid rgba(255,255,255,0.4)",
                borderRadius: 8,
                padding: "8px 20px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Restart
            </button>
          )}
        </div>
      </div>

      <div ref={mapRef} style={{ flex: 1 }} />

      <div style={{
        background: isDelivered ? "#06C167" : "#1a1d2e",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        minHeight: 62,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isDelivered ? "#fff" : "#06C167",
            boxShadow: isDelivered ? "0 0 8px #fff" : "0 0 8px #06C167",
            animation: isDelivered ? "none" : "pulse 1.5s infinite",
          }} />
          <span style={{
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
          }}>
            {PHASE_STATUS[phase]}
          </span>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <LegendItem emoji="🍔" label="Restaurant" />
          <LegendItem emoji="🏠" label="Customer" />
          <LegendItem emoji="🚗" label="Driver" />
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}

function LegendItem({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 18 }}>{emoji}</span>
      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{label}</span>
    </div>
  );
}
