import { useState, useEffect } from "react";
import Onboarding, { type DriverProfile } from "@/pages/Onboarding";
import Login from "@/pages/Login";
import DocExpiry from "@/pages/DocExpiry";
import Game from "@/pages/Game";

const PROFILE_KEY = "uber_eats_driver_profile";
const STATE_KEY = "uber_eats_game_state";
const LOGIN_THRESHOLD = 5;

export type { DriverProfile };

export default function App() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [showDocExpiry, setShowDocExpiry] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PROFILE_KEY);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (!p.email) {
          localStorage.removeItem(PROFILE_KEY);
          localStorage.removeItem(STATE_KEY);
        } else {
          setProfile(p);
        }
      } catch { localStorage.removeItem(PROFILE_KEY); }
    }
    setLoaded(true);
  }, []);

  // Handle doc expiry done — redirect to game after "done" state in DocExpiry
  useEffect(() => {
    if (!showDocExpiry && loggedIn === false && profile && loaded) {
      // nothing yet — handled by onVerify
    }
  }, [showDocExpiry, loggedIn, profile, loaded]);

  const handleSignup = (p: DriverProfile) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
    const state = { totalEarnings: 0, tripCount: 0, loginCount: 1 };
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    setProfile(p);
    setLoggedIn(true);
  };

  const handleLogin = (email: string, password: string): boolean => {
    if (!profile) return false;
    const emailMatch = email.toLowerCase() === (profile.email ?? "").toLowerCase();
    const passMatch  = password === profile.password;
    if (!emailMatch || !passMatch) return false;
    const stateRaw = localStorage.getItem(STATE_KEY);
    const state = stateRaw ? JSON.parse(stateRaw) : { totalEarnings: 0, tripCount: 0, loginCount: 0 };
    state.loginCount = (state.loginCount ?? 0) + 1;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    if (state.loginCount >= LOGIN_THRESHOLD) {
      setShowDocExpiry(true);
    } else {
      setLoggedIn(true);
    }
    return true;
  };

  const handleDocVerify = (name: string, password: string): boolean => {
    if (!profile) return false;
    if (name.toLowerCase() !== profile.name.toLowerCase() || password !== profile.password) return false;
    const stateRaw = localStorage.getItem(STATE_KEY);
    const state = stateRaw ? JSON.parse(stateRaw) : {};
    state.loginCount = 0;
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    // Let the DocExpiry component show its "done" countdown, then redirect
    setTimeout(() => {
      setShowDocExpiry(false);
      setLoggedIn(true);
    }, 8000);
    return true;
  };

  if (!loaded) return null;
  if (!profile) return <Onboarding onComplete={handleSignup} />;
  if (showDocExpiry) return <DocExpiry profile={profile} onVerify={handleDocVerify} />;
  if (!loggedIn) return <Login profile={profile} onLogin={handleLogin} />;
  return <Game profile={profile} stateKey={STATE_KEY} />;
}
