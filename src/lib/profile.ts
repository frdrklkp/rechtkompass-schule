import { useEffect, useState } from "react";

export const FUNKTIONEN = [
  "Fachlehrkraft",
  "Klassenleitung",
  "Bildungsgangleitung",
  "Abteilungsleitung",
  "Schulleitung",
  "Beratungsteam",
  "Schulsozialarbeit",
  "Sonderpädagogik",
  "Praxisanleitung",
  "Sekretariat",
] as const;
export type Funktion = (typeof FUNKTIONEN)[number];

export const BILDUNGSGAENGE = [
  "Berufsschule – Industriemechanik",
  "Berufsschule – Elektrotechnik",
  "Berufsschule – Metalltechnik",
  "Berufsschule – Kfz-Mechatronik",
  "Berufsschule – Einzelhandel",
  "Berufsschule – Büromanagement",
  "Berufsschule – Bankkaufleute",
  "Berufsschule – Gastronomie",
  "Berufsschule – Gesundheit und Pflege",
  "Berufsschule – Erzieher:in",
  "Berufliches Gymnasium – Wirtschaft",
  "Berufliches Gymnasium – Gesundheit",
  "Berufliches Gymnasium – Technik",
  "Höhere Berufsfachschule – Wirtschaft",
  "Höhere Berufsfachschule – Gesundheit",
  "Fachoberschule – Wirtschaft",
  "Fachoberschule – Technik",
  "Fachoberschule – Sozial- und Gesundheitswesen",
  "Fachschule – Heilerziehungspflege",
  "Fachschule – Sozialpädagogik",
  "Ausbildungsvorbereitung (AV)",
  "Internationale Förderklasse (IFK)",
] as const;

export type TimeMode = "quick" | "normal" | "full";

export interface Profile {
  funktion: Funktion;
  bildungsgang: string;
  createdAt: string;
}

const PROFILE_KEY = "rk_profile_v1";
const TIME_KEY = "rk_time_mode_v1";
const CHECKLIST_KEY = "rk_checklist_v1";

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("rk-profile-changed"));
}

export function clearProfile() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PROFILE_KEY);
  window.dispatchEvent(new Event("rk-profile-changed"));
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
    const handler = () => setProfile(loadProfile());
    window.addEventListener("rk-profile-changed", handler);
    return () => window.removeEventListener("rk-profile-changed", handler);
  }, []);
  return { profile, ready, setProfile: (p: Profile) => { saveProfile(p); setProfile(p); } };
}

export function useTimeMode(): [TimeMode, (m: TimeMode) => void] {
  const [mode, setMode] = useState<TimeMode>("normal");
  useEffect(() => {
    const raw = (typeof window !== "undefined" && localStorage.getItem(TIME_KEY)) as TimeMode | null;
    if (raw === "quick" || raw === "normal" || raw === "full") setMode(raw);
    const handler = () => {
      const v = localStorage.getItem(TIME_KEY) as TimeMode | null;
      if (v) setMode(v);
    };
    window.addEventListener("rk-time-changed", handler);
    return () => window.removeEventListener("rk-time-changed", handler);
  }, []);
  const set = (m: TimeMode) => {
    localStorage.setItem(TIME_KEY, m);
    setMode(m);
    window.dispatchEvent(new Event("rk-time-changed"));
  };
  return [mode, set];
}

export function useChecklistState(caseId: string, length: number) {
  const key = `${CHECKLIST_KEY}:${caseId}`;
  const [checked, setChecked] = useState<boolean[]>(() => Array(length).fill(false));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw) as boolean[];
        if (Array.isArray(arr) && arr.length === length) setChecked(arr);
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, length]);
  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };
  const reset = () => {
    const next = Array(length).fill(false);
    setChecked(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return { checked, toggle, reset };
}
