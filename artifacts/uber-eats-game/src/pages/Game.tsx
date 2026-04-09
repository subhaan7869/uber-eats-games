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
  mapX: number; mapY: number;
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
  { name: "McDonald's",  emoji: "🍔", color: "#DA291C", address: "Market Square, Nottingham",
    menu: [{ name: "Big Mac Meal", price: 7.49 }, { name: "McFlurry", price: 2.19 }, { name: "Chicken McNuggets ×6", price: 4.39 }] },
  { name: "Burger King", emoji: "👑", color: "#D62300", address: "Upper Parliament St",
    menu: [{ name: "Whopper Meal", price: 8.29 }, { name: "Chicken Royale", price: 6.49 }, { name: "Onion Rings", price: 2.49 }] },
  { name: "KFC",         emoji: "🍗", color: "#E4002B", address: "Clumber Street",
    menu: [{ name: "Zinger Burger Meal", price: 7.99 }, { name: "Bucket for One", price: 9.49 }, { name: "Popcorn Chicken", price: 3.99 }] },
  { name: "Pizza Hut",   emoji: "🍕", color: "#EE3124", address: "Victoria Centre",
    menu: [{ name: "Pepperoni Passion (M)", price: 13.99 }, { name: "BBQ Chicken (M)", price: 13.49 }, { name: "Dough Balls ×8", price: 4.99 }] },
  { name: "Nando's",     emoji: "🔥", color: "#C8102E", address: "Trinity Square",
    menu: [{ name: "½ Chicken (Hot)", price: 9.75 }, { name: "Peri Peri Wrap", price: 8.25 }, { name: "Peri Fries", price: 3.75 }] },
  { name: "Subway",      emoji: "🥖", color: "#009A44", address: "Derby Road",
    menu: [{ name: "Footlong Meatball", price: 7.49 }, { name: "6\" BMT", price: 5.99 }, { name: "Veggie Delite", price: 5.49 }] },
  { name: "Wagamama",    emoji: "🍜", color: "#A00000", address: "Cornerhouse",
    menu: [{ name: "Chicken Katsu Curry", price: 13.50 }, { name: "Ramen Noodle Bowl", price: 12.95 }, { name: "Gyoza ×6", price: 6.50 }] },
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

// ─── CITY MAP ─────────────────────────────────────────────────────────────────

function CityMap({ busyZones, orders, driverPhase, onOrderTap }: {
  busyZones: BusyZone[]; orders: Order[]; driverPhase: Phase; onOrderTap: (o: Order) => void;
}) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#f5f5f0" }}>
      <svg width="100%" height="100%" viewBox="0 0 440 520" preserveAspectRatio="xMidYMid slice"
           style={{ position: "absolute", inset: 0, display: "block" }}>

        <rect width="440" height="520" fill="#f0ece3" />

        {/* River Trent */}
        <path d="M-10,445 C40,435 100,448 180,440 S300,432 460,442 L460,520 L-10,520 Z" fill="#c8dce8" />
        <path d="M-10,455 C60,445 120,458 200,450 S320,444 460,452" fill="none" stroke="#a8c4d8" strokeWidth="2.5" />

        {/* Parks */}
        <rect x="8" y="10" width="110" height="80" rx="5" fill="#c8ddb0" stroke="#9ec87a" strokeWidth="1.5" />
        <text x="63" y="47" textAnchor="middle" fontSize="8.5" fill="#3d6b35" fontWeight="700" fontFamily="sans-serif">The Forest</text>
        <text x="63" y="59" textAnchor="middle" fontSize="7" fill="#4a7a40" fontFamily="sans-serif">Recreation Ground</text>

        <rect x="335" y="50" width="95" height="60" rx="4" fill="#cdddb0" stroke="#9ec87a" strokeWidth="1" />
        <text x="383" y="82" textAnchor="middle" fontSize="8" fill="#3d6b35" fontWeight="600" fontFamily="sans-serif">Arboretum</text>

        <ellipse cx="88" cy="270" rx="62" ry="50" fill="#c8ddb0" stroke="#9ec87a" strokeWidth="1.5" />
        <text x="88" y="268" textAnchor="middle" fontSize="8" fill="#3a6a30" fontWeight="700" fontFamily="sans-serif">The Park</text>
        <text x="88" y="280" textAnchor="middle" fontSize="7" fill="#4a7a40" fontFamily="sans-serif">Estate</text>

        <rect x="140" y="410" width="160" height="28" rx="4" fill="#c8ddb0" stroke="#9ec87a" strokeWidth="1" />
        <text x="220" y="427" textAnchor="middle" fontSize="7.5" fill="#3d6b35" fontWeight="600" fontFamily="sans-serif">Victoria Embankment</text>

        {/* City Blocks */}
        {[
          [155,150,60,48],[220,150,45,48],[270,150,60,48],
          [155,203,35,42],[195,203,70,42],[270,203,60,42],
          [155,250,45,45],[205,250,60,45],[270,250,60,45],
          [335,115,95,50],[335,170,95,50],[335,225,95,45],[335,275,95,50],
          [15,100,65,55],[85,100,65,55],[15,325,65,55],[85,325,65,55],[155,325,50,55],
          [15,385,75,55],[95,385,40,55],[205,325,60,55],[270,325,60,55],[335,325,95,55],
          [270,385,60,55],[335,385,95,55],
        ].map(([x,y,w,h],i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={i%3===0?"#ddd8cf":i%3===1?"#d4cfc6":"#d8d3ca"} />
        ))}

        {/* Ring road */}
        <path d="M150,92 L290,92 Q390,92 390,130 L390,300 Q390,380 310,380 L130,380 Q50,380 50,300 L50,130 Q50,92 150,92 Z"
          fill="none" stroke="#f5e0a0" strokeWidth="10" strokeLinejoin="round" />
        <path d="M150,92 L290,92 Q390,92 390,130 L390,300 Q390,380 310,380 L130,380 Q50,380 50,300 L50,130 Q50,92 150,92 Z"
          fill="none" stroke="#e8c860" strokeWidth="2.5" strokeDasharray="12,8" strokeLinejoin="round" />

        {/* Major roads */}
        {[[0,88,440,8],[0,296,440,8],[0,406,440,8]].map(([x,y,w,h],i)=><rect key={`hr${i}`} x={x} y={y} width={w} height={h} fill="#ffffff"/>)}
        {[[148,0,8,520],[216,0,8,520],[328,0,8,520]].map(([x,y,w,h],i)=><rect key={`vr${i}`} x={x} y={y} width={w} height={h} fill="#ffffff"/>)}

        {/* Medium roads */}
        <rect x="0" y="148" width="440" height="5" fill="#fffbf0" />
        <rect x="0" y="248" width="155" height="5" fill="#fffbf0" />
        <rect x="335" y="248" width="105" height="5" fill="#fffbf0" />
        <rect x="0" y="375" width="440" height="5" fill="#fffbf0" />
        <rect x="78" y="92" width="5" height="315" fill="#fffbf0" />
        <rect x="265" y="0" width="5" height="450" fill="#fffbf0" />

        {/* Diagonal roads */}
        <path d="M155,248 L90,140 L45,50" stroke="white" strokeWidth="5" fill="none" strokeLinejoin="round" />
        <path d="M265,188 L310,100 L360,28" stroke="white" strokeWidth="4.5" fill="none" strokeLinejoin="round" />
        <path d="M180,406 L260,406" stroke="#e0e0e0" strokeWidth="3" fill="none" />

        {/* Minor streets */}
        {[120,180,205,340,390].map(y => <line key={y} x1="0" y1={y} x2="440" y2={y} stroke="white" strokeWidth="2.5" opacity="0.8" />)}
        {[100,175,390,420].map(x => <line key={x} x1={x} y1="92" x2={x} y2="406" stroke="white" strokeWidth="2.5" opacity="0.8" />)}

        {/* Road badges */}
        {[{x:30,y:300,l:"A52"},{x:410,y:300,l:"A52"},{x:30,y:96,l:"A610"}].map(b=>(
          <g key={b.l+b.x}>
            <circle cx={b.x} cy={b.y} r={14} fill="white" stroke="#ccc" strokeWidth="1.5" />
            <text x={b.x} y={b.y+4} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#555" fontFamily="sans-serif">{b.l}</text>
          </g>
        ))}

        {/* Area labels */}
        {[
          {x:220,y:226,t:"City Centre",s:9,b:true},
          {x:372,y:198,t:"Sneinton",s:8,b:false},
          {x:44,y:162,t:"Radford",s:7.5,b:false},
          {x:372,y:355,t:"Carlton",s:7.5,b:false},
          {x:220,y:460,t:"The Meadows",s:8,b:false},
          {x:30,y:370,t:"Lenton",s:7.5,b:false},
          {x:190,y:358,t:"Castlegate",s:7.5,b:false},
        ].map(l=>(
          <text key={l.t} x={l.x} y={l.y} textAnchor="middle" fontSize={l.s}
                fill="#666" fontWeight={l.b?"700":"500"} fontFamily="sans-serif"
                style={{pointerEvents:"none"}}>{l.t}</text>
        ))}

        {/* Busy zones */}
        {busyZones.map(z=>(
          <g key={z.id}>
            <circle cx={z.x} cy={z.y} r={z.r} fill={`rgba(${z.multiplier>1.3?"220,60,20":z.multiplier>1.2?"230,100,10":"230,150,0"},0.18)`}/>
            <circle cx={z.x} cy={z.y} r={z.r*0.55} fill={`rgba(${z.multiplier>1.3?"210,40,5":z.multiplier>1.2?"220,80,5":"220,120,0"},0.12)`}/>
          </g>
        ))}

        {/* Order bubbles */}
        {orders.map(o=>(
          <g key={o.id} onClick={()=>onOrderTap(o)} style={{cursor:"pointer"}}>
            <circle cx={o.mapX} cy={o.mapY} r={22} fill="white"
                    style={{filter:"drop-shadow(0 3px 8px rgba(0,0,0,0.25))"}}/>
            <text x={o.mapX} y={o.mapY-2} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#111" fontFamily="sans-serif">
              {fmt(o.total)}
            </text>
            <text x={o.mapX} y={o.mapY+10} textAnchor="middle" fontSize="9">{o.restaurant.emoji}</text>
            <circle cx={o.mapX} cy={o.mapY} r={26} fill="none" stroke="#06C167" strokeWidth="2.5" opacity="0.55"
                    style={{animation:"mapPulse 1.8s ease-out infinite"}}/>
          </g>
        ))}

        {/* Driver marker */}
        {driverPhase !== "offline" && (
          <g>
            <circle cx={220} cy={280} r={28} fill="rgba(6,193,103,0.15)"/>
            <circle cx={220} cy={280} r={16} fill="#06C167" stroke="white" strokeWidth="3.5"
                    style={{filter:"drop-shadow(0 3px 10px rgba(6,193,103,0.7))"}}/>
            <circle cx={220} cy={280} r={5.5} fill="white"/>
          </g>
        )}

        {/* Surge badge on map */}
        {busyZones.length>0 && driverPhase!=="offline" && (
          <g>
            <rect x="344" y="396" width="76" height="28" rx="14" fill="#06C167"/>
            <text x="382" y="414" textAnchor="middle" fontSize="12" fontWeight="900" fill="white" fontFamily="sans-serif">
              {Math.max(...busyZones.map(z=>z.multiplier)).toFixed(1)}× surge
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
    { icon: "📬", label: "Inbox",         badge: "3",  action: () => {} },
    { icon: "👥", label: "Refer Friends", badge: null, action: () => {} },
    { icon: "⚡", label: "Opportunities", badge: "•",  action: () => {} },
    { icon: "📊", label: "Earnings",      badge: null, action: () => setPage("earnings") },
    { icon: rank.icon, label: "Uber Pro", badge: null, action: () => setPage("rank") },
    { icon: "💰", label: "Wallet",        badge: null, action: () => setPage("wallet") },
    { icon: "👤", label: "Account",       badge: null, action: () => setPage("account") },
  ];

  return (
    <>
      {isOpen && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          zIndex: 190, animation: "fadeIn 0.2s ease",
        }} />
      )}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 290,
        background: "#fff", zIndex: 200, display: "flex", flexDirection: "column",
        transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: isOpen ? "6px 0 30px rgba(0,0,0,0.18)" : "none",
      }}>
        {/* Header */}
        <div style={{ background: "#000", paddingTop: 54, paddingBottom: 22, paddingLeft: 20, paddingRight: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 62, height: 62, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
              {profile.avatar}
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>{profile.name.split(" ")[0]}</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{profile.driverCode}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                <span style={{ color: "#FFD700", fontSize: 12 }}>★</span>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>4.93</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>· {tripCount} trips</span>
              </div>
            </div>
          </div>
          {/* Rank bar */}
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{rank.icon} Uber Pro {rank.name}</span>
              {nextRank && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{nextRank.name} →</span>}
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, height: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#06C167", borderRadius: 3, width: `${pct}%`, transition: "width 0.5s ease" }} />
            </div>
            {nextRank && (
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 5 }}>
                {(nextRank.min - tripCount)} more trips to {nextRank.name}
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {!page && (
            <>
              <div style={{ padding: "6px 0" }}>
                {menuItems.map(item => (
                  <button key={item.label} onClick={item.action} style={{
                    width: "100%", background: "none", border: "none", textAlign: "left",
                    padding: "15px 22px", display: "flex", alignItems: "center", gap: 16,
                    cursor: "pointer", borderBottom: "1px solid #f5f5f5",
                  }}>
                    <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</span>
                    {item.badge && (
                      <span style={{ background: item.badge === "•" ? "#06C167" : "#276EF1", color: "white", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                        {item.badge}
                      </span>
                    )}
                    <span style={{ color: "#ccc", fontSize: 16 }}>›</span>
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 22px", borderTop: "1px solid #f0f0f0", marginTop: 4 }}>
                <div style={{ color: "#aaa", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Help</div>
                <div style={{ color: "#444", fontSize: 14, marginBottom: 10, cursor: "pointer" }}>Learning Center</div>
                <div style={{ color: "#444", fontSize: 14, cursor: "pointer" }}>Support</div>
              </div>
            </>
          )}

          {page === "earnings" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Earnings</div>
              <div style={{ background: "#f8f8f8", borderRadius: 16, padding: "20px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 4, fontWeight: 600 }}>Total Earned</div>
                <div style={{ color: "#06C167", fontWeight: 900, fontSize: 36 }}>{fmt(earnings)}</div>
                <div style={{ color: "#bbb", fontSize: 12, marginTop: 4 }}>{tripCount} deliveries</div>
              </div>
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                {[["Today", fmt(earnings)], ["This Week", fmt(earnings * 4.2)], ["Avg/hr", fmt(earnings > 0 ? earnings / Math.max(1, tripCount) * 3.5 : 0)]].map(([l, v]) => (
                  <div key={l} style={{ flex: 1, background: "#f8f8f8", borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{v}</div>
                    <div style={{ color: "#aaa", fontSize: 10, marginTop: 2 }}>{l}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { onCashOut(); setPage(null); }} disabled={earnings <= 0} style={{
                width: "100%", background: earnings > 0 ? "#06C167" : "#f0f0f0",
                border: "none", borderRadius: 100, color: earnings > 0 ? "#fff" : "#bbb",
                fontWeight: 800, fontSize: 16, padding: "16px", cursor: earnings > 0 ? "pointer" : "default",
              }}>
                Cash Out {earnings > 0 ? fmt(earnings) : ""}
              </button>
            </div>
          )}

          {page === "rank" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Uber Pro Status</div>
              {RANKS.map(r => {
                const active = r.name === rank.name;
                const completed = tripCount >= (r.max ?? Infinity) || active;
                return (
                  <div key={r.name} style={{
                    background: active ? r.gradient : "#f8f8f8", borderRadius: 14, padding: "14px 16px",
                    marginBottom: 10, border: active ? "none" : "1px solid #eee", opacity: completed || active ? 1 : 0.5,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: active ? "#fff" : "#1a1a1a" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.6)" : "#aaa", marginTop: 2 }}>{r.min}–{r.max ?? "∞"} trips</div>
                      </div>
                      {active && <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "3px 10px" }}>Current</span>}
                    </div>
                    {active && (
                      <div style={{ marginTop: 10 }}>
                        {r.perks.map(p => <div key={p} style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 4 }}>✓ {p}</div>)}
                        {nextRank && (
                          <div style={{ marginTop: 10 }}>
                            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 5 }}>
                              {nextRank.min - tripCount} trips to {nextRank.name}
                            </div>
                            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 3, height: 4 }}>
                              <div style={{ height: "100%", background: "white", borderRadius: 3, width: `${pct}%` }} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {page === "wallet" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Wallet</div>
              <div style={{ background: "linear-gradient(135deg,#000,#1a1a1a)", borderRadius: 18, padding: "24px", marginBottom: 16, textAlign: "center" }}>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 8 }}>Available Balance</div>
                <div style={{ color: "#06C167", fontWeight: 900, fontSize: 38 }}>{fmt(earnings)}</div>
                <button onClick={() => { onCashOut(); setPage(null); }} disabled={earnings <= 0} style={{
                  marginTop: 16, background: earnings > 0 ? "#06C167" : "#333",
                  border: "none", borderRadius: 100, color: "#fff", fontWeight: 700,
                  fontSize: 14, padding: "12px 28px", cursor: earnings > 0 ? "pointer" : "default",
                }}>Cash Out Instantly</button>
              </div>
              <div style={{ color: "#aaa", fontSize: 13 }}>
                Earnings are typically transferred within minutes via Instant Pay.
              </div>
            </div>
          )}

          {page === "account" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 6 }}>Account</div>
              <div style={{ color: "#aaa", fontSize: 12, fontFamily: "monospace", marginBottom: 20 }}>{profile.driverCode}</div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 6 }}>Display Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #e8e8e8", borderRadius: 10, padding: "13px", fontSize: 15, marginBottom: 16, outline: "none" }} />

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Avatar</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {AVATARS.map(a => (
                  <button key={a} onClick={() => setEditAvatar(a)} style={{
                    width: 42, height: 42, borderRadius: 10, border: editAvatar === a ? "2px solid #06C167" : "2px solid #e8e8e8",
                    background: editAvatar === a ? "#06C16710" : "white", fontSize: 20, cursor: "pointer",
                  }}>{a}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Vehicle</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {VEHICLES.map(v => (
                  <button key={v.emoji} onClick={() => setEditVehicle(v.emoji)} style={{
                    flex: 1, padding: "10px 4px", borderRadius: 10, border: editVehicle === v.emoji ? "2px solid #06C167" : "2px solid #e8e8e8",
                    background: editVehicle === v.emoji ? "#06C16710" : "white", fontSize: 18, cursor: "pointer",
                  }}>{v.emoji}</button>
                ))}
              </div>

              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>City</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {CITIES.map(c => (
                  <button key={c} onClick={() => setEditCity(c)} style={{
                    padding: "12px 14px", borderRadius: 10, border: editCity === c ? "2px solid #06C167" : "2px solid #e8e8e8",
                    background: editCity === c ? "#06C16710" : "white", textAlign: "left",
                    fontSize: 14, fontWeight: editCity === c ? 700 : 400, color: "#1a1a1a", cursor: "pointer",
                  }}>{c}</button>
                ))}
              </div>

              <button onClick={saveProfile} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "white", fontWeight: 800, fontSize: 15, padding: "16px", cursor: "pointer" }}>
                {saveMsg || "Save Changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Order Request Timer ───────────────────────────────────────────────────────

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = seconds / total;
  const offset = circ * (1 - pct);
  const color = seconds > total * 0.4 ? "#06C167" : seconds > total * 0.2 ? "#FF9500" : "#FF3B30";
  return (
    <div style={{ position: "relative", width: 64, height: 64, flexShrink: 0 }}>
      <svg width="64" height="64" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4.5"/>
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="4.5"
                strokeDasharray={circ} strokeDashoffset={offset}
                strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color, fontWeight: 900, fontSize: 18, letterSpacing: "-0.5px" }}>{seconds}</span>
      </div>
    </div>
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
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,#050510 0%,#0d1020 40%,#141420 100%)" }} />
      <Skyline />
      {/* Road surface */}
      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "46%", top: "30%" }}>
        <div style={{ position: "absolute", inset: 0, background: "#1a1a1e" }} />
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: "#FFD700", opacity: 0.55 }} />
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 5, background: "#FFD700", opacity: 0.55 }} />
        <div style={{
          position: "absolute", left: "50%", top: 0, bottom: 0, width: 3, transform: "translateX(-50%)",
          backgroundImage: "repeating-linear-gradient(to bottom, #fff 0px, #fff 28px, transparent 28px, transparent 56px)",
          backgroundSize: "3px 56px",
          animation: moving ? "roadScroll 1.4s linear infinite" : "none",
          opacity: 0.3,
        }} />
        {(moving || atRest) && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${100 - progress}%`, background: `linear-gradient(to top, ${destColor}20, transparent)`, transition: "height 0.3s ease" }} />
        )}
      </div>
      {/* Sidewalks */}
      {["-30%", "76%"].map((left, i) => (
        <div key={i} style={{ position: "absolute", top: "30%", bottom: 0, left, width: "7%" }}>
          <div style={{ position: "absolute", inset: 0, background: "#141418", backgroundImage: "repeating-linear-gradient(to bottom, #1e1e24 0px, #1e1e24 20px, transparent 20px, transparent 40px)", animation: moving ? "roadScroll 1.4s linear infinite" : "none", opacity: 0.7 }} />
        </div>
      ))}
      {/* Destination indicator */}
      {order && (phase === "to-restaurant" || phase === "at-restaurant" || phase === "to-customer") && (
        <div style={{ position: "absolute", top: "7%", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, animation: "fadeIn 0.5s ease", zIndex: 10 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: destColor + "22", border: `2px solid ${destColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, boxShadow: `0 0 24px ${destColor}55`, animation: atRest ? "glow 1.5s ease-in-out infinite alternate" : "none" }}>{destEmoji}</div>
          <div style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", border: `1px solid ${destColor}55`, borderRadius: 10, padding: "5px 14px", color: "#fff", fontSize: 12, fontWeight: 600 }}>{destLabel}</div>
        </div>
      )}
      {/* Progress bar */}
      {moving && (
        <div style={{ position: "absolute", top: "52%", left: "50%", transform: "translateX(-50%)", width: "42%" }}>
          <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 4, height: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 4, background: destColor, width: `${progress}%`, transition: "width 0.3s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Start</span>
            <span style={{ color: destColor, fontSize: 10, fontWeight: 700 }}>{Math.round(progress)}%</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 10 }}>Dest</span>
          </div>
        </div>
      )}
      {/* Vehicle */}
      <div style={{
        position: "absolute",
        bottom: atRest ? "70%" : (moving ? `${20 + progress * 0.52}%` : "22%"),
        left: "50%", transform: "translateX(-50%)",
        transition: "bottom 0.3s ease", zIndex: 20,
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.9))",
        animation: moving ? "carBounce 0.35s ease-in-out infinite alternate" : "none",
        fontSize: 38, lineHeight: 1,
      }}>{vehicleEmoji}</div>
      {/* Headlights */}
      {moving && <div style={{ position: "absolute", bottom: `${22 + progress * 0.52 + 5}%`, left: "50%", transform: "translateX(-50%)", width: 56, height: 90, background: "linear-gradient(to top, rgba(255,245,160,0.12), transparent)", clipPath: "polygon(18% 100%, 82% 100%, 100% 0%, 0% 0%)", zIndex: 15 }} />}
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
    <div style={{ position: "absolute", bottom: "30%", left: 0, right: 0, height: 160, overflow: "hidden" }}>
      {buildings.map((b, i) => (
        <div key={i} style={{
          position: "absolute", bottom: 0, left: b.left, width: b.w, height: b.h,
          background: `hsl(${225 + i * 5}, 20%, ${7 + (i % 4) * 2}%)`,
          borderTop: "1px solid rgba(255,255,255,0.03)",
        }}>
          {Array.from({ length: Math.floor(b.h / 14) }).map((_, j) => (
            Math.random() > 0.6 ? (
              <div key={j} style={{ position: "absolute", left: 4, top: j * 14 + 3, width: 4, height: 5, background: "#FFD70040", borderRadius: 1 }} />
            ) : null
          ))}
        </div>
      ))}
    </div>
  );
}

function AtRestaurantOverlay({ order }: { order: Order }) {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", zIndex: 30 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 10 }}>{order.restaurant.emoji}</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20 }}>Arrived!</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 5 }}>Collect from {order.restaurant.name}</div>
      </div>
    </div>
  );
}

function DeliveredOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)", zIndex: 30 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
        <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20 }}>Delivered!</div>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ background: "#111", borderRadius: 22, padding: "30px 24px", width: "100%", maxWidth: 360, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 18px" }}>🔒</div>
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, textAlign: "center", marginBottom: 6, letterSpacing: "-0.3px" }}>Identity Check</div>
        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", marginBottom: 24 }}>Enter your driver code to continue</div>
        <input autoFocus value={input} onChange={e => { setInput(e.target.value.toUpperCase()); setError(""); }}
          placeholder="DRV-000000" onKeyDown={e => e.key === "Enter" && input.trim() && handleVerify()}
          style={{ width: "100%", boxSizing: "border-box", background: "#1a1a1a", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px", color: "#fff", fontSize: 18, fontWeight: 700, caretColor: "#06C167", fontFamily: "monospace", letterSpacing: "0.08em" }} />
        {error && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <button onClick={handleVerify} disabled={!input.trim() || attempts >= 3} style={{ width: "100%", marginTop: 16, background: input.trim() && attempts < 3 ? "#06C167" : "#222", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px", cursor: input.trim() && attempts < 3 ? "pointer" : "default" }}>
          Verify Identity
        </button>
      </div>
    </div>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#111", borderRadius: "20px 20px 0 0", boxShadow: "0 -6px 30px rgba(0,0,0,0.5)", animation: "slideUp 0.22s ease" }}>
      <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 2, margin: "12px auto 14px" }} />
      {children}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#1a1a1a", borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{value}</div>
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function NavPanel({ direction, order, progress }: { direction: "to-restaurant" | "to-customer"; order: Order; progress: number }) {
  const toRest = direction === "to-restaurant";
  const color = toRest ? "#06C167" : "#276EF1";
  return (
    <Panel>
      <div style={{ padding: "0 16px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>{toRest ? "Go to restaurant" : "Head to customer"}</span>
          <span style={{ marginLeft: "auto", color, fontWeight: 700, fontSize: 13 }}>{Math.round(progress)}%</span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 4, overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", borderRadius: 4, background: color, width: `${progress}%`, transition: "width 0.3s ease" }} />
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: toRest ? (order.restaurant.color + "22") : "#276EF122", border: `1.5px solid ${color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
            {toRest ? order.restaurant.emoji : "🏠"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>{toRest ? "Pickup at" : "Deliver to"}</div>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 500, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toRest ? order.restaurant.address : order.customer.address}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: "#06C167", fontWeight: 800, fontSize: 14 }}>{fmt(order.total)}</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 10, marginTop: 1 }}>{order.distance}</div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function PickupPanel({ order, onPickedUp }: { order: Order; onPickedUp: () => void }) {
  return (
    <Panel>
      <div style={{ padding: "0 16px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: order.restaurant.color + "22", border: `1.5px solid ${order.restaurant.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
            {order.restaurant.emoji}
          </div>
          <div>
            <div style={{ color: "#06C167", fontWeight: 800, fontSize: 17 }}>You've arrived!</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>Collect from {order.restaurant.name}</div>
          </div>
        </div>
        <div style={{ background: "#1a1a1a", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < order.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{item.name}</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>{fmt(item.price)}</span>
            </div>
          ))}
        </div>
        <button className="ubtn" onClick={onPickedUp} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px" }}>
          Picked Up · Start Delivery
        </button>
      </div>
    </Panel>
  );
}

function DeliveredPanel({ order, tip, rankedUp, onNext }: { order: Order; tip: number; rankedUp: Rank | null; onNext: () => void }) {
  const total = (order.total + tip).toFixed(2);
  return (
    <Panel>
      <div style={{ padding: "0 16px 24px" }}>
        {rankedUp ? (
          <div style={{ background: rankedUp.gradient, borderRadius: 14, padding: "16px", marginBottom: 16, textAlign: "center", animation: "rankUp 0.5s ease", boxShadow: `0 0 28px ${rankedUp.color}66` }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{rankedUp.icon}</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Rank Up! You're now {rankedUp.name}</div>
            {rankedUp.perks.map(p => <div key={p} style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 }}>✓ {p}</div>)}
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Delivery Complete!</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 4 }}>Delivered to {order.customer.name}</div>
          </div>
        )}
        <div style={{ background: "#1a1a1a", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Delivery fare</span>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{fmt(order.total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Tip</span>
            <span style={{ color: tip > 0 ? "#06C167" : "rgba(255,255,255,0.25)", fontWeight: 600, fontSize: 13 }}>{fmt(tip)}</span>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Total earned</span>
            <span style={{ color: "#06C167", fontWeight: 900, fontSize: 22 }}>£{total}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <StatCard label="Distance" value={order.distance} />
          <StatCard label="Duration" value={order.duration} />
          <StatCard label="Rating" value={`${order.customer.rating}★`} />
        </div>
        <button className="ubtn" onClick={onNext} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "16px" }}>
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
  const orderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  const [orderTimer, setOrderTimer] = useState(0);
  const ORDER_TIMEOUT = 15;

  const isBusy = busyZones.length >= 2;
  const maxMultiplier = busyZones.length > 0 ? Math.max(...busyZones.map(z => z.multiplier)) : 1;

  useEffect(() => {
    const raw = localStorage.getItem(stateKey);
    const state = raw ? JSON.parse(raw) : {};
    state.totalEarnings = totalEarnings;
    state.tripCount = tripCount;
    localStorage.setItem(stateKey, JSON.stringify(state));
  }, [totalEarnings, tripCount]);

  useEffect(() => {
    if (phase === "offline") {
      if (sessionTimerRef.current) { clearInterval(sessionTimerRef.current); sessionTimerRef.current = null; }
    } else if (!sessionTimerRef.current) {
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    }
  }, [phase]);

  useEffect(() => {
    if (phase === "offline") return;
    setBusyZones(pickBusyZones());
    const iv = setInterval(() => setBusyZones(pickBusyZones()), 45000);
    return () => clearInterval(iv);
  }, [phase === "offline"]);

  // Order countdown timer
  useEffect(() => {
    if (phase === "selecting") {
      setOrderTimer(ORDER_TIMEOUT);
      if (orderTimerRef.current) clearInterval(orderTimerRef.current);
      orderTimerRef.current = setInterval(() => {
        setOrderTimer(t => {
          if (t <= 1) {
            if (orderTimerRef.current) clearInterval(orderTimerRef.current);
            // auto-decline all orders
            setSelectedOrderCard(null);
            setAvailableOrders([]);
            phaseRef.current = "online";
            setPhase("online");
            scheduleNextOrders();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      if (orderTimerRef.current) { clearInterval(orderTimerRef.current); orderTimerRef.current = null; }
    }
    return () => { if (orderTimerRef.current) clearInterval(orderTimerRef.current); };
  }, [phase === "selecting"]);

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
    startCooldown(cooldownSecs, () => {
      if (phaseRef.current === "online") spawnOrders();
    });
  }, [isBusy, spawnOrders]);

  function handleGoOnline() {
    phaseRef.current = "online";
    setPhase("online");
    setBusyZones(pickBusyZones());
    playTap();
    startCooldown(8, () => {
      if (phaseRef.current === "online") spawnOrders();
    });
  }

  function handleGoOffline() {
    if (moveInterval.current) clearInterval(moveInterval.current);
    if (orderSpawnTimeout.current) clearTimeout(orderSpawnTimeout.current);
    if (cooldownInterval) clearInterval(cooldownInterval);
    if (orderTimerRef.current) clearInterval(orderTimerRef.current);
    phaseRef.current = "offline";
    setPhase("offline");
    setAvailableOrders([]);
    setSelectedOrderCard(null);
    setCooldownSec(0);
    playTap();
  }

  function handleAcceptOrder(order: Order) {
    if (orderTimerRef.current) clearInterval(orderTimerRef.current);
    setSelectedOrderCard(null);
    setAvailableOrders([]);
    setActiveOrder(order);
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    progressRef.current = 0;
    setProgress(0);
    playAccept();

    // Check if verification needed
    const raw = localStorage.getItem(stateKey);
    const state = raw ? JSON.parse(raw) : {};
    const count = (state.tripCount ?? 0);
    if (count > 0 && count % 3 === 0) {
      setShowVerification(true);
    }

    startMovement("to-restaurant", order);
  }

  function startMovement(dir: "to-restaurant" | "to-customer", order: Order) {
    if (moveInterval.current) clearInterval(moveInterval.current);
    progressRef.current = 0;
    setProgress(0);
    const duration = parseInt(pick(DURATIONS)) * 1000 * 0.6;
    const steps = 80;
    const stepTime = duration / steps;
    let step = 0;
    moveInterval.current = setInterval(() => {
      step++;
      const p = Math.min(100, (step / steps) * 100);
      progressRef.current = p;
      setProgress(p);
      if (p >= 100) {
        clearInterval(moveInterval.current!);
        if (dir === "to-restaurant") {
          phaseRef.current = "at-restaurant";
          setPhase("at-restaurant");
          playArrived();
        } else {
          phaseRef.current = "delivered";
          setPhase("delivered");
          const tip = pick(TIPS);
          setCurrentTip(tip);
          const earned = parseFloat((order.total + tip).toFixed(2));
          setTotalEarnings(prev => parseFloat((prev + earned).toFixed(2)));
          const newCount = tripCount + 1;
          setTripCount(newCount);
          const prevRank = getRank(tripCount);
          const newRank = getRank(newCount);
          if (newRank.name !== prevRank.name) {
            setRankedUp(newRank);
            playRankUp();
          } else {
            setRankedUp(null);
            playDelivered();
          }
        }
      }
    }, stepTime);
  }

  function handlePickedUp() {
    phaseRef.current = "to-customer";
    setPhase("to-customer");
    progressRef.current = 0;
    setProgress(0);
    if (activeOrder) startMovement("to-customer", activeOrder);
  }

  function handleNextAfterDelivery() {
    setActiveOrder(null);
    scheduleNextOrders();
  }

  function handleVerificationSuccess() {
    setShowVerification(false);
  }

  function handleVerificationFail() {
    setShowVerification(false);
    handleGoOffline();
  }

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
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", fontFamily: "'Inter',-apple-system,sans-serif", background: "#000", overflow: "hidden" }}>

      {showVerification && (
        <VerificationModal driverCode={profile.driverCode} onSuccess={handleVerificationSuccess} onFail={handleVerificationFail} />
      )}

      <SideMenu isOpen={sideMenuOpen} profile={profile} earnings={totalEarnings} tripCount={tripCount}
        onClose={() => setSideMenuOpen(false)} onUpdateProfile={handleUpdateProfile}
        onCashOut={handleCashOut} stateKey={stateKey} />

      {/* Cash Out Toast */}
      {showCashOutMsg && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: "#06C167", borderRadius: 100, padding: "12px 22px", color: "#fff", fontWeight: 700, fontSize: 14, zIndex: 400, boxShadow: "0 4px 20px rgba(6,193,103,0.5)", whiteSpace: "nowrap", animation: "slideUp 0.25s ease" }}>
          💸 {showCashOutMsg}
        </div>
      )}

      {/* MAP VIEW */}
      {isMapPhase && (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <CityMap busyZones={busyZones} orders={availableOrders} driverPhase={phase} onOrderTap={o => setSelectedOrderCard(o)} />

          {/* Status bar / Top bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {/* Menu button */}
            <button onClick={() => setSideMenuOpen(true)} style={{ width: 42, height: 42, borderRadius: "50%", background: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 12px rgba(0,0,0,0.18)", flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 2, background: "#1a1a1a", borderRadius: 2 }} />)}
              </div>
            </button>

            {/* Uber Eats Driver badge */}
            <div style={{ background: "white", borderRadius: 20, padding: "7px 14px", boxShadow: "0 2px 12px rgba(0,0,0,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "#06C167", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 900 }}>U</span>
              </div>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#1a1a1a" }}>Eats Driver</span>
            </div>

            {/* Earnings + surge */}
            <div style={{ display: "flex", gap: 8 }}>
              {busyZones.length > 0 && phase !== "offline" && (
                <div style={{ background: "#FFF3E0", border: "1.5px solid #FF8C00", borderRadius: 20, padding: "7px 12px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                  <div style={{ fontSize: 12, color: "#D84315", fontWeight: 900 }}>⚡ {maxMultiplier.toFixed(1)}×</div>
                </div>
              )}
              <div style={{ background: "white", borderRadius: 20, padding: "7px 14px", boxShadow: "0 2px 12px rgba(0,0,0,0.15)", textAlign: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: "#1a1a1a", lineHeight: 1 }}>{fmt(totalEarnings)}</div>
                <div style={{ fontSize: 9, color: "#aaa", fontWeight: 700, letterSpacing: "0.5px", marginTop: 2 }}>TODAY</div>
              </div>
            </div>
          </div>

          {/* Busy zone labels */}
          {phase !== "offline" && busyZones.map(z => (
            <div key={z.id} style={{
              position: "absolute",
              top: `${(z.y / 520) * 100}%`,
              left: `${(z.x / 440) * 100}%`,
              transform: "translate(-50%, -50%)",
              background: "rgba(210,60,0,0.85)", color: "white",
              borderRadius: 12, padding: "3px 10px", fontSize: 9.5, fontWeight: 700,
              pointerEvents: "none", whiteSpace: "nowrap",
              boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
            }}>{z.label} {z.multiplier.toFixed(1)}×</div>
          ))}

          {/* Bottom bar */}
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ebebeb", borderRadius: "16px 16px 0 0", boxShadow: "0 -2px 20px rgba(0,0,0,0.1)" }}>
            {phase === "online" && cooldownSec > 0 && (
              <div style={{ textAlign: "center", paddingTop: 12, paddingBottom: 2, color: "#888", fontSize: 12 }}>
                Next orders in <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{cooldownSec}s</span>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
              <button onClick={() => setSideMenuOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
                  <div style={{ width: 18, height: 2, background: "#444", borderRadius: 2 }} />
                  <div style={{ width: 14, height: 2, background: "#888", borderRadius: 2 }} />
                  <div style={{ width: 18, height: 2, background: "#444", borderRadius: 2 }} />
                </div>
              </button>

              {phase === "offline" ? (
                <button onClick={handleGoOnline} style={{ background: "#06C167", border: "none", borderRadius: 100, color: "white", fontWeight: 800, fontSize: 16, padding: "14px 40px", cursor: "pointer", boxShadow: "0 4px 20px rgba(6,193,103,0.45)", letterSpacing: "-0.2px" }}>
                  Go Online
                </button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#06C167", animation: "pulse 1.5s ease-in-out infinite", boxShadow: "0 0 0 3px rgba(6,193,103,0.2)" }} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>You're Online</span>
                </div>
              )}

              {phase !== "offline" ? (
                <button onClick={handleGoOffline} style={{ background: "none", border: "1.5px solid #e0e0e0", borderRadius: 100, color: "#666", fontWeight: 700, fontSize: 12, padding: "8px 16px", cursor: "pointer" }}>
                  Pause
                </button>
              ) : (
                <div style={{ width: 44 }} />
              )}
            </div>

            {/* Stats strip */}
            <div style={{ display: "flex", gap: 0, paddingBottom: 16, paddingLeft: 16, paddingRight: 16, borderTop: "1px solid #f5f5f5" }}>
              {[
                { v: String(tripCount), l: "Trips" },
                { v: fmt(totalEarnings), l: "Earned" },
                { v: fmtTime(sessionTime), l: "Online" },
                { v: `${rank.icon} ${rank.name}`, l: "Pro Status" },
              ].map((s, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", paddingTop: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: i === 1 ? "#06C167" : "#1a1a1a" }}>{s.v}</div>
                  <div style={{ fontSize: 9.5, color: "#bbb", marginTop: 2, fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ORDER SELECTION SHEET */}
      {phase === "selecting" && availableOrders.length > 0 && !selectedOrderCard && (
        <div style={{ position: "absolute", bottom: 100, left: 0, right: 0, zIndex: 20, padding: "0 14px", animation: "slideUp 0.25s ease" }}>
          <div style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
              {availableOrders.length} order{availableOrders.length !== 1 ? "s" : ""} nearby
            </span>
            <CountdownRing seconds={orderTimer} total={ORDER_TIMEOUT} />
          </div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {availableOrders.map(o => (
              <div key={o.id} onClick={() => setSelectedOrderCard(o)} style={{
                background: "white", borderRadius: 18, padding: "14px 16px", minWidth: 180, flexShrink: 0,
                boxShadow: "0 6px 24px rgba(0,0,0,0.35)", cursor: "pointer",
                transition: "transform 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: o.restaurant.color + "18", border: `1.5px solid ${o.restaurant.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{o.restaurant.emoji}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>{o.restaurant.name}</div>
                    <div style={{ fontSize: 11, color: "#999" }}>{o.duration} · {o.distance}</div>
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 22, color: "#06C167", letterSpacing: "-0.5px" }}>{fmt(o.total)}</div>
                <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{o.items.length} item{o.items.length !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ORDER DETAIL MODAL */}
      {selectedOrderCard && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 150, display: "flex", alignItems: "flex-end", animation: "fadeIn 0.2s ease" }}>
          <div style={{ background: "#111", borderRadius: "22px 22px 0 0", padding: "0 0 36px", width: "100%", animation: "slideUp 0.25s ease" }}>
            <div style={{ width: 36, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, margin: "14px auto 0" }} />

            {/* Header with timer */}
            <div style={{ padding: "16px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>New Delivery Request</div>
                <div style={{ color: "#06C167", fontWeight: 900, fontSize: 30, letterSpacing: "-1px" }}>{fmt(selectedOrderCard.total)}</div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>{selectedOrderCard.duration} · {selectedOrderCard.distance}</div>
              </div>
              <CountdownRing seconds={orderTimer} total={ORDER_TIMEOUT} />
            </div>

            <div style={{ padding: "14px 20px" }}>
              {/* Restaurant + items */}
              <div style={{ background: "#1a1a1a", borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: selectedOrderCard.restaurant.color + "22", border: `1.5px solid ${selectedOrderCard.restaurant.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{selectedOrderCard.restaurant.emoji}</div>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{selectedOrderCard.restaurant.name}</div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{selectedOrderCard.restaurant.address}</div>
                  </div>
                </div>
                {selectedOrderCard.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>· {item.name}</span>
                    <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>{fmt(item.price)}</span>
                  </div>
                ))}
              </div>

              {/* Route */}
              <div style={{ background: "#1a1a1a", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 14px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#06C167", flexShrink: 0 }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Pickup</div>
                    <div style={{ color: "#fff", fontSize: 12, marginTop: 1 }}>{selectedOrderCard.restaurant.address}</div>
                  </div>
                </div>
                <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "0 14px" }} />
                <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 14px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: "#276EF1", flexShrink: 0 }} />
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>Dropoff</div>
                    <div style={{ color: "#fff", fontSize: 12, marginTop: 1 }}>{selectedOrderCard.customer.address}</div>
                  </div>
                  <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{selectedOrderCard.customer.rating}⭐ · {selectedOrderCard.customer.name}</div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => {
                  setSelectedOrderCard(null);
                  const remaining = availableOrders.filter(o => o.id !== selectedOrderCard.id);
                  setAvailableOrders(remaining);
                  if (remaining.length === 0) { playDecline(); scheduleNextOrders(); }
                }} style={{ width: 54, height: 54, background: "#1a1a1a", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 14, color: "#FF3B30", fontSize: 20, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <button className="ubtn" onClick={() => handleAcceptOrder(selectedOrderCard)} style={{ flex: 1, background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer", letterSpacing: "-0.2px" }}>
                  Accept
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELIVERY VIEW */}
      {isDeliveryPhase && (
        <>
          {/* Delivery top bar */}
          <div style={{ flexShrink: 0, background: "#000", borderBottom: "1px solid rgba(255,255,255,0.05)", padding: "10px 16px", display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ background: "#111", borderRadius: 10, padding: "7px 11px", display: "flex", alignItems: "center", gap: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: 16 }}>{profile.avatar}</span>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>{profile.name.split(" ")[0]}</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>{profile.vehicleEmoji} {profile.vehicle}</div>
              </div>
            </div>
            <div style={{ background: rank.gradient, borderRadius: 10, padding: "7px 12px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 13 }}>{rank.icon}</span>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 11 }}>{rank.name}</span>
            </div>
            <div style={{ flex: 1, display: "flex", gap: 0, background: "#111", borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ flex: 1, padding: "7px 10px" }}>
                <div style={{ color: "#06C167", fontWeight: 800, fontSize: 14 }}>{fmt(totalEarnings)}</div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, textTransform: "uppercase" }}>Earnings</div>
              </div>
              <div style={{ width: 1, background: "rgba(255,255,255,0.06)" }} />
              <div style={{ flex: 1, padding: "7px 10px" }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 14 }}>{tripCount}</div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, textTransform: "uppercase" }}>Trips</div>
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
        @keyframes slideUp    { from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn     { from{opacity:0}to{opacity:1} }
        @keyframes roadScroll { from{background-position-y:0}to{background-position-y:56px} }
        @keyframes carBounce  { from{transform:translateX(-50%) translateY(0)}to{transform:translateX(-50%) translateY(-4px)} }
        @keyframes glow       { from{box-shadow:0 0 12px currentColor}to{box-shadow:0 0 28px currentColor,0 0 50px currentColor} }
        @keyframes pulse      { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes rankUp     { 0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        @keyframes spin       { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes mapPulse   { 0%{r:26;opacity:0.6}100%{r:40;opacity:0} }
        .ubtn{transition:all 0.15s ease;cursor:pointer}
        .ubtn:hover{filter:brightness(0.9)}
        .ubtn:active{transform:scale(0.97)}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
