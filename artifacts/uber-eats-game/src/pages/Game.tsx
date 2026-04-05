import { useEffect, useRef, useState, useCallback } from "react";
import { playNewOrder, playAccept, playDecline, playArrived, playDelivered, playRankUp, playTap } from "../sounds";
import type { DriverProfile } from "./Onboarding";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "offline" | "online" | "selecting" | "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

interface MenuItem { name: string; price: number; }
interface Restaurant { name: string; emoji: string; color: string; address: string; menu: MenuItem[]; }
interface Customer { name: string; rating: number; address: string; orders: number; }
interface Order {
  id: string; restaurant: Restaurant; customer: Customer; items: MenuItem[];
  total: number; distance: string; duration: string;
  mapX: number; mapY: number; // position on map
}

interface BusyZone { id: string; x: number; y: number; r: number; label: string; multiplier: number; }

// ─── Rank System ──────────────────────────────────────────────────────────────

interface Rank { name: string; icon: string; color: string; gradient: string; min: number; max: number | null; perks: string[]; }
const RANKS: Rank[] = [
  { name: "Blue",     icon: "🔵", color: "#4FC3F7", gradient: "linear-gradient(135deg,#0277BD,#4FC3F7)", min: 0,  max: 9,    perks: ["Standard order matching", "Basic driver support"] },
  { name: "Gold",     icon: "🥇", color: "#FFD54F", gradient: "linear-gradient(135deg,#F57F17,#FFD54F)", min: 10, max: 24,   perks: ["Priority order matching", "Gold driver badge"] },
  { name: "Platinum", icon: "💎", color: "#B0BEC5", gradient: "linear-gradient(135deg,#546E7A,#CFD8DC)", min: 25, max: 49,   perks: ["Surge pricing access", "Free Uber One membership"] },
  { name: "Diamond",  icon: "✨", color: "#CE93D8", gradient: "linear-gradient(135deg,#6A1B9A,#E040FB)", min: 50, max: null, perks: ["Earnings boost +15%", "VIP driver lounge"] },
];
function getRank(t: number): Rank { return [...RANKS].reverse().find(r => t >= r.min) ?? RANKS[0]; }
function getNextRank(t: number): Rank | null { const i = RANKS.findIndex(r => r === getRank(t)); return i < RANKS.length - 1 ? RANKS[i + 1] : null; }
function rankPct(t: number): number { const r = getRank(t); if (!r.max) return 100; return Math.min(100, ((t - r.min) / (r.max - r.min + 1)) * 100); }

// ─── Data ─────────────────────────────────────────────────────────────────────

const RESTAURANTS: Restaurant[] = [
  { name: "McDonald's",  emoji: "🍔", color: "#FF6000", address: "Market Square, Nottingham",
    menu: [{ name: "Big Mac Meal", price: 7.49 }, { name: "McFlurry", price: 2.19 }, { name: "Chicken McNuggets x6", price: 4.39 }] },
  { name: "Burger King", emoji: "👑", color: "#D62300", address: "Upper Parliament St",
    menu: [{ name: "Whopper Meal", price: 8.29 }, { name: "Chicken Royale", price: 6.49 }, { name: "Onion Rings", price: 2.49 }] },
  { name: "KFC",         emoji: "🍗", color: "#E4002B", address: "Clumber Street",
    menu: [{ name: "Zinger Burger Meal", price: 7.99 }, { name: "Bucket for One", price: 9.49 }, { name: "Popcorn Chicken", price: 3.99 }] },
  { name: "Pizza Hut",   emoji: "🍕", color: "#EE3124", address: "Victoria Centre",
    menu: [{ name: "Pepperoni Passion (M)", price: 13.99 }, { name: "BBQ Chicken (M)", price: 13.49 }, { name: "Dough Balls x8", price: 4.99 }] },
  { name: "Nando's",     emoji: "🔥", color: "#FF6600", address: "Trinity Square",
    menu: [{ name: "1/2 Chicken (Hot)", price: 9.75 }, { name: "Peri Peri Wrap", price: 8.25 }, { name: "Peri Fries", price: 3.75 }] },
  { name: "Subway",      emoji: "🥖", color: "#009743", address: "Derby Road",
    menu: [{ name: "Foot-long Meatball", price: 7.49 }, { name: "6\" BMT", price: 5.99 }, { name: "Veggie Delite", price: 5.49 }] },
  { name: "Wagamama",    emoji: "🍜", color: "#A00000", address: "Cornerhouse",
    menu: [{ name: "Chicken Katsu Curry", price: 13.50 }, { name: "Ramen Noodle Bowl", price: 12.95 }, { name: "Gyoza x6", price: 6.50 }] },
  { name: "Greggs",      emoji: "🥐", color: "#0066CC", address: "Mansfield Road",
    menu: [{ name: "Sausage Roll", price: 1.35 }, { name: "Steak Bake", price: 1.75 }, { name: "Latte", price: 1.75 }] },
];
const CUSTOMERS: Customer[] = [
  { name: "James R.",  rating: 4.92, address: "42 Castle Blvd, NG7",   orders: 347 },
  { name: "Sophie M.", rating: 4.85, address: "17 Lenton Ave, NG7",    orders: 182 },
  { name: "Chris T.",  rating: 4.97, address: "8 Forest Rd West, NG7", orders: 521 },
  { name: "Priya K.",  rating: 4.78, address: "3 Meadows Way, NG2",    orders: 94  },
  { name: "Daniel W.", rating: 4.88, address: "55 Gregory Blvd, NG7",  orders: 263 },
  { name: "Emma L.",   rating: 4.95, address: "22 Wollaton Rd, NG8",   orders: 408 },
];
const TIPS = [0, 0, 0.5, 0.5, 1, 1, 1.5, 2, 2.5];
const DURATIONS = ["4 min", "6 min", "8 min", "10 min", "12 min", "7 min", "9 min"];
const DISTANCES = ["0.8 km", "1.2 km", "1.6 km", "2.1 km", "2.4 km", "1.9 km", "3.1 km"];

// Positions on the map for each restaurant
const RESTAURANT_MAP_POS: Record<string, { x: number; y: number }> = {
  "McDonald's":  { x: 210, y: 230 },
  "Burger King": { x: 240, y: 200 },
  "KFC":         { x: 275, y: 245 },
  "Pizza Hut":   { x: 230, y: 170 },
  "Nando's":     { x: 195, y: 255 },
  "Subway":      { x: 130, y: 220 },
  "Wagamama":    { x: 260, y: 210 },
  "Greggs":      { x: 300, y: 155 },
};

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function fmt(n: number) { return `£${n.toFixed(2)}`; }
let orderIdCounter = 0;

function generateOrder(busyMultiplier: number): Order {
  const restaurant = pick(RESTAURANTS);
  const customer = pick(CUSTOMERS);
  const count = Math.floor(rand(1, 4));
  const items = [...restaurant.menu].sort(() => Math.random() - 0.5).slice(0, count);
  const fare = parseFloat((items.reduce((s, i) => s + i.price, 0) * 0.35 * busyMultiplier + rand(1.5, 3.5)).toFixed(2));
  const pos = RESTAURANT_MAP_POS[restaurant.name] ?? { x: rand(100, 340), y: rand(120, 380) };
  const jitterX = rand(-30, 30);
  const jitterY = rand(-25, 25);
  return {
    id: String(++orderIdCounter),
    restaurant, customer, items, total: fare,
    distance: pick(DISTANCES), duration: pick(DURATIONS),
    mapX: Math.max(60, Math.min(380, pos.x + jitterX)),
    mapY: Math.max(100, Math.min(400, pos.y + jitterY)),
  };
}

// ─── BUSY ZONES ───────────────────────────────────────────────────────────────

const POSSIBLE_BUSY_ZONES: Omit<BusyZone, "id">[] = [
  { x: 220, y: 220, r: 70,  label: "City Centre", multiplier: 1.4 },
  { x: 310, y: 175, r: 55,  label: "Sneinton",    multiplier: 1.2 },
  { x: 140, y: 240, r: 50,  label: "Lenton",      multiplier: 1.15 },
  { x: 200, y: 360, r: 60,  label: "Meadows",     multiplier: 1.3 },
  { x: 90,  y: 180, r: 50,  label: "Derby Rd",    multiplier: 1.1 },
  { x: 320, y: 300, r: 55,  label: "Carlton",     multiplier: 1.25 },
];

function pickBusyZones(): BusyZone[] {
  const count = Math.floor(rand(1, 4));
  const shuffled = [...POSSIBLE_BUSY_ZONES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((z, i) => ({ ...z, id: String(i) }));
}

// ─── CITY MAP SVG ─────────────────────────────────────────────────────────────

function CityMap({ busyZones, orders, driverPhase, onOrderTap }: {
  busyZones: BusyZone[]; orders: Order[]; driverPhase: Phase; onOrderTap: (o: Order) => void;
}) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#e9e4db" }}>
      <svg width="100%" height="100%" viewBox="0 0 440 520" preserveAspectRatio="xMidYMid slice"
           style={{ position: "absolute", inset: 0, display: "block" }}>

        {/* Base */}
        <rect width="440" height="520" fill="#e9e4db" />

        {/* === WATER - River Trent === */}
        <path d="M-10,445 C40,435 100,448 180,440 S300,432 460,442 L460,520 L-10,520 Z" fill="#aacde0" />
        <path d="M-10,455 C60,445 120,458 200,450 S320,444 460,452" fill="none" stroke="#88adc8" strokeWidth="2" />

        {/* === PARKS === */}
        {/* Forest Recreation Ground */}
        <rect x="8" y="10" width="110" height="80" rx="5" fill="#bdd8a8" stroke="#8eba76" strokeWidth="1.5" />
        <text x="63" y="47" textAnchor="middle" fontSize="8.5" fill="#4a7a40" fontWeight="700" fontFamily="sans-serif">The Forest</text>
        <text x="63" y="59" textAnchor="middle" fontSize="7" fill="#5a8a50" fontFamily="sans-serif">Recreation Ground</text>

        {/* Arboretum */}
        <rect x="335" y="50" width="95" height="60" rx="4" fill="#c4daa8" stroke="#8eba76" strokeWidth="1" />
        <text x="383" y="82" textAnchor="middle" fontSize="8" fill="#4a7a40" fontWeight="600" fontFamily="sans-serif">Arboretum</text>

        {/* The Park estate */}
        <ellipse cx="88" cy="270" rx="62" ry="50" fill="#c4dab0" stroke="#8eba76" strokeWidth="1.5" />
        <text x="88" y="268" textAnchor="middle" fontSize="8" fill="#3a6a30" fontWeight="700" fontFamily="sans-serif">The Park</text>
        <text x="88" y="280" textAnchor="middle" fontSize="7" fill="#4a7a40" fontFamily="sans-serif">Estate</text>

        {/* Victoria Embankment */}
        <rect x="140" y="410" width="160" height="28" rx="4" fill="#bdd8a8" stroke="#8eba76" strokeWidth="1" />
        <text x="220" y="427" textAnchor="middle" fontSize="7.5" fill="#4a7a40" fontWeight="600" fontFamily="sans-serif">Victoria Embankment</text>

        {/* === CITY BLOCKS === */}
        {/* City centre dense blocks */}
        <rect x="155" y="150" width="60" height="48" fill="#d6d1c8" />
        <rect x="220" y="150" width="45" height="48" fill="#ccc8bd" />
        <rect x="270" y="150" width="60" height="48" fill="#d4cfc6" />
        <rect x="155" y="203" width="35" height="42" fill="#c8c4bb" />
        <rect x="195" y="203" width="70" height="42" fill="#d2cdc4" />
        <rect x="270" y="203" width="60" height="42" fill="#d6cfc6" />
        <rect x="155" y="250" width="45" height="45" fill="#d4cfc6" />
        <rect x="205" y="250" width="60" height="45" fill="#ccc8bd" />
        <rect x="270" y="250" width="60" height="45" fill="#d2cdc4" />

        {/* Right/east blocks */}
        <rect x="335" y="115" width="95" height="50" fill="#d8d3ca" />
        <rect x="335" y="170" width="95" height="50" fill="#d4cfc6" />
        <rect x="335" y="225" width="95" height="45" fill="#d8d3ca" />
        <rect x="335" y="275" width="95" height="50" fill="#d4cfc6" />

        {/* Left/west blocks */}
        <rect x="15" y="100" width="65" height="55" fill="#d8d3ca" />
        <rect x="85" y="100" width="65" height="55" fill="#d4cfc6" />
        <rect x="15" y="325" width="65" height="55" fill="#d8d3ca" />
        <rect x="85" y="325" width="65" height="55" fill="#d4cfc6" />
        <rect x="155" y="325" width="50" height="55" fill="#d8d3ca" />

        {/* Lower blocks */}
        <rect x="15" y="385" width="75" height="55" fill="#d4cfc6" />
        <rect x="95" y="385" width="40" height="55" fill="#d8d3ca" />
        <rect x="205" y="325" width="60" height="55" fill="#d8d3ca" />
        <rect x="270" y="325" width="60" height="55" fill="#d4cfc6" />
        <rect x="335" y="325" width="95" height="55" fill="#d8d3ca" />
        <rect x="270" y="385" width="60" height="55" fill="#d4cfc6" />
        <rect x="335" y="385" width="95" height="55" fill="#d8d3ca" />

        {/* === ROADS === */}
        {/* Motorway/ring road - cream/yellow */}
        <path
          d="M150,92 L290,92 Q390,92 390,130 L390,300 Q390,380 310,380 L130,380 Q50,380 50,300 L50,130 Q50,92 150,92 Z"
          fill="none" stroke="#f5e8c0" strokeWidth="9" strokeLinejoin="round" />
        <path
          d="M150,92 L290,92 Q390,92 390,130 L390,300 Q390,380 310,380 L130,380 Q50,380 50,300 L50,130 Q50,92 150,92 Z"
          fill="none" stroke="#f0d898" strokeWidth="2" strokeLinejoin="round" strokeDasharray="0" />

        {/* Major horizontal roads */}
        <rect x="0" y="88" width="440" height="8" fill="white" />
        <rect x="0" y="296" width="440" height="8" fill="white" />
        <rect x="0" y="406" width="440" height="8" fill="white" />

        {/* Major vertical roads */}
        <rect x="148" y="0" width="8" height="520" fill="white" />
        <rect x="216" y="0" width="8" height="520" fill="white" />
        <rect x="328" y="0" width="8" height="520" fill="white" />

        {/* Medium roads */}
        <rect x="0" y="148" width="440" height="5" fill="#fff8ee" />
        <rect x="0" y="248" width="155" height="5" fill="#fff8ee" />
        <rect x="335" y="248" width="105" height="5" fill="#fff8ee" />
        <rect x="0" y="375" width="440" height="5" fill="#fff8ee" />
        <rect x="78" y="92" width="5" height="315" fill="#fff8ee" />
        <rect x="265" y="0" width="5" height="450" fill="#fff8ee" />

        {/* Derby Road diagonal */}
        <path d="M155,248 L90,140 L45,50" stroke="white" strokeWidth="5" fill="none" strokeLinejoin="round" />
        {/* Mansfield Road diagonal */}
        <path d="M265,188 L310,100 L360,28" stroke="white" strokeWidth="4.5" fill="none" strokeLinejoin="round" />
        {/* Trent Bridge */}
        <path d="M180,406 L260,406" stroke="#ccc" strokeWidth="3" fill="none" />

        {/* Minor streets */}
        {[120,180,205,340,390].map(y => (
          <line key={y} x1="0" y1={y} x2="440" y2={y} stroke="white" strokeWidth="2" opacity="0.7" />
        ))}
        {[100,175,390,420].map(x => (
          <line key={x} x1={x} y1="92" x2={x} y2="406" stroke="white" strokeWidth="2" opacity="0.7" />
        ))}

        {/* === HIGHWAY BADGES === */}
        {[
          { x: 30, y: 300, label: "A52" },
          { x: 410, y: 300, label: "A52" },
          { x: 30, y: 96, label: "A610" },
        ].map(b => (
          <g key={b.label + b.x}>
            <circle cx={b.x} cy={b.y} r={13} fill="white" stroke="#bbb" strokeWidth="1" />
            <text x={b.x} y={b.y + 4} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#444" fontFamily="sans-serif">{b.label}</text>
          </g>
        ))}

        {/* === AREA LABELS === */}
        {[
          { x: 220, y: 230, t: "City Centre", size: 9, bold: true },
          { x: 370, y: 200, t: "Sneinton", size: 8, bold: false },
          { x: 45, y: 162, t: "Radford", size: 7.5, bold: false },
          { x: 370, y: 355, t: "Carlton", size: 7.5, bold: false },
          { x: 220, y: 455, t: "The Meadows", size: 8, bold: false },
          { x: 30, y: 370, t: "Lenton", size: 7.5, bold: false },
          { x: 190, y: 360, t: "Castlegate", size: 7.5, bold: false },
        ].map(l => (
          <text key={l.t} x={l.x} y={l.y} textAnchor="middle" fontSize={l.size}
                fill="#666" fontWeight={l.bold ? "700" : "500"} fontFamily="sans-serif"
                style={{ pointerEvents: "none" }}>{l.t}</text>
        ))}

        {/* === BUSY ZONE OVERLAYS === */}
        {busyZones.map(z => (
          <g key={z.id}>
            <circle cx={z.x} cy={z.y} r={z.r} fill={`rgba(${z.multiplier > 1.3 ? "210,60,30" : z.multiplier > 1.2 ? "220,100,20" : "220,140,10"},0.22)`} />
            <circle cx={z.x} cy={z.y} r={z.r * 0.6} fill={`rgba(${z.multiplier > 1.3 ? "200,40,10" : z.multiplier > 1.2 ? "210,80,10" : "210,120,5"},0.15)`} />
          </g>
        ))}

        {/* === ORDER BUBBLES ON MAP === */}
        {orders.map(o => (
          <g key={o.id} onClick={() => onOrderTap(o)} style={{ cursor: "pointer" }}>
            <circle cx={o.mapX} cy={o.mapY} r={20} fill="white" stroke="#ddd" strokeWidth="1.5"
                    style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.2))" }} />
            <text x={o.mapX} y={o.mapY - 3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#222" fontFamily="sans-serif">
              {fmt(o.total)}
            </text>
            <text x={o.mapX} y={o.mapY + 8} textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif">
              {o.restaurant.emoji}
            </text>
            {/* Pulsing ring */}
            <circle cx={o.mapX} cy={o.mapY} r={24} fill="none" stroke="#06C167" strokeWidth="2" opacity="0.5"
                    style={{ animation: "mapPulse 1.8s ease-out infinite" }} />
          </g>
        ))}

        {/* === DRIVER LOCATION MARKER === */}
        {driverPhase !== "offline" && (
          <g>
            <circle cx={220} cy={280} r={24} fill="rgba(6,193,103,0.18)" />
            <circle cx={220} cy={280} r={14} fill="#06C167" stroke="white" strokeWidth="3"
                    style={{ filter: "drop-shadow(0 2px 8px rgba(6,193,103,0.6))" }} />
            <circle cx={220} cy={280} r={5} fill="white" />
          </g>
        )}

        {/* === SURGE MULTIPLIER BADGE === */}
        {busyZones.length > 0 && driverPhase !== "offline" && (
          <g>
            <rect x="340" y="400" width="70" height="26" rx="13" fill="#06C167" />
            <text x="375" y="415" textAnchor="middle" fontSize="11" fontWeight="900" fill="white" fontFamily="sans-serif">
              {Math.max(...busyZones.map(z => z.multiplier)).toFixed(1)}x
            </text>
          </g>
        )}

      </svg>
    </div>
  );
}

// ─── Side Menu ────────────────────────────────────────────────────────────────

type MenuPage = null | "earnings" | "wallet" | "account" | "rank";

function SideMenu({ isOpen, profile, earnings, tripCount, onClose, onUpdateProfile, onCashOut, stateKey }: {
  isOpen: boolean; profile: DriverProfile; earnings: number; tripCount: number;
  onClose: () => void; onUpdateProfile: (p: DriverProfile) => void;
  onCashOut: () => void; stateKey: string;
}) {
  const [page, setPage] = useState<MenuPage>(null);
  const [editName, setEditName] = useState(profile.name);
  const [editAvatar, setEditAvatar] = useState(profile.avatar);
  const [editVehicle, setEditVehicle] = useState(profile.vehicleEmoji);
  const [editCity, setEditCity] = useState(profile.city);
  const [saveMsg, setSaveMsg] = useState("");

  const rank = getRank(tripCount);
  const nextRank = getNextRank(tripCount);
  const pct = rankPct(tripCount);

  const AVATARS = ["😊","😎","🧑","👨‍💼","👩‍💼","🧔","👱","🧑‍🦱","👨‍🦰","👩‍🦰","🧑‍🦳","🥷"];
  const VEHICLES = [
    { label: "Car", emoji: "🚗" }, { label: "Scooter", emoji: "🛵" },
    { label: "E-Bike", emoji: "⚡🚲" }, { label: "Bicycle", emoji: "🚲" },
  ];
  const CITIES = ["Nottingham", "London", "Manchester", "Birmingham"];

  function saveProfile() {
    const vObj = VEHICLES.find(v => v.emoji === editVehicle) ?? VEHICLES[0];
    const updated: DriverProfile = {
      ...profile, name: editName.trim() || profile.name,
      avatar: editAvatar, vehicleEmoji: vObj.emoji,
      vehicle: vObj.label, city: editCity,
    };
    onUpdateProfile(updated);
    setSaveMsg("Saved!");
    setTimeout(() => setSaveMsg(""), 2000);
  }

  const menuItems = [
    { icon: "📬", label: "Inbox",          badge: "3", action: () => {} },
    { icon: "👥", label: "Refer Friends",  badge: null, action: () => {} },
    { icon: "⚡", label: "Opportunities",  badge: "•", action: () => {} },
    { icon: "📊", label: "Earnings",       badge: null, action: () => setPage("earnings") },
    { icon: rank.icon, label: "Uber Pro",  badge: null, action: () => setPage("rank") },
    { icon: "💰", label: "Wallet",         badge: null, action: () => setPage("wallet") },
    { icon: "👤", label: "Account",        badge: null, action: () => setPage("account") },
  ];

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 190, animation: "fadeIn 0.2s ease" }} />
      )}

      {/* Menu panel */}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 285,
        background: "white", zIndex: 200, display: "flex", flexDirection: "column",
        transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: isOpen ? "4px 0 24px rgba(0,0,0,0.2)" : "none",
      }}>

        {/* Profile header */}
        <div style={{ background: "#1a1a1a", paddingTop: 56, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#06C16722", border: "2px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
              {profile.avatar}
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 18 }}>{profile.name.split(" ")[0]}</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, fontFamily: "monospace" }}>{profile.driverCode}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#06C167" }} />
                <span style={{ color: "#06C167", fontSize: 11, fontWeight: 700 }}>⭐ 4.93</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content or menu list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {!page && (
            <>
              <div style={{ padding: "8px 0" }}>
                {menuItems.map(item => (
                  <button key={item.label} onClick={item.action} style={{
                    width: "100%", background: "none", border: "none", textAlign: "left",
                    padding: "15px 22px", display: "flex", alignItems: "center", gap: 16,
                    cursor: "pointer", borderBottom: "1px solid #f0f0f0",
                  }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ flex: 1, fontSize: 16, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</span>
                    {item.badge && (
                      <span style={{ background: item.badge === "•" ? "#06C167" : "#276EF1", color: "white", borderRadius: 12, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    )}
                    <span style={{ color: "#bbb", fontSize: 14 }}>›</span>
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 22px", borderTop: "1px solid #f0f0f0", marginTop: 8 }}>
                <div style={{ color: "#888", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Help</div>
                <div style={{ color: "#444", fontSize: 14, marginBottom: 10 }}>Learning Center</div>
                <div style={{ color: "#444", fontSize: 14 }}>Support</div>
              </div>
            </>
          )}

          {/* Earnings page */}
          {page === "earnings" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Earnings</div>
              <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "20px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>Total Earned</div>
                <div style={{ color: "#1a1a1a", fontWeight: 900, fontSize: 36 }}>{fmt(earnings)}</div>
              </div>
              <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "#888", fontSize: 13 }}>Total Deliveries</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{tripCount}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "#888", fontSize: 13 }}>Avg per Trip</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{tripCount > 0 ? fmt(earnings / tripCount) : "£0.00"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888", fontSize: 13 }}>Completion Rate</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#06C167" }}>100%</span>
                </div>
              </div>
            </div>
          )}

          {/* Wallet page */}
          {page === "wallet" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Wallet</div>
              <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "20px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>Available Balance</div>
                <div style={{ color: "#1a1a1a", fontWeight: 900, fontSize: 36 }}>{fmt(earnings)}</div>
              </div>
              <button
                onClick={() => { onCashOut(); setPage(null); onClose(); }}
                disabled={earnings <= 0}
                style={{
                  width: "100%", background: earnings > 0 ? "#06C167" : "#ddd",
                  border: "none", borderRadius: 12, color: "white", fontWeight: 800,
                  fontSize: 16, padding: "16px", cursor: earnings > 0 ? "pointer" : "default",
                }}
              >💳 Cash Out</button>
              {earnings <= 0 && <div style={{ color: "#bbb", fontSize: 12, textAlign: "center", marginTop: 8 }}>No earnings to cash out yet</div>}
            </div>
          )}

          {/* Rank / Uber Pro page */}
          {page === "rank" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Uber Pro</div>
              <div style={{ background: rank.gradient, borderRadius: 16, padding: "20px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>{rank.icon}</div>
                <div style={{ color: "white", fontWeight: 900, fontSize: 24 }}>{rank.name}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, marginTop: 4 }}>{tripCount} trips completed</div>
              </div>
              {nextRank && (
                <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "16px", marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>Progress to {nextRank.icon} {nextRank.name}</div>
                  <div style={{ background: "#e0e0e0", borderRadius: 4, height: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: rank.gradient, width: `${pct}%`, borderRadius: 4, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 12, color: "#888", marginTop: 6, textAlign: "right" }}>{nextRank.min - tripCount} trips to go</div>
                </div>
              )}
              <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "14px" }}>
                {rank.perks.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: i < rank.perks.length - 1 ? "1px solid #ebebeb" : "none" }}>
                    <span style={{ color: "#06C167", fontSize: 14 }}>✓</span>
                    <span style={{ fontSize: 13, color: "#444" }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Account / Edit profile page */}
          {page === "account" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Account</div>
              <div style={{ color: "#999", fontSize: 12, fontFamily: "monospace", marginBottom: 20 }}>{profile.driverCode}</div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>Display Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #e0e0e0", borderRadius: 10, padding: "12px", fontSize: 15, marginBottom: 16, outline: "none" }} />

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Avatar</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {AVATARS.map(a => (
                  <button key={a} onClick={() => setEditAvatar(a)} style={{
                    width: 40, height: 40, borderRadius: 10, border: editAvatar === a ? "2px solid #06C167" : "2px solid #e0e0e0",
                    background: editAvatar === a ? "#06C16712" : "white", fontSize: 20, cursor: "pointer",
                  }}>{a}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Vehicle</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {VEHICLES.map(v => (
                  <button key={v.emoji} onClick={() => setEditVehicle(v.emoji)} style={{
                    flex: 1, padding: "10px 4px", borderRadius: 10, border: editVehicle === v.emoji ? "2px solid #06C167" : "2px solid #e0e0e0",
                    background: editVehicle === v.emoji ? "#06C16712" : "white", fontSize: 18, cursor: "pointer",
                  }}>{v.emoji}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>City</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {CITIES.map(c => (
                  <button key={c} onClick={() => setEditCity(c)} style={{
                    padding: "12px 14px", borderRadius: 10, border: editCity === c ? "2px solid #06C167" : "2px solid #e0e0e0",
                    background: editCity === c ? "#06C16712" : "white", textAlign: "left",
                    fontSize: 14, fontWeight: editCity === c ? 700 : 400, color: "#1a1a1a", cursor: "pointer",
                  }}>{c}</button>
                ))}
              </div>

              <button onClick={saveProfile} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 12, color: "white", fontWeight: 800, fontSize: 16, padding: "15px", cursor: "pointer" }}>
                {saveMsg || "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Road View ────────────────────────────────────────────────────────────────

function RoadView({ phase, order, progress, vehicleEmoji }: { phase: Phase; order: Order | null; progress: number; vehicleEmoji: string }) {
  const moving = phase === "to-restaurant" || phase === "to-customer";
  const atRest = phase === "at-restaurant";
  const toCustomer = phase === "to-customer";
  const destEmoji = toCustomer ? "🏠" : (order?.restaurant.emoji ?? "🍔");
  const destLabel = toCustomer ? order?.customer.name : order?.restaurant.name;
  const destColor = toCustomer ? "#276EF1" : (order?.restaurant.color ?? "#06C167");

  return (
    <div style={{ position: "relative", flex: 1, background: "#111", overflow: "hidden", minHeight: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,#0a0a1a 0%,#111827 40%,#1a1a1a 100%)" }} />
      <Skyline />
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "44%", top: "28%", background: "#1c1c1c" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "#FFD700", opacity: 0.6 }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, background: "#FFD700", opacity: 0.6 }} />
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0, width: 4,
          transform: "translateX(-50%)",
          backgroundImage: "repeating-linear-gradient(to bottom, #fff 0px, #fff 28px, transparent 28px, transparent 56px)",
          backgroundSize: "4px 56px",
          animation: moving ? "roadScroll 1.4s linear infinite" : "none",
          opacity: 0.35,
        }} />
        {(moving || atRest) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${100 - progress}%`, background: `linear-gradient(to top, ${destColor}18, transparent)`, transition: "height 0.3s ease" }} />
        )}
      </div>
      {["-28%", "72%"].map((left, i) => (
        <div key={i} style={{ position: "absolute", top: "28%", bottom: 0, left, width: "6%", background: "#161616" }}>
          <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(to bottom, #2a2a2a 0px, #2a2a2a 20px, transparent 20px, transparent 40px)", animation: moving ? "roadScroll 1.4s linear infinite" : "none", opacity: 0.5 }} />
        </div>
      ))}
      {order && (phase === "to-restaurant" || phase === "at-restaurant" || phase === "to-customer") && (
        <div style={{ position: "absolute", top: "6%", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, animation: "fadeIn 0.5s ease", zIndex: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: destColor + "22", border: `2px solid ${destColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, boxShadow: `0 0 20px ${destColor}66`, animation: atRest ? "glow 1.5s ease-in-out infinite alternate" : "none" }}>{destEmoji}</div>
          <div style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", border: `1px solid ${destColor}44`, borderRadius: 8, padding: "4px 12px", color: "#fff", fontSize: 12, fontWeight: 600 }}>{destLabel}</div>
        </div>
      )}
      {moving && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "38%" }}>
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
      <div style={{
        position: "absolute",
        bottom: atRest ? "68%" : (moving ? `${20 + progress * 0.52}%` : "22%"),
        left: "50%", transform: "translateX(-50%)",
        transition: "bottom 0.3s ease", zIndex: 20,
        filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.8))",
        animation: moving ? "carBounce 0.3s ease-in-out infinite alternate" : "none",
        fontSize: 36, lineHeight: 1,
      }}>{vehicleEmoji}</div>
      {moving && <div style={{ position: "absolute", bottom: `${20 + progress * 0.52 + 5}%`, left: "50%", transform: "translateX(-50%)", width: 60, height: 80, background: "linear-gradient(to top, rgba(255,240,150,0.15), transparent)", clipPath: "polygon(20% 100%, 80% 100%, 100% 0%, 0% 0%)", zIndex: 15 }} />}
      {phase === "at-restaurant" && order && <AtRestaurantOverlay order={order} />}
      {phase === "delivered" && <DeliveredOverlay />}
    </div>
  );
}

function Skyline() {
  const buildings = [
    { left: "2%", w: 28, h: 90 }, { left: "7%", w: 18, h: 60 }, { left: "12%", w: 22, h: 110 },
    { left: "17%", w: 16, h: 75 }, { left: "22%", w: 30, h: 130 }, { left: "29%", w: 14, h: 55 },
    { left: "55%", w: 30, h: 120 }, { left: "62%", w: 20, h: 85 }, { left: "68%", w: 16, h: 65 },
    { left: "73%", w: 26, h: 100 }, { left: "80%", w: 18, h: 70 }, { left: "86%", w: 32, h: 140 },
  ];
  return (
    <div style={{ position: "absolute", bottom: "28%", left: 0, right: 0, height: 160, overflow: "hidden" }}>
      {buildings.map((b, i) => (
        <div key={i} style={{ position: "absolute", bottom: 0, left: b.left, width: b.w, height: b.h, background: `hsl(${220 + i * 5}, 15%, ${8 + (i % 3) * 3}%)`, borderTop: "1px solid rgba(255,255,255,0.04)" }} />
      ))}
    </div>
  );
}

function AtRestaurantOverlay({ order }: { order: Order }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 30 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>{order.restaurant.emoji}</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18 }}>Arrived!</div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginTop: 4 }}>Collect from {order.restaurant.name}</div>
      </div>
    </div>
  );
}

function DeliveredOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)", zIndex: 30 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 42, marginBottom: 8 }}>✅</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18 }}>Delivered!</div>
      </div>
    </div>
  );
}

// ─── Verification Modal ───────────────────────────────────────────────────────

function VerificationModal({ driverCode, onSuccess, onFail }: { driverCode: string; onSuccess: () => void; onFail: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);

  function handleVerify() {
    if (input.trim().toUpperCase() === driverCode) { onSuccess(); return; }
    const next = attempts + 1;
    setAttempts(next);
    setError(`Incorrect code. ${3 - next > 0 ? `${3 - next} attempt${3 - next !== 1 ? "s" : ""} remaining.` : "Access blocked."}`);
    setInput("");
    if (next >= 3) setTimeout(onFail, 1200);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ background: "#1a1a1a", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 14 }}>🔒</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, textAlign: "center", marginBottom: 6 }}>Identity Check</div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Every 3 deliveries we verify your identity.</div>
        <input autoFocus value={input} onChange={e => { setInput(e.target.value.toUpperCase()); setError(""); }}
          placeholder="DRV-000000" onKeyDown={e => e.key === "Enter" && input.trim() && handleVerify()}
          style={{ width: "100%", boxSizing: "border-box", background: "#2a2a2a", border: error ? "1.5px solid #e53935" : "1.5px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 18, fontWeight: 700, caretColor: "#06C167", fontFamily: "monospace", letterSpacing: "0.08em" }} />
        {error && <div style={{ color: "#e53935", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={handleVerify} disabled={!input.trim() || attempts >= 3}
          style={{ width: "100%", marginTop: 16, background: "#06C167", border: "none", borderRadius: 12, color: "#fff", fontWeight: 800, fontSize: 16, padding: "14px", cursor: "pointer", opacity: input.trim() && attempts < 3 ? 1 : 0.5 }}>
          Verify
        </button>
      </div>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function Panel({ children, noBorder }: { children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div style={{ background: "#1a1a1a", borderRadius: noBorder ? 0 : "18px 18px 0 0", boxShadow: "0 -4px 20px rgba(0,0,0,0.4)", animation: "slideUp 0.22s ease" }}>
      {!noBorder && <div style={{ width: 32, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, margin: "10px auto 12px" }} />}
      {children}
    </div>
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

function NavPanel({ direction, order, progress }: { direction: "to-restaurant" | "to-customer"; order: Order; progress: number }) {
  const toRest = direction === "to-restaurant";
  const color = toRest ? "#06C167" : "#276EF1";
  return (
    <Panel>
      <div style={{ padding: "0 16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{toRest ? "Head to restaurant" : "Head to customer"}</span>
          <span style={{ marginLeft: "auto", color, fontWeight: 700, fontSize: 13 }}>{Math.round(progress)}%</span>
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
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 18, marginBottom: 4 }}>You've arrived!</div>
        <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 12 }}>Collect order from {order.restaurant.name}</div>
        <div style={{ background: "#242424", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
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
          <div style={{ background: rankedUp.gradient, borderRadius: 12, padding: "14px", marginBottom: 14, textAlign: "center", animation: "rankUp 0.5s ease", boxShadow: `0 0 24px ${rankedUp.color}66` }}>
            <div style={{ fontSize: 32, marginBottom: 6 }}>{rankedUp.icon}</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Rank Up! You're now {rankedUp.name}</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>✅</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Delivery Complete!</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 3 }}>Delivered to {order.customer.name}</div>
          </div>
        )}
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
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <StatCard label="Distance" value={order.distance} />
          <StatCard label="Duration" value={order.duration} />
          <StatCard label="Customer" value={`${order.customer.rating}⭐`} />
        </div>
        <button className="ubtn" onClick={onNext} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 11, color: "#fff", fontWeight: 700, fontSize: 15, padding: "14px" }}>
          Back to Map
        </button>
      </div>
    </Panel>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────

export default function Game({ profile: initialProfile, stateKey }: { profile: DriverProfile; stateKey: string }) {
  const phaseRef = useRef<Phase>("offline");
  const moveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderSpawnTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef(0);

  function loadState() {
    try { const r = localStorage.getItem(stateKey); if (r) return JSON.parse(r); } catch { }
    return { totalEarnings: 0, tripCount: 0, loginCount: 0 };
  }
  const saved = loadState();

  const [profile, setProfile] = useState<DriverProfile>(initialProfile);
  const [phase, setPhase] = useState<Phase>("offline");
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [selectedOrderCard, setSelectedOrderCard] = useState<Order | null>(null);
  const [totalEarnings, setTotalEarnings] = useState<number>(saved.totalEarnings ?? 0);
  const [tripCount, setTripCount] = useState<number>(saved.tripCount ?? 0);
  const [sessionTime, setSessionTime] = useState(0);
  const [progress, setProgress] = useState(0);
  const [rankedUp, setRankedUp] = useState<Rank | null>(null);
  const [currentTip, setCurrentTip] = useState(0);
  const [busyZones, setBusyZones] = useState<BusyZone[]>([]);
  const [showVerification, setShowVerification] = useState(false);
  const [showCashOutMsg, setShowCashOutMsg] = useState("");
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [cooldownInterval, setCooldownIntervalState] = useState<ReturnType<typeof setInterval> | null>(null);

  const isBusy = busyZones.length >= 2;
  const maxMultiplier = busyZones.length > 0 ? Math.max(...busyZones.map(z => z.multiplier)) : 1;

  // Save state
  useEffect(() => {
    const raw = localStorage.getItem(stateKey);
    const state = raw ? JSON.parse(raw) : {};
    state.totalEarnings = totalEarnings;
    state.tripCount = tripCount;
    localStorage.setItem(stateKey, JSON.stringify(state));
  }, [totalEarnings, tripCount]);

  // Session timer
  useEffect(() => {
    if (phase === "offline") {
      if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
    } else if (!sessionTimerRef.current) {
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    }
  }, [phase]);

  // Busy zone rotation
  useEffect(() => {
    if (phase === "offline") return;
    setBusyZones(pickBusyZones());
    const iv = setInterval(() => setBusyZones(pickBusyZones()), 45000);
    return () => clearInterval(iv);
  }, [phase === "offline"]);

  function fmtTime(s: number) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(sc).padStart(2,"0")}` : `${m}:${String(sc).padStart(2,"0")}`;
  }

  function startCooldown(seconds: number, onDone: () => void) {
    setCooldownSec(seconds);
    if (cooldownInterval) clearInterval(cooldownInterval);
    let remaining = seconds;
    const iv = setInterval(() => {
      remaining -= 1;
      setCooldownSec(remaining);
      if (remaining <= 0) {
        clearInterval(iv);
        setCooldownIntervalState(null);
        setCooldownSec(0);
        onDone();
      }
    }, 1000);
    setCooldownIntervalState(iv);
  }

  const spawnOrders = useCallback(() => {
    if (phaseRef.current !== "online") return;
    const count = isBusy ? Math.floor(rand(2, 4)) : Math.floor(rand(1, 3));
    const orders = Array.from({ length: count }, () => generateOrder(maxMultiplier));
    setAvailableOrders(orders);
    phaseRef.current = "selecting";
    setPhase("selecting");
    playNewOrder();
  }, [isBusy, maxMultiplier]);

  const scheduleNextOrders = useCallback(() => {
    if (orderSpawnTimeout.current) clearTimeout(orderSpawnTimeout.current);
    const cooldown = isBusy ? Math.floor(rand(15000, 30000)) : Math.floor(rand(45000, 75000));
    const cooldownSecs = Math.floor(cooldown / 1000);
    phaseRef.current = "online";
    setPhase("online");
    setAvailableOrders([]);
    startCooldown(cooldownSecs, () => {
      if (phaseRef.current === "online") spawnOrders();
    });
  }, [isBusy, spawnOrders]);

  const handleGoOnline = useCallback(() => {
    playTap();
    phaseRef.current = "online";
    setPhase("online");
    // Spawn first batch quickly
    const delay = Math.floor(rand(3000, 6000));
    orderSpawnTimeout.current = setTimeout(() => {
      if (phaseRef.current === "online") spawnOrders();
    }, delay);
  }, [spawnOrders]);

  const handleGoOffline = useCallback(() => {
    if (moveInterval.current) clearInterval(moveInterval.current);
    if (orderSpawnTimeout.current) clearTimeout(orderSpawnTimeout.current);
    if (cooldownInterval) clearInterval(cooldownInterval);
    setCooldownSec(0);
    phaseRef.current = "offline";
    setPhase("offline");
    setAvailableOrders([]);
    setSelectedOrderCard(null);
    if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
  }, [cooldownInterval]);

  const handleAcceptOrder = useCallback((order: Order) => {
    setAvailableOrders([]);
    setSelectedOrderCard(null);
    setActiveOrder(order);
    setCurrentTip(pick(TIPS));
    playAccept();
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    progressRef.current = 0;
    setProgress(0);
    const steps = Math.floor(rand(100, 180));
    if (moveInterval.current) clearInterval(moveInterval.current);
    moveInterval.current = setInterval(() => {
      progressRef.current = Math.min(100, progressRef.current + (100 / steps));
      setProgress(Math.min(100, progressRef.current));
      if (progressRef.current >= 100) {
        clearInterval(moveInterval.current!); moveInterval.current = null;
        phaseRef.current = "at-restaurant"; setPhase("at-restaurant");
        playArrived();
      }
    }, 100);
  }, []);

  const handlePickedUp = useCallback(() => {
    playTap();
    phaseRef.current = "to-customer"; setPhase("to-customer");
    progressRef.current = 0; setProgress(0);
    const steps = Math.floor(rand(120, 200));
    if (moveInterval.current) clearInterval(moveInterval.current);
    moveInterval.current = setInterval(() => {
      progressRef.current = Math.min(100, progressRef.current + (100 / steps));
      setProgress(Math.min(100, progressRef.current));
      if (progressRef.current >= 100) {
        clearInterval(moveInterval.current!); moveInterval.current = null;
        phaseRef.current = "delivered"; setPhase("delivered");
        // Delivery complete
        const prev = getRank(tripCount);
        const newCount = tripCount + 1;
        const newRank = getRank(newCount);
        setTripCount(newCount);
        setTotalEarnings(e => parseFloat((e + (activeOrder?.total ?? 0) + currentTip).toFixed(2)));
        if (newRank.name !== prev.name) { setRankedUp(newRank); setTimeout(() => playRankUp(), 400); } else { playDelivered(); }
      }
    }, 100);
  }, [activeOrder, tripCount, currentTip]);

  const handleNextAfterDelivery = useCallback(() => {
    setRankedUp(null);
    const newCount = tripCount;
    if (newCount > 0 && newCount % 3 === 0) {
      setShowVerification(true);
      return;
    }
    scheduleNextOrders();
  }, [tripCount, scheduleNextOrders]);

  const handleVerificationSuccess = useCallback(() => {
    setShowVerification(false);
    scheduleNextOrders();
  }, [scheduleNextOrders]);

  const handleVerificationFail = useCallback(() => {
    setShowVerification(false);
    handleGoOffline();
  }, [handleGoOffline]);

  const handleCashOut = useCallback(() => {
    const amount = totalEarnings;
    setTotalEarnings(0);
    setShowCashOutMsg(`£${amount.toFixed(2)} transferred!`);
    setTimeout(() => setShowCashOutMsg(""), 3500);
  }, [totalEarnings]);

  const handleUpdateProfile = useCallback((updated: DriverProfile) => {
    localStorage.setItem("uber_eats_driver_profile", JSON.stringify(updated));
    setProfile(updated);
  }, []);

  const rank = getRank(tripCount);
  const isMapPhase = phase === "offline" || phase === "online" || phase === "selecting";
  const isDeliveryPhase = phase === "to-restaurant" || phase === "at-restaurant" || phase === "to-customer" || phase === "delivered";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", fontFamily: "'Inter',-apple-system,sans-serif", background: "#111", overflow: "hidden" }}>

      {/* ── Modals ── */}
      {showVerification && (
        <VerificationModal driverCode={profile.driverCode} onSuccess={handleVerificationSuccess} onFail={handleVerificationFail} />
      )}

      {/* ── Side Menu ── */}
      <SideMenu
        isOpen={sideMenuOpen}
        profile={profile}
        earnings={totalEarnings}
        tripCount={tripCount}
        onClose={() => setSideMenuOpen(false)}
        onUpdateProfile={handleUpdateProfile}
        onCashOut={handleCashOut}
        stateKey={stateKey}
      />

      {/* ── Cash Out Toast ── */}
      {showCashOutMsg && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: "#06C167", borderRadius: 12, padding: "12px 20px", color: "#fff", fontWeight: 700, fontSize: 14, zIndex: 400, boxShadow: "0 4px 20px rgba(6,193,103,0.4)", whiteSpace: "nowrap" }}>{showCashOutMsg}</div>
      )}

      {/* ── MAP VIEW (offline / online / selecting) ── */}
      {isMapPhase && (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <CityMap
            busyZones={busyZones}
            orders={availableOrders}
            driverPhase={phase}
            onOrderTap={o => setSelectedOrderCard(o)}
          />

          {/* ── Top bar ── */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
            padding: "12px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          }}>
            {/* Hamburger */}
            <button onClick={() => setSideMenuOpen(true)} style={{
              width: 40, height: 40, borderRadius: "50%", background: "white",
              border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 10px rgba(0,0,0,0.2)", flexShrink: 0,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 2, background: "#333", borderRadius: 2 }} />)}
              </div>
            </button>

            {/* Earnings badge */}
            <div style={{ background: "white", borderRadius: 24, padding: "8px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.2)", textAlign: "center" }}>
              <div style={{ fontWeight: 900, fontSize: 20, color: "#1a1a1a", lineHeight: 1 }}>{fmt(totalEarnings)}</div>
              <div style={{ fontSize: 10, color: "#888", fontWeight: 700, letterSpacing: "0.5px", marginTop: 2 }}>TODAY</div>
            </div>

            {/* Busy zone info */}
            {busyZones.length > 0 && phase !== "offline" && (
              <div style={{ background: "#FFF3E0", border: "1.5px solid #FF8C00", borderRadius: 12, padding: "6px 10px", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                <div style={{ fontSize: 10, color: "#E65100", fontWeight: 800, lineHeight: 1 }}>{maxMultiplier.toFixed(1)}x</div>
                <div style={{ fontSize: 8, color: "#F57C00", fontWeight: 600 }}>surge</div>
              </div>
            )}
          </div>

          {/* ── Busy zone label pills (scattered near zones) ── */}
          {phase !== "offline" && busyZones.map(z => (
            <div key={z.id} style={{
              position: "absolute",
              top: `${(z.y / 520) * 100}%`,
              left: `${(z.x / 440) * 100}%`,
              transform: "translate(-50%, -50%)",
              background: "rgba(200,50,0,0.82)", color: "white",
              borderRadius: 10, padding: "2px 8px", fontSize: 9, fontWeight: 700,
              pointerEvents: "none", whiteSpace: "nowrap",
              boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
            }}>{z.label} {z.multiplier.toFixed(1)}x</div>
          ))}

          {/* ── Bottom bar ── */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: "white", borderTop: "1px solid #e8e8e8",
            padding: "0 20px 8px",
          }}>
            {/* Cooldown indicator */}
            {phase === "online" && cooldownSec > 0 && (
              <div style={{ textAlign: "center", padding: "10px 0 6px", color: "#888", fontSize: 12 }}>
                Next orders in <span style={{ fontWeight: 700, color: "#444" }}>{cooldownSec}s</span>
              </div>
            )}

            {/* Status + controls */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0" }}>
              <button onClick={() => setSideMenuOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ width: 18, height: 2, background: "#666", borderRadius: 2 }} />
                  <div style={{ width: 14, height: 2, background: "#999", borderRadius: 2 }} />
                  <div style={{ width: 18, height: 2, background: "#666", borderRadius: 2 }} />
                </div>
              </button>

              {phase === "offline" ? (
                <button onClick={handleGoOnline} style={{ background: "#06C167", border: "none", borderRadius: 24, color: "white", fontWeight: 800, fontSize: 15, padding: "12px 36px", cursor: "pointer", boxShadow: "0 4px 16px rgba(6,193,103,0.4)" }}>
                  Go Online
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06C167", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>You're online</span>
                </div>
              )}

              {phase !== "offline" ? (
                <button onClick={handleGoOffline} style={{ background: "none", border: "1.5px solid #ddd", borderRadius: 20, color: "#666", fontWeight: 700, fontSize: 12, padding: "8px 14px", cursor: "pointer" }}>
                  Pause
                </button>
              ) : (
                <div style={{ width: 40 }} />
              )}
            </div>

            {/* Stats strip (online) */}
            {phase !== "offline" && (
              <div style={{ display: "flex", gap: 10, paddingBottom: 6, borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>{tripCount}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Trips</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#06C167" }}>{fmt(totalEarnings)}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Earned</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>{fmtTime(sessionTime)}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Online</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>{rank.icon} {rank.name}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Rank</div>
                </div>
              </div>
            )}

            {/* Offline stats */}
            {phase === "offline" && (
              <div style={{ display: "flex", gap: 10, paddingBottom: 6, borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>{tripCount}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Trips</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#06C167" }}>{fmt(totalEarnings)}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>Balance</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>{rank.icon}</div>
                  <div style={{ fontSize: 10, color: "#aaa" }}>{rank.name}</div>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <button onClick={handleCashOut} disabled={totalEarnings <= 0} style={{ background: "none", border: "1.5px solid #06C167", borderRadius: 10, color: "#06C167", fontSize: 11, fontWeight: 700, padding: "4px 8px", cursor: totalEarnings > 0 ? "pointer" : "default", opacity: totalEarnings > 0 ? 1 : 0.4 }}>
                    Cash Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ORDER SELECTION SHEET (bottom sheet on map) ── */}
      {phase === "selecting" && availableOrders.length > 0 && !selectedOrderCard && (
        <div style={{
          position: "absolute", bottom: 80, left: 0, right: 0, zIndex: 20,
          padding: "0 14px",
          animation: "slideUp 0.25s ease",
        }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, marginBottom: 10, textShadow: "0 1px 4px rgba(0,0,0,0.5)", textAlign: "center" }}>
            {availableOrders.length} order{availableOrders.length !== 1 ? "s" : ""} nearby — tap to review
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {availableOrders.map(o => (
              <div key={o.id} onClick={() => setSelectedOrderCard(o)} style={{
                background: "white", borderRadius: 16, padding: "12px 14px", minWidth: 170, flexShrink: 0,
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)", cursor: "pointer",
                border: "2px solid transparent",
                transition: "transform 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: o.restaurant.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{o.restaurant.emoji}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>{o.restaurant.name}</div>
                    <div style={{ fontSize: 10, color: "#888" }}>{o.duration} · {o.distance}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 20, color: "#06C167" }}>{fmt(o.total)}</div>
                <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>{o.items.length} item{o.items.length !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ORDER DETAIL MODAL (when one is selected) ── */}
      {selectedOrderCard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 150, display: "flex", alignItems: "flex-end", animation: "fadeIn 0.2s ease" }}>
          <div style={{ background: "#1a1a1a", borderRadius: "20px 20px 0 0", padding: "20px 20px 36px", width: "100%", animation: "slideUp 0.25s ease" }}>
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, margin: "0 auto 16px" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>New Delivery</div>
                <div style={{ color: "#06C167", fontWeight: 900, fontSize: 28, marginTop: 2 }}>{fmt(selectedOrderCard.total)}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{selectedOrderCard.duration} · {selectedOrderCard.distance}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ background: "#06C167", borderRadius: 6, padding: "2px 8px", color: "#fff", fontWeight: 700, fontSize: 10, marginBottom: 4, display: "inline-block" }}>EATS</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>{selectedOrderCard.customer.name} · {selectedOrderCard.customer.rating}⭐</div>
              </div>
            </div>

            <div style={{ background: "#242424", borderRadius: 12, padding: "10px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: selectedOrderCard.restaurant.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{selectedOrderCard.restaurant.emoji}</div>
                <div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{selectedOrderCard.restaurant.name}</div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{selectedOrderCard.restaurant.address}</div>
                </div>
              </div>
              {selectedOrderCard.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>· {item.name}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{fmt(item.price)}</span>
                </div>
              ))}
            </div>

            <div style={{ background: "#242424", borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 14px" }}>
                <span>{selectedOrderCard.restaurant.emoji}</span>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", fontWeight: 700 }}>Pickup</div>
                  <div style={{ color: "#fff", fontSize: 12 }}>{selectedOrderCard.restaurant.address}</div>
                </div>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 14px" }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 14px" }}>
                <span>🏠</span>
                <div>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase", fontWeight: 700 }}>Dropoff</div>
                  <div style={{ color: "#fff", fontSize: 12 }}>{selectedOrderCard.customer.address}</div>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                setSelectedOrderCard(null);
                const remaining = availableOrders.filter(o => o.id !== selectedOrderCard.id);
                setAvailableOrders(remaining);
                if (remaining.length === 0) { playDecline(); scheduleNextOrders(); }
              }} style={{ width: 52, height: 52, background: "#2a2a2a", border: "none", borderRadius: 12, color: "#e53935", fontSize: 20, cursor: "pointer", flexShrink: 0 }}>✕</button>
              <button className="ubtn" onClick={() => handleAcceptOrder(selectedOrderCard)} style={{ flex: 1, background: "#06C167", border: "none", borderRadius: 12, color: "#fff", fontWeight: 800, fontSize: 16, padding: "14px", cursor: "pointer" }}>
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELIVERY / ROAD VIEW ── */}
      {isDeliveryPhase && (
        <>
          {/* Delivery top bar */}
          <div style={{ flexShrink: 0, background: "rgba(0,0,0,0.95)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "10px 16px", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ background: "#1a1a1a", borderRadius: 7, padding: "5px 9px", display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
              <span style={{ fontSize: 14 }}>{profile.avatar}</span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>{profile.name.split(" ")[0]}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>{profile.vehicleEmoji} {profile.vehicle}</div>
              </div>
            </div>
            <div style={{ background: rank.gradient, borderRadius: 7, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 13 }}>{rank.icon}</span>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 11 }}>{rank.name}</span>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 0, background: "rgba(255,255,255,0.04)", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ flex: 1, padding: "6px 10px" }}>
                <div style={{ color: "#06C167", fontWeight: 800, fontSize: 13 }}>{fmt(totalEarnings)}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase" }}>Earnings</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.07)" }} />
              <div style={{ flex: 1, padding: "6px 10px" }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{tripCount}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textTransform: "uppercase" }}>Trips</div>
              </div>
            </div>
          </div>

          <RoadView phase={phase} order={activeOrder} progress={progress} vehicleEmoji={profile.vehicleEmoji} />

          <div style={{ flexShrink: 0 }}>
            {phase === "to-restaurant" && activeOrder && <NavPanel direction="to-restaurant" order={activeOrder} progress={progress} />}
            {phase === "at-restaurant" && activeOrder && <PickupPanel order={activeOrder} onPickedUp={handlePickedUp} />}
            {phase === "to-customer" && activeOrder && <NavPanel direction="to-customer" order={activeOrder} progress={progress} />}
            {phase === "delivered" && activeOrder && <DeliveredPanel order={activeOrder} tip={currentTip} rankedUp={rankedUp} onNext={handleNextAfterDelivery} />}
          </div>
        </>
      )}

      <style>{`
        @keyframes slideUp { from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0}to{opacity:1} }
        @keyframes roadScroll { from{background-position-y:0}to{background-position-y:56px} }
        @keyframes carBounce  { from{transform:translateX(-50%) translateY(0)}to{transform:translateX(-50%) translateY(-3px)} }
        @keyframes glow       { from{box-shadow:0 0 10px currentColor}to{box-shadow:0 0 24px currentColor} }
        @keyframes pulse      { 0%,100%{opacity:1}50%{opacity:0.35} }
        @keyframes rankUp     { 0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        @keyframes spin       { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes mapPulse   { 0%{r:24;opacity:0.6}100%{r:36;opacity:0} }
        .ubtn{transition:all 0.15s ease;cursor:pointer}
        .ubtn:hover{filter:brightness(0.88)}
        .ubtn:active{transform:scale(0.96)}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
