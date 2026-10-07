"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Preferences = {
  dark: boolean;
  largeText: boolean;
  toggleDark: () => void;
  toggleLargeText: () => void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Object.keys(localStorage).filter((key) => key.startsWith("penta-office:block-draft:")).forEach((key) => localStorage.removeItem(key));
    const storedTheme = localStorage.getItem("penta-office:theme");
    // Older versions saved the OS theme as if it were a user choice. Reset that once.
    const hasExplicitTheme = localStorage.getItem("penta-office:theme-version") === "2";
    setDark(hasExplicitTheme && storedTheme === "dark");
    setLargeText(localStorage.getItem("penta-office:large-text") === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("penta-office:theme", dark ? "dark" : "light");
    localStorage.setItem("penta-office:theme-version", "2");
  }, [dark, ready]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.classList.toggle("large-text", largeText);
    localStorage.setItem("penta-office:large-text", String(largeText));
  }, [largeText, ready]);

  return <PreferencesContext.Provider value={{ dark, largeText, toggleDark: () => setDark((value) => !value), toggleLargeText: () => setLargeText((value) => !value) }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("PreferencesProvider가 필요합니다.");
  return context;
}
