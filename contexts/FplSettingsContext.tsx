"use client";

// contexts/FplSettingsContext.tsx
// Context for storing FPL ID and user settings

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type InterfaceDensity = "compact" | "comfortable";
export type AssistantLanguage = "auto" | "en" | "ru";

interface FplSettings {
  fplId: string;
  setFplId: (id: string) => void;
  density: InterfaceDensity;
  setDensity: (density: InterfaceDensity) => void;
  assistantLanguage: AssistantLanguage;
  setAssistantLanguage: (language: AssistantLanguage) => void;
  autoSync: boolean;
  setAutoSync: (enabled: boolean) => void;
}

const FplSettingsContext = createContext<FplSettings | undefined>(undefined);

const STORAGE_KEY = "fpl_settings";

export function FplSettingsProvider({ children }: { children: ReactNode }) {
  const [fplId, setFplIdState] = useState<string>("");
  const [density, setDensityState] = useState<InterfaceDensity>("comfortable");
  const [assistantLanguage, setAssistantLanguageState] =
    useState<AssistantLanguage>("auto");
  const [autoSync, setAutoSyncState] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (typeof parsed.fplId === "string") {
          setFplIdState(parsed.fplId);
        }
        if (parsed.density === "compact" || parsed.density === "comfortable") {
          setDensityState(parsed.density);
        }
        if (["auto", "en", "ru"].includes(parsed.assistantLanguage)) {
          setAssistantLanguageState(parsed.assistantLanguage);
        }
        if (typeof parsed.autoSync === "boolean") {
          setAutoSyncState(parsed.autoSync);
        }
      }
    } catch {
      // Ignore errors
    }
    setIsLoaded(true);
  }, []);

  const persist = (next: {
    fplId: string;
    density: InterfaceDensity;
    assistantLanguage: AssistantLanguage;
    autoSync: boolean;
  }) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore errors
    }
  };

  const value = useMemo<FplSettings>(
    () => ({
      fplId,
      setFplId: (id) => {
        setFplIdState(id);
        persist({ fplId: id, density, assistantLanguage, autoSync });
      },
      density,
      setDensity: (nextDensity) => {
        setDensityState(nextDensity);
        persist({
          fplId,
          density: nextDensity,
          assistantLanguage,
          autoSync,
        });
      },
      assistantLanguage,
      setAssistantLanguage: (language) => {
        setAssistantLanguageState(language);
        persist({ fplId, density, assistantLanguage: language, autoSync });
      },
      autoSync,
      setAutoSync: (enabled) => {
        setAutoSyncState(enabled);
        persist({ fplId, density, assistantLanguage, autoSync: enabled });
      },
    }),
    [assistantLanguage, autoSync, density, fplId],
  );

  // Don't render children until settings are loaded
  if (!isLoaded) {
    return null;
  }

  return (
    <FplSettingsContext.Provider value={value}>
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
