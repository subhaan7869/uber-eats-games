import { useEffect, useRef, useState, useCallback } from "react";
import { playNewOrder, playAccept, playDecline, playArrived, playDelivered, playRankUp, playTap } from "../sounds";
import type { DriverProfile } from "./Onboarding";

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "offline" | "online" | "selecting" | "to-restaurant" | "at-restaurant" | "to-customer" | "delivered";

interface MenuItem { name: string; price: number; }
interface Restaurant { name: string; emoji: string; color: string; address: string; fullAddress: string; menu: MenuItem[]; prepMin: number; prepMax: number; mapX: number; mapY: number; }
interface Customer { name: string; rating: number; address: string; fullAddress: string; orders: number; mapX: number; mapY: number; }
interface Order {
  id: string; restaurant: Restaurant; customer: Customer; items: MenuItem[];
  total: number; distance: string; duration: string; tip: number;
  mapX: number; mapY: number;
  distToRestaurant: number;   // miles, driver → restaurant
  distToCustomer: number;     // miles, restaurant → customer
  prepTime: number;           // minutes restaurant needs to prepare
  surgeMultiplier: number;
  matchReason: string;        // "Near you" | "High fare" | "Surge zone" | "Priority match"
  isHighValue: boolean;
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

// Map scale: 440px wide ≈ 5 miles  →  1px ≈ 0.01136 miles
const MILES_PER_PX = 5 / 440;
const DRIVER_HOME: { x: number; y: number } = { x: 220, y: 270 }; // centre of map

function pxDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}
function miDist(ax: number, ay: number, bx: number, by: number): number {
  return parseFloat((pxDist(ax, ay, bx, by) * MILES_PER_PX).toFixed(1));
}
// Speed assumptions: ~15 mph in city traffic → 1 mile ≈ 4 min
function miToMin(miles: number): number {
  return Math.max(2, Math.round(miles * 4));
}

const RESTAURANTS: Restaurant[] = [
  { name: "McDonald's",  emoji: "🍔", color: "#DA291C",
    address: "Market Square",       fullAddress: "Market Square, Nottingham NG1 2GG",
    prepMin: 4, prepMax: 8,  mapX: 210, mapY: 230,
    menu: [{ name: "Big Mac Meal", price: 7.49 }, { name: "McFlurry", price: 2.19 }, { name: "McNuggets ×6", price: 4.39 }] },
  { name: "Burger King", emoji: "👑", color: "#D62300",
    address: "Upper Parliament St", fullAddress: "15 Upper Parliament St, Nottingham NG1 2AD",
    prepMin: 5, prepMax: 9,  mapX: 240, mapY: 200,
    menu: [{ name: "Whopper Meal", price: 8.29 }, { name: "Chicken Royale", price: 6.49 }, { name: "Onion Rings", price: 2.49 }] },
  { name: "KFC",         emoji: "🍗", color: "#E4002B",
    address: "Clumber Street",      fullAddress: "12 Clumber St, Nottingham NG1 3ED",
    prepMin: 6, prepMax: 10, mapX: 275, mapY: 245,
    menu: [{ name: "Zinger Burger Meal", price: 7.99 }, { name: "Bucket for One", price: 9.49 }, { name: "Popcorn Chicken", price: 3.99 }] },
  { name: "Pizza Hut",   emoji: "🍕", color: "#EE3124",
    address: "Victoria Centre",     fullAddress: "Victoria Centre, Nottingham NG1 3QN",
    prepMin: 15, prepMax: 22, mapX: 230, mapY: 170,
    menu: [{ name: "Pepperoni Passion (M)", price: 13.99 }, { name: "BBQ Chicken (M)", price: 13.49 }, { name: "Dough Balls ×8", price: 4.99 }] },
  { name: "Nando's",     emoji: "🔥", color: "#C8102E",
    address: "Trinity Square",      fullAddress: "Trinity Square, Nottingham NG1 4AE",
    prepMin: 12, prepMax: 18, mapX: 195, mapY: 255,
    menu: [{ name: "½ Chicken (Hot)", price: 9.75 }, { name: "Peri Peri Wrap", price: 8.25 }, { name: "Peri Fries", price: 3.75 }] },
  { name: "Subway",      emoji: "🥖", color: "#009A44",
    address: "Derby Road",          fullAddress: "45 Derby Rd, Nottingham NG1 5FT",
    prepMin: 3, prepMax: 6,  mapX: 130, mapY: 220,
    menu: [{ name: "Footlong Meatball", price: 7.49 }, { name: "6\" BMT", price: 5.99 }, { name: "Veggie Delite", price: 5.49 }] },
  { name: "Wagamama",    emoji: "🍜", color: "#A00000",
    address: "Cornerhouse",         fullAddress: "1 Burton St, Nottingham NG1 4DB",
    prepMin: 14, prepMax: 20, mapX: 260, mapY: 210,
    menu: [{ name: "Chicken Katsu Curry", price: 13.50 }, { name: "Ramen Noodle Bowl", price: 12.95 }, { name: "Gyoza ×6", price: 6.50 }] },
  { name: "Greggs",      emoji: "🥐", color: "#0066CC",
    address: "Mansfield Road",      fullAddress: "88 Mansfield Rd, Nottingham NG1 3HL",
    prepMin: 2, prepMax: 5,  mapX: 300, mapY: 155,
    menu: [{ name: "Sausage Roll", price: 1.35 }, { name: "Steak Bake", price: 1.75 }, { name: "Latte", price: 1.75 }] },
  { name: "Five Guys",   emoji: "🍟", color: "#CF2027",
    address: "Long Row West",       fullAddress: "20 Long Row W, Nottingham NG1 2EQ",
    prepMin: 8, prepMax: 14, mapX: 250, mapY: 235,
    menu: [{ name: "Bacon Cheeseburger", price: 10.95 }, { name: "Little Fries", price: 3.75 }, { name: "Milkshake", price: 5.49 }] },
];

const CUSTOMERS: Customer[] = [
  { name: "James R.",  rating: 4.92, orders: 347, address: "42 Castle Blvd, NG7",   fullAddress: "42 Castle Blvd, Nottingham NG7 1FB",   mapX: 105, mapY: 300 },
  { name: "Sophie M.", rating: 4.85, orders: 182, address: "17 Lenton Ave, NG7",    fullAddress: "17 Lenton Ave, Nottingham NG7 2EG",    mapX: 148, mapY: 260 },
  { name: "Chris T.",  rating: 4.97, orders: 521, address: "8 Forest Rd West, NG7", fullAddress: "8 Forest Rd West, Nottingham NG7 4EQ", mapX: 88,  mapY: 205 },
  { name: "Priya K.",  rating: 4.78, orders: 94,  address: "3 Meadows Way, NG2",    fullAddress: "3 Meadows Way, Nottingham NG2 2DS",    mapX: 225, mapY: 395 },
  { name: "Daniel W.", rating: 4.88, orders: 263, address: "55 Gregory Blvd, NG7",  fullAddress: "55 Gregory Blvd, Nottingham NG7 5JE",  mapX: 133, mapY: 248 },
  { name: "Emma L.",   rating: 4.95, orders: 408, address: "22 Wollaton Rd, NG8",   fullAddress: "22 Wollaton Rd, Nottingham NG8 2AA",   mapX: 72,  mapY: 238 },
  { name: "Raj P.",    rating: 4.82, orders: 156, address: "10 Carlton Hill, NG4",   fullAddress: "10 Carlton Hill, Nottingham NG4 1EF",  mapX: 345, mapY: 215 },
  { name: "Lisa K.",   rating: 4.90, orders: 312, address: "88 Sneinton Dale, NG2",  fullAddress: "88 Sneinton Dale, Nottingham NG2 4QN", mapX: 318, mapY: 280 },
];

// Fare formula: base + (dist_to_restaurant * rate) + (dist_to_customer * rate)
const BASE_FARE    = 2.50;
const RATE_PER_MI  = 0.90;
const RANK_BONUS   = { Blue: 0, Gold: 0.05, Platinum: 0.10, Diamond: 0.15 };
const TIPS         = [0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 2, 2.5, 3];
// Max matching radius in miles (lower rank = smaller radius = fewer choices)
const MATCH_RADIUS = { Blue: 2.5, Gold: 3.2, Platinum: 3.8, Diamond: 4.5 };

const STREETS = ["Market St", "Castle Blvd", "Lenton Ave", "Gregory Blvd", "Derby Rd", "Forest Rd", "Mansfield Rd", "Trent Bridge", "London Rd", "Alfreton Rd"];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function fmt(n: number) { return `£${n.toFixed(2)}`; }
let orderIdCounter = 0;

function getSurgeAt(x: number, y: number, busyZones: BusyZone[]): number {
  for (const z of busyZones) {
    if (pxDist(x, y, z.x, z.y) <= z.r) return z.multiplier;
  }
  return 1;
}

function generateRealisticOrder(
  driverPos: { x: number; y: number },
  restaurant: Restaurant,
  busyZones: BusyZone[],
  rankName: string,
  acceptanceRate: number,
): Order {
  const customer = pick(CUSTOMERS);
  const count = Math.floor(rand(1, 4));
  const items = [...restaurant.menu].sort(() => Math.random() - 0.5).slice(0, count);

  const d2r = miDist(driverPos.x, driverPos.y, restaurant.mapX, restaurant.mapY);
  const d2c = miDist(restaurant.mapX, restaurant.mapY, customer.mapX, customer.mapY);

  const surge  = getSurgeAt(restaurant.mapX, restaurant.mapY, busyZones);
  const bonus  = RANK_BONUS[rankName as keyof typeof RANK_BONUS] ?? 0;
  // Acceptance rate penalty: below 80% starts reducing fare quality
  const accPenalty = acceptanceRate < 80 ? 0.9 : acceptanceRate < 70 ? 0.8 : 1;

  const raw  = BASE_FARE + d2r * RATE_PER_MI + d2c * RATE_PER_MI;
  const fare = parseFloat((raw * surge * (1 + bonus) * accPenalty + rand(0, 0.5)).toFixed(2));
  const tip  = pick(TIPS);

  const totalMin = miToMin(d2r) + miToMin(d2c);
  const totalMi  = parseFloat((d2r + d2c).toFixed(1));

  const prepTime = Math.round(rand(restaurant.prepMin, restaurant.prepMax));
  const inSurge  = surge > 1;
  const highVal  = fare >= 7.50;

  let matchReason: string;
  if (rankName === "Diamond" || rankName === "Platinum") matchReason = "Priority match";
  else if (inSurge)  matchReason = "Surge zone";
  else if (highVal)  matchReason = "High fare";
  else if (d2r < 1)  matchReason = "Near you";
  else               matchReason = "Best match";

  return {
    id: String(++orderIdCounter),
    restaurant, customer, items,
    total: fare, tip,
    distance: `${totalMi} mi`,
    duration: `${totalMin} min`,
    mapX: restaurant.mapX, mapY: restaurant.mapY,
    distToRestaurant: d2r,
    distToCustomer:   d2c,
    prepTime,
    surgeMultiplier: surge,
    matchReason,
    isHighValue: highVal,
  };
}

function generateOrderBatch(
  driverPos: { x: number; y: number },
  busyZones: BusyZone[],
  rankName: string,
  acceptanceRate: number,
): Order[] {
  const radius = MATCH_RADIUS[rankName as keyof typeof MATCH_RADIUS] ?? 2.5;

  // Filter restaurants within matching radius
  const eligible = RESTAURANTS.filter(r =>
    miDist(driverPos.x, driverPos.y, r.mapX, r.mapY) <= radius
  );
  if (eligible.length === 0) return [generateRealisticOrder(driverPos, pick(RESTAURANTS), busyZones, rankName, acceptanceRate)];

  // Sort: priority ranks get highest-fare restaurants first; others get closest first
  const sorted = [...eligible].sort((a, b) => {
    const da = miDist(driverPos.x, driverPos.y, a.mapX, a.mapY);
    const db = miDist(driverPos.x, driverPos.y, b.mapX, b.mapY);
    const surgeA = getSurgeAt(a.mapX, a.mapY, busyZones);
    const surgeB = getSurgeAt(b.mapX, b.mapY, busyZones);
    if (rankName === "Diamond" || rankName === "Platinum") {
      return (surgeB * (1 / Math.max(db, 0.1))) - (surgeA * (1 / Math.max(da, 0.1)));
    }
    return da - db;
  });

  const isBusy = busyZones.length >= 2;
  const maxCount = isBusy ? 3 : 2;
  const count = Math.min(maxCount, sorted.length, Math.floor(rand(1, maxCount + 1)));
  return sorted.slice(0, count).map(r =>
    generateRealisticOrder(driverPos, r, busyZones, rankName, acceptanceRate)
  );
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
  return [...POSSIBLE_BUSY_ZONES].sort(() => Math.random() - 0.5).slice(0, count).map((z, i) => ({ ...z, id: String(i) }));
}

// ─── CITY MAP (Google Maps light style) ───────────────────────────────────────

function CityMap({ busyZones, orders, driverPhase, onOrderTap, showDriverArrow }: {
  busyZones: BusyZone[]; orders: Order[]; driverPhase: Phase; onOrderTap: (o: Order) => void; showDriverArrow?: boolean;
}) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 440 520" preserveAspectRatio="xMidYMid slice"
           style={{ position: "absolute", inset: 0, display: "block" }}>

        {/* Base land */}
        <rect width="440" height="520" fill="#f2efe9"/>

        {/* River */}
        <path d="M-10,445 C40,435 100,448 180,440 S300,432 460,442 L460,520 L-10,520 Z" fill="#afd3e8"/>
        <path d="M-10,452 C60,442 120,455 200,447 S320,441 460,449" fill="none" stroke="#92bbce" strokeWidth="2"/>

        {/* Parks — green areas */}
        <rect x="8" y="10" width="110" height="80" rx="4" fill="#c8e6c9"/>
        <rect x="335" y="50" width="95" height="60" rx="3" fill="#c8e6c9"/>
        <ellipse cx="88" cy="270" rx="62" ry="50" fill="#c8e6c9"/>
        <rect x="140" y="410" width="160" height="28" rx="3" fill="#c8e6c9"/>

        {/* Park labels */}
        <text x="63" y="53" textAnchor="middle" fontSize="7.5" fill="#2e7d32" fontWeight="600" fontFamily="sans-serif">The Forest</text>
        <text x="383" y="82" textAnchor="middle" fontSize="7.5" fill="#2e7d32" fontWeight="600" fontFamily="sans-serif">Arboretum</text>
        <text x="88" y="274" textAnchor="middle" fontSize="7.5" fill="#2e7d32" fontWeight="600" fontFamily="sans-serif">The Park</text>
        <text x="220" y="427" textAnchor="middle" fontSize="7.5" fill="#2e7d32" fontWeight="600" fontFamily="sans-serif">Victoria Embankment</text>

        {/* Buildings — light grey blocks */}
        {[
          [155,150,60,48],[220,150,45,48],[270,150,60,48],
          [155,203,35,42],[195,203,70,42],[270,203,60,42],
          [155,250,45,45],[205,250,60,45],[270,250,60,45],
          [335,115,95,50],[335,170,95,50],[335,225,95,45],[335,275,95,50],
          [15,100,65,55],[85,100,65,55],[15,325,65,55],[85,325,65,55],[155,325,50,55],
          [15,385,75,55],[95,385,40,55],[205,325,60,55],[270,325,60,55],[335,325,95,55],
          [270,385,60,55],[335,385,95,55],
        ].map(([x,y,w,h],i) => <rect key={i} x={x} y={y} width={w} height={h} fill={i%2===0?"#e8e0d8":"#e0d8d0"} stroke="#d8d0c8" strokeWidth="0.5"/>)}

        {/* Ring road - yellow */}
        <path d="M150,92 L290,92 Q390,92 390,130 L390,300 Q390,380 310,380 L130,380 Q50,380 50,300 L50,130 Q50,92 150,92 Z"
          fill="none" stroke="#fdd835" strokeWidth="9" strokeLinejoin="round"/>

        {/* Major white roads */}
        <rect x="0" y="88" width="440" height="7" fill="#fff"/>
        <rect x="0" y="296" width="440" height="7" fill="#fff"/>
        <rect x="0" y="406" width="440" height="7" fill="#fff"/>
        <rect x="148" y="0" width="7" height="520" fill="#fff"/>
        <rect x="216" y="0" width="7" height="520" fill="#fff"/>
        <rect x="328" y="0" width="7" height="520" fill="#fff"/>

        {/* Medium roads */}
        <rect x="0" y="148" width="440" height="4.5" fill="#fffde7"/>
        <rect x="78" y="92" width="4.5" height="315" fill="#fffde7"/>
        <rect x="265" y="0" width="4.5" height="450" fill="#fffde7"/>
        <path d="M155,248 L90,140 L45,50" stroke="#fff" strokeWidth="5" fill="none"/>
        <path d="M265,188 L310,100 L360,28" stroke="#fff" strokeWidth="4.5" fill="none"/>

        {/* Minor streets */}
        {[120,180,205,340,390].map(y => <line key={y} x1="0" y1={y} x2="440" y2={y} stroke="#fff" strokeWidth="2.5" opacity="0.9"/>)}
        {[100,175,390,420].map(x => <line key={x} x1={x} y1="92" x2={x} y2="406" stroke="#fff" strokeWidth="2.5" opacity="0.9"/>)}

        {/* Road labels */}
        <text x="220" y="85" textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif">Long Row</text>
        <text x="220" y="293" textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif">Canal St</text>
        <text x="145" y="260" textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif" transform="rotate(-90,145,260)">Derby Rd</text>
        <text x="213" y="260" textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif" transform="rotate(-90,213,260)">Parliament St</text>
        <text x="325" y="260" textAnchor="middle" fontSize="7" fill="#888" fontFamily="sans-serif" transform="rotate(-90,325,260)">Carlton Rd</text>

        {/* Road badges */}
        {[{x:28,y:298,l:"A52"},{x:412,y:298,l:"A52"},{x:28,y:94,l:"A610"}].map(b=>(
          <g key={b.l+b.x}>
            <circle cx={b.x} cy={b.y} r={13} fill="white" stroke="#bbb" strokeWidth="1.5"/>
            <text x={b.x} y={b.y+4} textAnchor="middle" fontSize="7" fontWeight="800" fill="#444" fontFamily="sans-serif">{b.l}</text>
          </g>
        ))}

        {/* Area labels */}
        {[
          {x:222,y:224,t:"City Centre",s:9,b:true},
          {x:372,y:196,t:"Sneinton",s:8,b:false},
          {x:44,y:160,t:"Radford",s:7.5,b:false},
          {x:372,y:353,t:"Carlton",s:7.5,b:false},
          {x:222,y:462,t:"The Meadows",s:8,b:false},
        ].map(l=>(
          <text key={l.t} x={l.x} y={l.y} textAnchor="middle" fontSize={l.s}
                fill="#777" fontWeight={l.b?"700":"500"} fontFamily="sans-serif"
                style={{pointerEvents:"none"}}>{l.t}</text>
        ))}

        {/* Busy/surge zones — orange heatmap like reference */}
        {busyZones.map(z=>(
          <g key={z.id}>
            <circle cx={z.x} cy={z.y} r={z.r} fill={`rgba(255,${z.multiplier>1.3?"100,0":"140,0"},${z.multiplier>1.3?"0.28":"0.20"})`}/>
            <circle cx={z.x} cy={z.y} r={z.r*0.55} fill={`rgba(255,${z.multiplier>1.3?"60,0":"100,0"},${z.multiplier>1.3?"0.20":"0.14"})`}/>
            <circle cx={z.x} cy={z.y} r={z.r*0.22} fill={`rgba(255,${z.multiplier>1.3?"30,0":"70,0"},0.25)`}/>
          </g>
        ))}

        {/* Order markers */}
        {orders.map(o=>(
          <g key={o.id} onClick={()=>onOrderTap(o)} style={{cursor:"pointer"}}>
            <circle cx={o.mapX} cy={o.mapY} r={24} fill="white"
                    style={{filter:"drop-shadow(0 2px 8px rgba(0,0,0,0.22))"}}/>
            <text x={o.mapX} y={o.mapY-3} textAnchor="middle" fontSize="8" fontWeight="900" fill="#111" fontFamily="sans-serif">
              {fmt(o.total)}
            </text>
            <text x={o.mapX} y={o.mapY+9} textAnchor="middle" fontSize="9">{o.restaurant.emoji}</text>
            <circle cx={o.mapX} cy={o.mapY} r={28} fill="none" stroke="#06C167" strokeWidth="2.5" opacity="0.5"
                    style={{animation:"mapPulse 2s ease-out infinite"}}/>
          </g>
        ))}

        {/* Driver location — blue arrow like Uber reference */}
        {driverPhase !== "offline" && (
          <g transform="translate(220,270)">
            <circle r={28} fill="rgba(26,115,232,0.15)"/>
            <circle r={16} fill="#1a73e8" stroke="white" strokeWidth="3"
                    style={{filter:"drop-shadow(0 3px 8px rgba(26,115,232,0.6))"}}/>
            {/* Upward arrow */}
            <polygon points="0,-8 5,2 0,0 -5,2" fill="white"/>
          </g>
        )}

        {/* Offline driver dot */}
        {driverPhase === "offline" && (
          <g transform="translate(220,270)">
            <circle r={22} fill="rgba(100,100,100,0.15)"/>
            <circle r={13} fill="#666" stroke="white" strokeWidth="3"/>
            <circle r={4} fill="white"/>
          </g>
        )}

      </svg>
    </div>
  );
}

// ─── Countdown Ring ───────────────────────────────────────────────────────────

function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct = seconds / total;
  const offset = circ * (1 - pct);
  const color = seconds > total * 0.4 ? "#06C167" : seconds > total * 0.2 ? "#FF9500" : "#FF3B30";
  return (
    <div style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
      <svg width="52" height="52" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#e0e0e0" strokeWidth="4"/>
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color, fontWeight: 900, fontSize: 15 }}>{seconds}</span>
      </div>
    </div>
  );
}

// ─── Navigation Header (like Uber left screen) ────────────────────────────────

function NavHeader({ phase, order }: { phase: Phase; order: Order | null }) {
  if (!order) return null;
  const toRest = phase === "to-restaurant" || phase === "at-restaurant";
  const destName = toRest ? order.restaurant.name : order.customer.name;
  const destAddr = toRest ? order.restaurant.fullAddress : order.customer.fullAddress;
  const street = pick(STREETS);
  const color = toRest ? "#06C167" : "#1a73e8";

  return (
    <div style={{
      background: "#1a1a2e", flexShrink: 0,
      padding: "0 16px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      {/* Turn instruction */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0 10px" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, letterSpacing: "-0.5px", lineHeight: 1 }}>{street}</div>
          <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 3 }}>
            {toRest ? "Head to pickup" : "Head to dropoff"}
          </div>
        </div>
        <div style={{ background: "#06C167", borderRadius: 8, padding: "4px 10px", flexShrink: 0 }}>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 11, letterSpacing: "0.5px" }}>EATS</div>
        </div>
      </div>

      {/* Destination row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0 12px", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{destName}</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{destAddr}</div>
        </div>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{fmt(order.total)}</div>
      </div>
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
  const VEHICLES = [{ label: "Car", emoji: "🚗" }, { label: "Scooter", emoji: "🛵" }, { label: "E-Bike", emoji: "⚡🚲" }, { label: "Bicycle", emoji: "🚲" }];
  const CITIES = ["Nottingham", "London", "Manchester", "Birmingham"];

  function saveProfile() {
    const vObj = VEHICLES.find(v => v.emoji === editVehicle) ?? VEHICLES[0];
    const updated: DriverProfile = { ...profile, name: editName.trim() || profile.name, avatar: editAvatar, vehicleEmoji: vObj.emoji, vehicle: vObj.label, city: editCity };
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
      {isOpen && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 190, animation: "fadeIn 0.2s ease" }} />}
      <div style={{
        position: "fixed", top: 0, left: 0, bottom: 0, width: 290,
        background: "#fff", zIndex: 200, display: "flex", flexDirection: "column",
        transform: isOpen ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: isOpen ? "6px 0 30px rgba(0,0,0,0.18)" : "none",
      }}>
        <div style={{ background: "#000", paddingTop: 52, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "#06C16718", border: "2.5px solid #06C167", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
              {profile.avatar}
            </div>
            <div>
              <div style={{ color: "white", fontWeight: 800, fontSize: 18, letterSpacing: "-0.3px" }}>{profile.name.split(" ")[0]}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "monospace", marginTop: 2 }}>{profile.driverCode}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
                <span style={{ color: "#FFD700" }}>★</span>
                <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>4.93</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>· {tripCount} trips</span>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{rank.icon} Uber Pro {rank.name}</span>
              {nextRank && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{nextRank.name} →</span>}
            </div>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, height: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: "#06C167", borderRadius: 3, width: `${pct}%`, transition: "width 0.5s" }} />
            </div>
            {nextRank && <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, marginTop: 4 }}>{nextRank.min - tripCount} more trips to {nextRank.name}</div>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {!page && (
            <>
              <div style={{ padding: "4px 0" }}>
                {menuItems.map(item => (
                  <button key={item.label} onClick={item.action} style={{ width: "100%", background: "none", border: "none", textAlign: "left", padding: "14px 22px", display: "flex", alignItems: "center", gap: 16, cursor: "pointer", borderBottom: "1px solid #f5f5f5" }}>
                    <span style={{ fontSize: 17, width: 24, textAlign: "center" }}>{item.icon}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "#1a1a1a" }}>{item.label}</span>
                    {item.badge && <span style={{ background: item.badge === "•" ? "#06C167" : "#276EF1", color: "white", borderRadius: 12, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{item.badge}</span>}
                    <span style={{ color: "#ccc", fontSize: 16 }}>›</span>
                  </button>
                ))}
              </div>
              <div style={{ padding: "16px 22px", borderTop: "1px solid #f0f0f0" }}>
                <div style={{ color: "#aaa", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>Help</div>
                <div style={{ color: "#444", fontSize: 14, marginBottom: 10, cursor: "pointer" }}>Learning Center</div>
                <div style={{ color: "#444", fontSize: 14, cursor: "pointer" }}>Support</div>
              </div>
            </>
          )}

          {page === "earnings" && (
            <div style={{ padding: "20px" }}>
              <button onClick={() => setPage(null)} style={{ background: "none", border: "none", color: "#666", fontSize: 14, cursor: "pointer", marginBottom: 16, padding: 0 }}>← Back</button>
              <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 20 }}>Earnings</div>
              <div style={{ background: "#f8f8f8", borderRadius: 16, padding: "20px", marginBottom: 14, textAlign: "center" }}>
                <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>Total Earned</div>
                <div style={{ color: "#06C167", fontWeight: 900, fontSize: 36 }}>{fmt(earnings)}</div>
                <div style={{ color: "#bbb", fontSize: 12, marginTop: 4 }}>{tripCount} deliveries</div>
              </div>
              <button onClick={() => { onCashOut(); setPage(null); }} disabled={earnings <= 0} style={{ width: "100%", background: earnings > 0 ? "#06C167" : "#f0f0f0", border: "none", borderRadius: 100, color: earnings > 0 ? "#fff" : "#bbb", fontWeight: 800, fontSize: 16, padding: "16px", cursor: earnings > 0 ? "pointer" : "default" }}>
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
                return (
                  <div key={r.name} style={{ background: active ? r.gradient : "#f8f8f8", borderRadius: 14, padding: "14px 16px", marginBottom: 10, opacity: active ? 1 : 0.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{r.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: active ? "#fff" : "#1a1a1a" }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: active ? "rgba(255,255,255,0.6)" : "#aaa", marginTop: 2 }}>{r.min}–{r.max ?? "∞"} trips</div>
                      </div>
                      {active && <span style={{ color: "#fff", fontWeight: 700, fontSize: 12, background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "3px 10px" }}>Current</span>}
                    </div>
                    {active && nextRank && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginBottom: 5 }}>{nextRank.min - tripCount} trips to {nextRank.name}</div>
                        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 3, height: 4 }}>
                          <div style={{ height: "100%", background: "white", borderRadius: 3, width: `${pct}%` }} />
                        </div>
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
                <button onClick={() => { onCashOut(); setPage(null); }} disabled={earnings <= 0} style={{ marginTop: 16, background: earnings > 0 ? "#06C167" : "#333", border: "none", borderRadius: 100, color: "#fff", fontWeight: 700, fontSize: 14, padding: "12px 28px", cursor: earnings > 0 ? "pointer" : "default" }}>Cash Out Instantly</button>
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
                {AVATARS.map(a => <button key={a} onClick={() => setEditAvatar(a)} style={{ width: 42, height: 42, borderRadius: 10, border: editAvatar === a ? "2px solid #06C167" : "2px solid #e8e8e8", background: editAvatar === a ? "#06C16710" : "white", fontSize: 20, cursor: "pointer" }}>{a}</button>)}
              </div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Vehicle</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {VEHICLES.map(v => <button key={v.emoji} onClick={() => setEditVehicle(v.emoji)} style={{ flex: 1, padding: "10px 4px", borderRadius: 10, border: editVehicle === v.emoji ? "2px solid #06C167" : "2px solid #e8e8e8", background: editVehicle === v.emoji ? "#06C16710" : "white", fontSize: 18, cursor: "pointer" }}>{v.emoji}</button>)}
              </div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>City</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
                {CITIES.map(c => <button key={c} onClick={() => setEditCity(c)} style={{ padding: "12px 14px", borderRadius: 10, border: editCity === c ? "2px solid #06C167" : "2px solid #e8e8e8", background: editCity === c ? "#06C16710" : "white", textAlign: "left", fontSize: 14, fontWeight: editCity === c ? 700 : 400, color: "#1a1a1a", cursor: "pointer" }}>{c}</button>)}
              </div>
              <button onClick={saveProfile} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "white", fontWeight: 800, fontSize: 15, padding: "16px", cursor: "pointer" }}>{saveMsg || "Save Changes"}</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Verification Modal ───────────────────────────────────────────────────────

function VerificationModal({ profile, onSuccess, onFail }: {
  profile: DriverProfile; onSuccess: () => void; onFail: () => void;
}) {
  const [input, setInput]           = useState("");
  const [error, setError]           = useState("");
  const [attempts, setAttempts]     = useState(0);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotName, setForgotName] = useState("");
  const [forgotPass, setForgotPass] = useState("");
  const [forgotErr, setForgotErr]   = useState("");
  const [revealed, setRevealed]     = useState(false);
  const [shownCode, setShownCode]   = useState(profile.driverCode);

  function handleVerify() {
    if (input.trim().toUpperCase() === shownCode) { onSuccess(); return; }
    const next = attempts + 1;
    setAttempts(next);
    setError(`Incorrect code. ${3 - next > 0 ? `${3 - next} attempt${3 - next !== 1 ? "s" : ""} remaining.` : "Access blocked."}`);
    setInput("");
    if (next >= 3) setTimeout(onFail, 1200);
  }

  function handleForgotVerify() {
    const nameOk = forgotName.trim().toLowerCase() === profile.name.trim().toLowerCase();
    const passOk = forgotPass === profile.password;
    if (nameOk && passOk) { setForgotErr(""); setRevealed(true); }
    else setForgotErr("Name or password didn't match.");
  }

  function handleResetCode() {
    const num = Math.floor(100000 + Math.random() * 900000);
    const code = `DRV-${num}`;
    setShownCode(code);
    const updated = { ...profile, driverCode: code };
    localStorage.setItem("uber_eats_driver_profile", JSON.stringify(updated));
  }

  function handleUseCode() {
    setInput(shownCode);
    setShowForgot(false);
    setRevealed(false);
    setForgotName("");
    setForgotPass("");
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", backdropFilter: "blur(8px)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ background: "#111", borderRadius: 22, padding: "28px 22px", width: "100%", maxWidth: 360, border: "1px solid rgba(255,255,255,0.08)", animation: "slideUp 0.2s ease" }}>

        {/* ── Main verify view ── */}
        {!showForgot && (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 16px" }}>🔒</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 20, textAlign: "center", marginBottom: 5 }}>Identity Check</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", marginBottom: 22 }}>Enter your driver code to continue</div>
            <input autoFocus value={input} onChange={e => { setInput(e.target.value.toUpperCase()); setError(""); }}
              placeholder="DRV-000000" onKeyDown={e => e.key === "Enter" && input.trim() && handleVerify()}
              style={{ width: "100%", boxSizing: "border-box", background: "#1a1a1a", border: error ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px", color: "#fff", fontSize: 18, fontWeight: 700, caretColor: "#06C167", fontFamily: "monospace", letterSpacing: "0.08em" }} />
            {error && <div style={{ color: "#FF3B30", fontSize: 12, marginTop: 8 }}>{error}</div>}
            <button onClick={handleVerify} disabled={!input.trim() || attempts >= 3}
              style={{ width: "100%", marginTop: 14, background: input.trim() && attempts < 3 ? "#06C167" : "#222", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "15px", cursor: input.trim() && attempts < 3 ? "pointer" : "default" }}>
              Verify Identity
            </button>
            <button onClick={() => setShowForgot(true)}
              style={{ width: "100%", marginTop: 10, background: "none", border: "none", color: "#06C167", fontWeight: 600, fontSize: 14, padding: "8px", cursor: "pointer" }}>
              Forgot your driver code?
            </button>
          </>
        )}

        {/* ── Forgot: verify by name + password ── */}
        {showForgot && !revealed && (
          <>
            <button onClick={() => { setShowForgot(false); setForgotErr(""); }}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", marginBottom: 14, padding: 0 }}>
              ← Back
            </button>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 14px" }}>🔑</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, textAlign: "center", marginBottom: 5 }}>Reset Driver Code</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>Verify your identity to recover your code</div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Full Name</label>
              <input autoFocus value={forgotName} onChange={e => { setForgotName(e.target.value); setForgotErr(""); }}
                placeholder={profile.name}
                style={{ width: "100%", boxSizing: "border-box", background: "#1a1a1a", border: "2px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 15, caretColor: "#06C167" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Password</label>
              <input type="password" value={forgotPass} onChange={e => { setForgotPass(e.target.value); setForgotErr(""); }}
                onKeyDown={e => e.key === "Enter" && forgotName && forgotPass && handleForgotVerify()}
                placeholder="Your password"
                style={{ width: "100%", boxSizing: "border-box", background: "#1a1a1a", border: forgotErr ? "2px solid #FF3B30" : "2px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px", color: "#fff", fontSize: 15, caretColor: "#06C167" }} />
            </div>
            {forgotErr && <div style={{ color: "#FF3B30", fontSize: 12, marginBottom: 10 }}>{forgotErr}</div>}
            <button onClick={handleForgotVerify} disabled={!forgotName.trim() || !forgotPass}
              style={{ width: "100%", background: forgotName.trim() && forgotPass ? "#06C167" : "#222", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 15, padding: "15px", cursor: forgotName.trim() && forgotPass ? "pointer" : "default" }}>
              Verify Identity
            </button>
          </>
        )}

        {/* ── Revealed code view ── */}
        {showForgot && revealed && (
          <>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "#06C16720", border: "1px solid #06C16740", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 14px" }}>✅</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, textAlign: "center", marginBottom: 5 }}>Identity Verified</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center", marginBottom: 20 }}>Here is your driver code</div>
            <div style={{ background: "#1a1a1a", borderRadius: 14, padding: "20px", textAlign: "center", border: "2px solid #06C16750", fontFamily: "monospace", fontSize: 26, fontWeight: 900, color: "#06C167", letterSpacing: "0.1em", marginBottom: 14 }}>
              {shownCode}
            </div>
            <button onClick={handleResetCode}
              style={{ width: "100%", background: "none", border: "1.5px solid rgba(255,255,255,0.12)", borderRadius: 100, color: "rgba(255,255,255,0.5)", fontWeight: 700, fontSize: 14, padding: "13px", cursor: "pointer", marginBottom: 10 }}>
              🔄 Generate New Code
            </button>
            <button onClick={handleUseCode}
              style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 15, padding: "15px", cursor: "pointer" }}>
              Use This Code
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Bottom Panels ────────────────────────────────────────────────────────────

function PickupPanel({ order, onPickedUp }: { order: Order; onPickedUp: () => void }) {
  return (
    <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", animation: "slideUp 0.22s ease" }}>
      <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "12px auto 16px" }} />
      <div style={{ padding: "0 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: order.restaurant.color + "18", border: `1.5px solid ${order.restaurant.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
            {order.restaurant.emoji}
          </div>
          <div>
            <div style={{ color: "#06C167", fontWeight: 800, fontSize: 17 }}>You've arrived!</div>
            <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{order.restaurant.name}</div>
            <div style={{ color: "#bbb", fontSize: 11, marginTop: 1 }}>{order.restaurant.fullAddress}</div>
          </div>
        </div>
        <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {order.items.map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < order.items.length - 1 ? "1px solid #efefef" : "none" }}>
              <span style={{ color: "#444", fontSize: 13 }}>{item.name}</span>
              <span style={{ color: "#aaa", fontSize: 12 }}>{fmt(item.price)}</span>
            </div>
          ))}
        </div>
        <button className="ubtn" onClick={onPickedUp} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "17px" }}>
          Picked Up · Start Delivery
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, background: "#f5f5f5", borderRadius: 12, padding: "10px 0", textAlign: "center" }}>
      <div style={{ color: "#1a1a1a", fontWeight: 700, fontSize: 14 }}>{value}</div>
      <div style={{ color: "#aaa", fontSize: 10, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function DeliveredPanel({ order, tip, rankedUp, onNext }: { order: Order; tip: number; rankedUp: Rank | null; onNext: () => void }) {
  const total = (order.total + tip).toFixed(2);
  return (
    <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", animation: "slideUp 0.22s ease" }}>
      <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "12px auto 16px" }} />
      <div style={{ padding: "0 20px 28px" }}>
        {rankedUp ? (
          <div style={{ background: rankedUp.gradient, borderRadius: 14, padding: "16px", marginBottom: 16, textAlign: "center", animation: "rankUp 0.5s ease", boxShadow: `0 0 28px ${rankedUp.color}55` }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>{rankedUp.icon}</div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>Rank Up! You're now {rankedUp.name}</div>
          </div>
        ) : (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
            <div style={{ color: "#1a1a1a", fontWeight: 800, fontSize: 18 }}>Delivery Complete!</div>
            <div style={{ color: "#aaa", fontSize: 13, marginTop: 4 }}>Delivered to {order.customer.name}</div>
          </div>
        )}
        <div style={{ background: "#f8f8f8", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#666", fontSize: 13 }}>Delivery fare</span>
            <span style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 13 }}>{fmt(order.total)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ color: "#666", fontSize: 13 }}>Tip</span>
            <span style={{ color: tip > 0 ? "#06C167" : "#bbb", fontWeight: 600, fontSize: 13 }}>{fmt(tip)}</span>
          </div>
          <div style={{ borderTop: "1px solid #ebebeb", paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#1a1a1a", fontWeight: 700, fontSize: 14 }}>Total earned</span>
            <span style={{ color: "#06C167", fontWeight: 900, fontSize: 22 }}>£{total}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <StatCard label="Distance" value={order.distance} />
          <StatCard label="Duration" value={order.duration} />
          <StatCard label="Rating" value={`${order.customer.rating}★`} />
        </div>
        <button className="ubtn" onClick={onNext} style={{ width: "100%", background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 16, padding: "17px" }}>
          Back to Map
        </button>
      </div>
    </div>
  );
}

// ─── Main Game ────────────────────────────────────────────────────────────────

export default function Game({ profile: initialProfile, stateKey }: { profile: DriverProfile; stateKey: string }) {
  const phaseRef = useRef<Phase>("offline");
  const moveInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const orderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  function loadState() {
    try { const r = localStorage.getItem(stateKey); if (r) return JSON.parse(r); } catch {}
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
  // Acceptance rate tracking
  const [offeredCount, setOfferedCount] = useState<number>(saved.offeredCount ?? 0);
  const [acceptedCount, setAcceptedCount] = useState<number>(saved.acceptedCount ?? 0);
  const acceptanceRate = offeredCount > 0 ? Math.round((acceptedCount / offeredCount) * 100) : 100;
  const accWarning = offeredCount >= 5 && acceptanceRate < 80;

  const isBusy = busyZones.length >= 2;
  const maxMultiplier = busyZones.length > 0 ? Math.max(...busyZones.map(z => z.multiplier)) : 1;

  useEffect(() => {
    const raw = localStorage.getItem(stateKey);
    const state = raw ? JSON.parse(raw) : {};
    state.totalEarnings = totalEarnings;
    state.tripCount     = tripCount;
    state.offeredCount  = offeredCount;
    state.acceptedCount = acceptedCount;
    localStorage.setItem(stateKey, JSON.stringify(state));
  }, [totalEarnings, tripCount, offeredCount, acceptedCount]);

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
      if (remaining <= 0) { clearInterval(iv); setCooldownIntervalState(null); setCooldownSec(0); onDone(); }
    }, 1000);
    setCooldownIntervalState(iv);
  }

  const spawnOrders = useCallback(() => {
    if (phaseRef.current !== "online") return;
    const rankName = getRank(tripCount).name;
    const orders = generateOrderBatch(DRIVER_HOME, busyZones, rankName, acceptanceRate);
    setOfferedCount(c => c + orders.length);
    setAvailableOrders(orders);
    phaseRef.current = "selecting";
    setPhase("selecting");
    playNewOrder();
  }, [busyZones, tripCount, acceptanceRate]);

  const scheduleNextOrders = useCallback(() => {
    if (cooldownInterval) clearInterval(cooldownInterval);
    const cooldown = isBusy ? Math.floor(rand(15000, 30000)) : Math.floor(rand(45000, 75000));
    const cooldownSecs = Math.floor(cooldown / 1000);
    phaseRef.current = "online";
    setPhase("online");
    startCooldown(cooldownSecs, () => { if (phaseRef.current === "online") spawnOrders(); });
  }, [isBusy, spawnOrders]);

  function handleGoOnline() {
    phaseRef.current = "online";
    setPhase("online");
    setBusyZones(pickBusyZones());
    playTap();
    startCooldown(8, () => { if (phaseRef.current === "online") spawnOrders(); });
  }

  function handleGoOffline() {
    if (moveInterval.current) clearInterval(moveInterval.current);
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
    setAcceptedCount(c => c + 1);
    setSelectedOrderCard(null);
    setAvailableOrders([]);
    setActiveOrder(order);
    phaseRef.current = "to-restaurant";
    setPhase("to-restaurant");
    progressRef.current = 0;
    setProgress(0);
    playAccept();
    const raw = localStorage.getItem(stateKey);
    const state = raw ? JSON.parse(raw) : {};
    if ((state.tripCount ?? 0) > 0 && (state.tripCount ?? 0) % 3 === 0) setShowVerification(true);
    startMovement("to-restaurant", order);
  }

  function startMovement(dir: "to-restaurant" | "to-customer", order: Order) {
    if (moveInterval.current) clearInterval(moveInterval.current);
    progressRef.current = 0;
    setProgress(0);
    const steps = 80;
    const stepTime = (parseInt(pick(DURATIONS)) * 600) / steps;
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
          if (newRank.name !== prevRank.name) { setRankedUp(newRank); playRankUp(); }
          else { setRankedUp(null); playDelivered(); }
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
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", fontFamily: "'Inter',-apple-system,sans-serif", background: "#f2efe9", overflow: "hidden" }}>

      {showVerification && <VerificationModal profile={profile} onSuccess={() => setShowVerification(false)} onFail={() => { setShowVerification(false); handleGoOffline(); }} />}

      <SideMenu isOpen={sideMenuOpen} profile={profile} earnings={totalEarnings} tripCount={tripCount}
        onClose={() => setSideMenuOpen(false)} onUpdateProfile={handleUpdateProfile}
        onCashOut={handleCashOut} stateKey={stateKey} />

      {/* Cash out toast */}
      {showCashOutMsg && (
        <div style={{ position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)", background: "#06C167", borderRadius: 100, padding: "12px 22px", color: "#fff", fontWeight: 700, fontSize: 14, zIndex: 400, boxShadow: "0 4px 20px rgba(6,193,103,0.5)", whiteSpace: "nowrap", animation: "slideUp 0.25s ease" }}>
          💸 {showCashOutMsg}
        </div>
      )}

      {/* ═══════════════════ MAP PHASE ═══════════════════ */}
      {isMapPhase && (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <CityMap busyZones={busyZones} orders={availableOrders} driverPhase={phase} onOrderTap={o => setSelectedOrderCard(o)} />

          {/* Top bar */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "14px 14px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <button onClick={() => setSideMenuOpen(true)} style={{ width: 44, height: 44, borderRadius: "50%", background: "white", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.18)", flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 16, height: 2, background: "#1a1a1a", borderRadius: 2 }} />)}
              </div>
            </button>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {busyZones.length > 0 && phase !== "offline" && (
                <div style={{ background: "#FF6D00", borderRadius: 20, padding: "8px 14px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)" }}>
                  <div style={{ color: "#fff", fontWeight: 900, fontSize: 13 }}>⚡ {maxMultiplier.toFixed(1)}×</div>
                </div>
              )}
              <div style={{ background: "white", borderRadius: 20, padding: "8px 16px", boxShadow: "0 2px 10px rgba(0,0,0,0.18)", textAlign: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#1a1a1a", lineHeight: 1 }}>{fmt(totalEarnings)}</div>
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
              background: "rgba(255,80,0,0.82)", color: "white",
              borderRadius: 10, padding: "3px 10px", fontSize: 9.5, fontWeight: 700,
              pointerEvents: "none", whiteSpace: "nowrap",
              boxShadow: "0 1px 6px rgba(0,0,0,0.2)",
            }}>{z.label} {z.multiplier.toFixed(1)}×</div>
          ))}

          {/* Online cooldown label */}
          {phase === "online" && cooldownSec > 0 && (
            <div style={{ position: "absolute", bottom: 160, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)", borderRadius: 20, padding: "8px 18px", color: "#fff", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
              Orders in {cooldownSec}s...
            </div>
          )}

          {/* ── OFFLINE: Big GO button ── */}
          {phase === "offline" && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: 44 }}>
              <button onClick={handleGoOnline} style={{
                width: 88, height: 88, borderRadius: "50%",
                background: "#1a1a2e", border: "none",
                color: "white", fontWeight: 900, fontSize: 22,
                cursor: "pointer", letterSpacing: "1px",
                boxShadow: "0 4px 28px rgba(0,0,0,0.35), 0 0 0 8px rgba(255,255,255,0.6), 0 0 0 12px rgba(255,255,255,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}>GO</button>
              <div style={{ color: "#555", fontSize: 14, fontWeight: 600, marginTop: 14 }}>You're offline</div>
              {/* Stats strip */}
              <div style={{ display: "flex", gap: 24, marginTop: 18, background: "rgba(255,255,255,0.9)", borderRadius: 16, padding: "12px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.1)" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "#1a1a1a" }}>{tripCount}</div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Trips</div>
                </div>
                <div style={{ width: 1, background: "#ebebeb" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "#06C167" }}>{fmt(totalEarnings)}</div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>Balance</div>
                </div>
                <div style={{ width: 1, background: "#ebebeb" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1a1a1a" }}>{rank.icon}</div>
                  <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{rank.name}</div>
                </div>
              </div>
            </div>
          )}

          {/* ── ONLINE status bar ── */}
          {phase === "online" && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "white", borderTop: "1px solid #ebebeb", borderRadius: "18px 18px 0 0", boxShadow: "0 -2px 20px rgba(0,0,0,0.1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px" }}>
                <button onClick={() => setSideMenuOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
                    <div style={{ width: 18, height: 2, background: "#444", borderRadius: 2 }} />
                    <div style={{ width: 14, height: 2, background: "#888", borderRadius: 2 }} />
                    <div style={{ width: 18, height: 2, background: "#444", borderRadius: 2 }} />
                  </div>
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#06C167", animation: "pulse 1.5s ease-in-out infinite", boxShadow: "0 0 0 3px rgba(6,193,103,0.2)" }} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a" }}>You're Online</span>
                </div>
                <button onClick={handleGoOffline} style={{ background: "none", border: "1.5px solid #e0e0e0", borderRadius: 100, color: "#666", fontWeight: 700, fontSize: 12, padding: "8px 16px", cursor: "pointer" }}>
                  Pause
                </button>
              </div>
              {/* Acceptance rate warning */}
              {accWarning && (
                <div style={{ margin: "0 16px 10px", background: acceptanceRate < 70 ? "#FFF0F0" : "#FFFBF0", border: `1px solid ${acceptanceRate < 70 ? "#FFCDD2" : "#FFE082"}`, borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>{acceptanceRate < 70 ? "⚠️" : "📉"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: acceptanceRate < 70 ? "#C62828" : "#E65100" }}>
                      {acceptanceRate < 70 ? "Low acceptance rate — order quality reduced" : "Acceptance rate below 80%"}
                    </div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 1 }}>Accept more orders to improve your score</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 14, color: acceptanceRate < 70 ? "#C62828" : "#E65100" }}>{acceptanceRate}%</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 0, paddingBottom: 16, paddingLeft: 16, paddingRight: 16, borderTop: "1px solid #f5f5f5" }}>
                {[
                  { v: String(tripCount),        l: "Trips" },
                  { v: fmt(totalEarnings),        l: "Earned" },
                  { v: fmtTime(sessionTime),      l: "Online" },
                  { v: `${acceptanceRate}%`,      l: "Acceptance" },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, textAlign: "center", paddingTop: 10 }}>
                    <div style={{ fontWeight: 800, fontSize: 13, color: i === 1 ? "#06C167" : i === 3 ? (acceptanceRate < 80 ? "#E65100" : "#1a1a1a") : "#1a1a1a" }}>{s.v}</div>
                    <div style={{ fontSize: 9.5, color: "#bbb", marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ORDER CARDS (selecting — small tap cards) ── */}
          {phase === "selecting" && availableOrders.length > 0 && !selectedOrderCard && (
            <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, zIndex: 20, animation: "slideUp 0.25s ease" }}>
              <div style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)", borderRadius: 14, padding: "10px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{availableOrders.length} order{availableOrders.length !== 1 ? "s" : ""} matched</span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, marginLeft: 8 }}>Acceptance: {acceptanceRate}%</span>
                </div>
                <CountdownRing seconds={orderTimer} total={ORDER_TIMEOUT} />
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
                {availableOrders.map(o => (
                  <div key={o.id} onClick={() => setSelectedOrderCard(o)}
                    style={{ background: "white", borderRadius: 18, padding: "14px 16px", minWidth: 185, flexShrink: 0, boxShadow: "0 6px 24px rgba(0,0,0,0.25)", cursor: "pointer", border: o.isHighValue ? "2px solid #06C167" : "2px solid transparent" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: o.restaurant.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{o.restaurant.emoji}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: "#1a1a1a" }}>{o.restaurant.name}</div>
                          <div style={{ fontSize: 10, color: "#aaa" }}>{o.distToRestaurant} mi away</div>
                        </div>
                      </div>
                      {o.surgeMultiplier > 1 && <span style={{ fontSize: 9, fontWeight: 800, color: "#FF6D00", background: "#FFF3E0", borderRadius: 6, padding: "2px 5px" }}>⚡{o.surgeMultiplier.toFixed(1)}×</span>}
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 22, color: "#06C167", marginBottom: 2 }}>{fmt(o.total)}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 10, color: "#bbb" }}>{o.duration} total</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: o.matchReason === "Priority match" ? "#6A1B9A" : o.matchReason === "High fare" ? "#06C167" : o.matchReason === "Surge zone" ? "#FF6D00" : "#1a73e8",
                        background: o.matchReason === "Priority match" ? "#F3E5F5" : o.matchReason === "High fare" ? "#E8F5E9" : o.matchReason === "Surge zone" ? "#FFF3E0" : "#E3F2FD",
                        borderRadius: 6, padding: "2px 6px" }}>{o.matchReason}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ORDER DETAIL (matches reference image exactly) ── */}
          {selectedOrderCard && (
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 30, animation: "slideUp 0.22s ease" }}>
              {/* Countdown ring floats top-right above the card */}
              <div style={{ position: "absolute", top: -64, right: 16, zIndex: 31 }}>
                <CountdownRing seconds={orderTimer} total={ORDER_TIMEOUT} />
              </div>

              <div style={{ background: "white", borderRadius: "24px 24px 0 0", boxShadow: "0 -6px 32px rgba(0,0,0,0.18)" }}>
                {/* Drag handle */}
                <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "14px auto 0" }} />

                <div style={{ padding: "16px 20px 0" }}>

                  {/* ── Centered "Delivery" badge ── */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
                    <div style={{
                      background: "#06C167", borderRadius: 100,
                      padding: "8px 18px",
                      display: "inline-flex", alignItems: "center", gap: 7,
                    }}>
                      {/* Utensils SVG icon */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M3 2v7c0 1.1.9 2 2 2h2v11h2V11h2c1.1 0 2-.9 2-2V2h-2v5H7V2H5v5H3V2zM19 2c-1.7 0-4 1.3-4 6v1.5c0 1 .8 1.8 1.8 1.8H18V22h2V2z" fill="white"/>
                      </svg>
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: "0.1px" }}>Delivery</span>
                    </div>
                  </div>

                  {/* ── Big price ── */}
                  <div style={{ fontWeight: 900, fontSize: 42, color: "#1a1a1a", letterSpacing: "-2px", lineHeight: 1, marginBottom: 5 }}>
                    {fmt(selectedOrderCard.total)}
                  </div>
                  <div style={{ color: "#888", fontSize: 13, marginBottom: 14, fontWeight: 400 }}>
                    includes expected tip
                  </div>

                  {/* ── Match reason + surge ── */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 8, padding: "4px 10px",
                      color: selectedOrderCard.matchReason === "Priority match" ? "#6A1B9A" : selectedOrderCard.matchReason === "High fare" ? "#2E7D32" : selectedOrderCard.matchReason === "Surge zone" ? "#E65100" : "#1565C0",
                      background: selectedOrderCard.matchReason === "Priority match" ? "#F3E5F5" : selectedOrderCard.matchReason === "High fare" ? "#E8F5E9" : selectedOrderCard.matchReason === "Surge zone" ? "#FFF3E0" : "#E3F2FD",
                    }}>{selectedOrderCard.matchReason}</span>
                    {selectedOrderCard.surgeMultiplier > 1 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#E65100", background: "#FFF3E0", borderRadius: 8, padding: "4px 10px" }}>
                        ⚡ {selectedOrderCard.surgeMultiplier.toFixed(1)}× surge
                      </span>
                    )}
                    {selectedOrderCard.isHighValue && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#2E7D32", background: "#E8F5E9", borderRadius: 8, padding: "4px 10px" }}>
                        💰 High value
                      </span>
                    )}
                  </div>

                  {/* ── Separator ── */}
                  <div style={{ height: 1, background: "#ebebeb", marginBottom: 16 }} />

                  {/* ── Time + distance ── */}
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#555" strokeWidth="2"/>
                      <path d="M12 6v6l4 2" stroke="#555" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                    <span style={{ color: "#1a1a1a", fontWeight: 500, fontSize: 14 }}>
                      {selectedOrderCard.duration} ({selectedOrderCard.distance}) total
                    </span>
                  </div>

                  {/* ── Pickup distance + prep time ── */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                    <div style={{ flex: 1, background: "#f8f8f8", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginBottom: 3 }}>PICKUP</div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}>{selectedOrderCard.distToRestaurant} mi</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{miToMin(selectedOrderCard.distToRestaurant)} min drive</div>
                    </div>
                    <div style={{ flex: 1, background: "#f8f8f8", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginBottom: 3 }}>DROPOFF</div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}>{selectedOrderCard.distToCustomer} mi</div>
                      <div style={{ fontSize: 11, color: "#888" }}>{miToMin(selectedOrderCard.distToCustomer)} min drive</div>
                    </div>
                    <div style={{ flex: 1, background: "#f8f8f8", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ fontSize: 10, color: "#aaa", fontWeight: 600, marginBottom: 3 }}>PREP TIME</div>
                      <div style={{ fontWeight: 800, fontSize: 15, color: "#1a1a1a" }}>~{selectedOrderCard.prepTime} min</div>
                      <div style={{ fontSize: 11, color: "#888" }}>at restaurant</div>
                    </div>
                  </div>

                  {/* ── Pickup address ── */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 13 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                      <path d="M3 2v7c0 1.1.9 2 2 2h2v11h2V11h2c1.1 0 2-.9 2-2V2h-2v5H7V2H5v5H3V2zM19 2c-1.7 0-4 1.3-4 6v1.5c0 1 .8 1.8 1.8 1.8H18V22h2V2z" fill="#555"/>
                    </svg>
                    <span style={{ color: "#1a1a1a", fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                      {selectedOrderCard.restaurant.name} · {selectedOrderCard.restaurant.fullAddress}
                    </span>
                  </div>

                  {/* ── Dropoff address ── */}
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 22 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                      <circle cx="12" cy="10" r="4" fill="#555"/>
                      <path d="M12 2C7.6 2 4 5.6 4 10c0 5.3 8 14 8 14s8-8.7 8-14c0-4.4-3.6-8-8-8z" stroke="#555" strokeWidth="1.5" fill="none"/>
                    </svg>
                    <span style={{ color: "#1a1a1a", fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
                      {selectedOrderCard.customer.fullAddress}
                    </span>
                  </div>

                  {/* ── Actions ── */}
                  <div style={{ display: "flex", gap: 12, paddingBottom: 36 }}>
                    <button onClick={() => {
                      setSelectedOrderCard(null);
                      const remaining = availableOrders.filter(o => o.id !== selectedOrderCard.id);
                      setAvailableOrders(remaining);
                      if (remaining.length === 0) { playDecline(); scheduleNextOrders(); }
                    }} style={{ width: 54, height: 54, background: "#f5f5f5", border: "none", borderRadius: 14, color: "#FF3B30", fontSize: 20, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                    <button className="ubtn" onClick={() => handleAcceptOrder(selectedOrderCard)} style={{ flex: 1, background: "#06C167", border: "none", borderRadius: 100, color: "#fff", fontWeight: 800, fontSize: 17, cursor: "pointer" }}>
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ DELIVERY PHASE ═══════════════════ */}
      {isDeliveryPhase && (
        <>
          {/* Navigation header (like Uber left screen) */}
          <NavHeader phase={phase} order={activeOrder} />

          {/* Map still visible behind */}
          <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
            <CityMap busyZones={[]} orders={[]} driverPhase={phase} onOrderTap={() => {}} />

            {/* Progress overlay on map */}
            {(phase === "to-restaurant" || phase === "to-customer") && (
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: 16, padding: "12px 20px", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", minWidth: 160, textAlign: "center" }}>
                <div style={{ color: "#1a1a1a", fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                  {phase === "to-restaurant" ? "Heading to pickup" : "Heading to customer"}
                </div>
                <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 4, background: phase === "to-restaurant" ? "#06C167" : "#1a73e8", width: `${progress}%`, transition: "width 0.3s ease" }} />
                </div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 6 }}>{Math.round(progress)}% complete</div>
              </div>
            )}

            {/* At restaurant overlay */}
            {phase === "at-restaurant" && activeOrder && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(4px)" }}>
                <div style={{ textAlign: "center", background: "white", borderRadius: 20, padding: "28px 32px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>{activeOrder.restaurant.emoji}</div>
                  <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20 }}>Arrived!</div>
                  <div style={{ color: "#888", fontSize: 13, marginTop: 4 }}>Collect from {activeOrder.restaurant.name}</div>
                </div>
              </div>
            )}

            {/* Delivered overlay */}
            {phase === "delivered" && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.7)", backdropFilter: "blur(4px)" }}>
                <div style={{ textAlign: "center", background: "white", borderRadius: 20, padding: "28px 32px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 52, marginBottom: 10 }}>✅</div>
                  <div style={{ color: "#06C167", fontWeight: 800, fontSize: 20 }}>Delivered!</div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom info panel (like reference "8 mi · 3.5 mi · Picking up Jenny") */}
          {phase === "to-restaurant" && activeOrder && (
            <div style={{ background: "white", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "12px auto 14px" }} />
              <div style={{ padding: "0 20px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <span style={{ color: "#06C167", fontWeight: 700, fontSize: 14 }}>{activeOrder.distance}</span>
                  <span style={{ color: "#bbb" }}>·</span>
                  <span style={{ color: "#666", fontSize: 14 }}>{activeOrder.duration}</span>
                  <span style={{ color: "#bbb" }}>·</span>
                  <span style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Picking up order</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: activeOrder.restaurant.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{activeOrder.restaurant.emoji}</div>
                  <div>
                    <div style={{ color: "#1a1a1a", fontWeight: 700, fontSize: 14 }}>{activeOrder.restaurant.name}</div>
                    <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{activeOrder.restaurant.fullAddress}</div>
                  </div>
                  <div style={{ marginLeft: "auto", color: "#06C167", fontWeight: 800, fontSize: 16 }}>{fmt(activeOrder.total)}</div>
                </div>
              </div>
            </div>
          )}

          {phase === "to-customer" && activeOrder && (
            <div style={{ background: "white", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.12)", flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, background: "#e0e0e0", borderRadius: 2, margin: "12px auto 14px" }} />
              <div style={{ padding: "0 20px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                  <span style={{ color: "#1a73e8", fontWeight: 700, fontSize: 14 }}>{activeOrder.distance}</span>
                  <span style={{ color: "#bbb" }}>·</span>
                  <span style={{ color: "#666", fontSize: 14 }}>{activeOrder.duration}</span>
                  <span style={{ color: "#bbb" }}>·</span>
                  <span style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>Delivering to {activeOrder.customer.name.split(" ")[0]}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#1a73e818", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏠</div>
                  <div>
                    <div style={{ color: "#1a1a1a", fontWeight: 700, fontSize: 14 }}>{activeOrder.customer.name}</div>
                    <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{activeOrder.customer.fullAddress}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {phase === "at-restaurant" && activeOrder && <PickupPanel order={activeOrder} onPickedUp={handlePickedUp} />}
          {phase === "delivered" && activeOrder && <DeliveredPanel order={activeOrder} tip={currentTip} rankedUp={rankedUp} onNext={handleNextAfterDelivery} />}
        </>
      )}

      <style>{`
        @keyframes slideUp  { from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1} }
        @keyframes fadeIn   { from{opacity:0}to{opacity:1} }
        @keyframes pulse    { 0%,100%{opacity:1}50%{opacity:0.3} }
        @keyframes rankUp   { 0%{transform:scale(0.8);opacity:0}60%{transform:scale(1.05)}100%{transform:scale(1);opacity:1} }
        @keyframes spin     { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes mapPulse { 0%{r:28;opacity:0.6}100%{r:42;opacity:0} }
        .ubtn{transition:all 0.15s ease;cursor:pointer}
        .ubtn:hover{filter:brightness(0.9)}
        .ubtn:active{transform:scale(0.97)}
        ::-webkit-scrollbar{display:none}
      `}</style>
    </div>
  );
}
