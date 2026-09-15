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

  useEffect(() => {
    Object.keys(localStorage).filter((key) => key.startsWith("penta-office:draft:")).forEach((key) => localStorage.removeItem(key));
    const storedTheme = localStorage.getItem("penta-office:theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(storedTheme ? storedTheme === "dark" : prefersDark);
    setLargeText(localStorage.getItem("penta-office:large-text") === "true");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("penta-office:theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    document.documentElement.classList.toggle("large-text", largeText);
    localStorage.setItem("penta-office:large-text", String(largeText));
  }, [largeText]);

  return <PreferencesContext.Provider value={{ dark, largeText, toggleDark: () => setDark((value) => !value), toggleLargeText: () => setLargeText((value) => !value) }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("PreferencesProvider가 필요합니다.");
  return context;
}
