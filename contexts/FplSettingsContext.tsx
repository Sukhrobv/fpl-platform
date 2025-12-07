"use client";

// contexts/FplSettingsContext.tsx
// Context for storing FPL ID and user settings

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface FplSettings {
  fplId: string;
  setFplId: (id: string) => void;
}

const FplSettingsContext = createContext<FplSettings | undefined>(undefined);

const STORAGE_KEY = "fpl_settings";

export function FplSettingsProvider({ children }: { children: ReactNode }) {
  const [fplId, setFplIdState] = useState<string>("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.fplId) {
          setFplIdState(parsed.fplId);
        }
      }
    } catch {
      // Ignore errors
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage when fplId changes
  const setFplId = (id: string) => {
    setFplIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ fplId: id }));
    } catch {
      // Ignore errors
    }
  };

  // Don't render children until settings are loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <FplSettingsContext.Provider value={{ fplId, setFplId }}>
      {children}
    </FplSettingsContext.Provider>
  );
}

export function useFplSettings() {
  const context = useContext(FplSettingsContext);
  if (!context) {
    throw new Error("useFplSettings must be used within FplSettingsProvider");
  }
  return context;
}
