"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  Gauge,
  Languages,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  useFplSettings,
  type AssistantLanguage,
  type InterfaceDensity,
} from "@/contexts/FplSettingsContext";
import { validFplId } from "./model";
import { cn } from "@/lib/utils";
import { FreshnessState } from "@/components/decision/DecisionPrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AccountState = "unlinked" | "checking" | "stored" | "saved" | "error";
type SyncState = "idle" | "syncing" | "current" | "unavailable";

async function storedSquadExists(fplId: string) {
  try {
    return (await fetch(`/api/personal/${fplId}/squad`)).ok;
  } catch {
    return false;
  }
}

export function SettingsWorkspace() {
  const {
    fplId,
    setFplId,
    density,
    setDensity,
    assistantLanguage,
    setAssistantLanguage,
    autoSync,
    setAutoSync,
  } = useFplSettings();
  const [draftId, setDraftId] = useState(fplId);
  const [accountState, setAccountState] = useState<AccountState>(
    fplId ? "checking" : "unlinked",
  );
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftId(fplId);
    if (!fplId) {
      setAccountState("unlinked");
      return;
    }

    let cancelled = false;
    setAccountState("checking");
    storedSquadExists(fplId).then((stored) => {
      if (cancelled) return;
      setAccountState(stored ? "stored" : "saved");
    });
    return () => {
      cancelled = true;
    };
  }, [fplId]);

  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = draftId.trim();
    if (!validFplId(normalized)) {
      setAccountState("error");
      setMessage("Enter the numeric ID found after /entry/ in your FPL URL.");
      return;
    }
    setFplId(normalized);
    setAccountState("checking");
    setMessage("FPL ID saved on this device. Checking for a stored squad.");
    setAccountState((await storedSquadExists(normalized)) ? "stored" : "saved");
  };

  const syncTeam = async () => {
    if (!validFplId(fplId)) return;
    setSyncState("syncing");
    setMessage(null);
    try {
      const response = await fetch(`/api/personal/${fplId}/sync`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Fresh sync unavailable");
      setSyncState("current");
      setAccountState("stored");
      setMessage("Fresh squad sync completed.");
    } catch {
      setSyncState("unavailable");
      setMessage(
        accountState === "stored"
          ? "The live endpoint is not ready. Your last stored squad remains available."
          : "The live endpoint is not ready and no stored squad was found for this ID.",
      );
    }
  };

  const accountMeta = {
    unlinked: { label: "Not linked", tone: "text-muted-foreground" },
    checking: { label: "Checking stored squad", tone: "text-uncertainty" },
    stored: { label: "Stored squad available", tone: "text-fresh" },
    saved: { label: "ID saved · no stored squad", tone: "text-stale" },
    error: { label: "ID needs attention", tone: "text-risk" },
  }[accountState];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-8 max-w-2xl">
        <p className="text-[10px] font-black tracking-[0.16em] text-primary uppercase">
          Workspace control
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
          Account, interface and evidence
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Link your team without confusing a saved ID, a stored squad and a
          successful live sync. Preferences stay on this device.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.75fr)]">
        <div className="space-y-6">
          <section
            className="border border-border bg-card"
            aria-labelledby="account-heading"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center border border-foreground bg-foreground text-background">
                  <Link2 className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h2 id="account-heading" className="font-black">
                    FPL account
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your public team ID is enough. No FPL password is required.
                  </p>
                </div>
              </div>
              <span className={cn("text-[10px] font-black", accountMeta.tone)}>
                {accountMeta.label}
              </span>
            </div>
            <form onSubmit={saveAccount} className="p-5">
              <label className="text-xs font-black" htmlFor="fpl-id">
                FPL team ID
              </label>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Find it in fantasy.premierleague.com/entry/
                <strong>123456</strong>/event/…
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="fpl-id"
                  type="text"
                  inputMode="numeric"
                  value={draftId}
                  onChange={(event) => setDraftId(event.target.value)}
                  placeholder="e.g. 123456"
                  aria-invalid={accountState === "error"}
                />
                <Button type="submit">
                  <Check data-icon="inline-start" aria-hidden="true" />
                  Save ID
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={syncTeam}
                  disabled={!fplId || syncState === "syncing"}
                >
                  <RefreshCw
                    className={cn(
                      syncState === "syncing" &&
                        "animate-spin motion-reduce:animate-none",
                    )}
                    data-icon="inline-start"
                    aria-hidden="true"
                  />
                  Try live sync
                </Button>
              </div>
              {message && (
                <p
                  className={cn(
                    "mt-4 flex items-start gap-2 border px-3 py-2.5 text-xs",
                    accountState === "error" || syncState === "unavailable"
                      ? "border-uncertainty/45 bg-uncertainty/5"
                      : "border-border bg-muted/35",
                  )}
                  role={accountState === "error" ? "alert" : "status"}
                >
                  {syncState === "syncing" ? (
                    <LoaderCircle
                      className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  ) : syncState === "unavailable" ? (
                    <AlertTriangle
                      className="size-4 shrink-0 text-uncertainty"
                      aria-hidden="true"
                    />
                  ) : (
                    <ShieldCheck
                      className="size-4 shrink-0 text-fresh"
                      aria-hidden="true"
                    />
                  )}
                  {message}
                </p>
              )}
            </form>
          </section>

          <section
            className="border border-border bg-card"
            aria-labelledby="preferences-heading"
          >
            <div className="border-b border-border p-5">
              <h2 id="preferences-heading" className="font-black">
                Interface preferences
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Controls apply across dense tables, decision screens and the
                assistant.
              </p>
            </div>
            <div className="divide-y divide-border">
              <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex gap-3">
                  <Gauge
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-black">Information density</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose tighter controls or more breathing room.
                    </p>
                  </div>
                </div>
                <Select
                  value={density}
                  onValueChange={(value) =>
                    setDensity(value as InterfaceDensity)
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compact">Compact</SelectItem>
                    <SelectItem value="comfortable">Comfortable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="flex gap-3">
                  <Languages
                    className="mt-0.5 size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-xs font-black">Assistant language</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Auto follows the language of each question.
                    </p>
                  </div>
                </div>
                <Select
                  value={assistantLanguage}
                  onValueChange={(value) =>
                    setAssistantLanguage(value as AssistantLanguage)
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto-detect</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ru">Русский</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="text-xs font-black">Automatic sync attempts</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Off is safer while the new-season endpoint is pending.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoSync}
                  onClick={() => setAutoSync(!autoSync)}
                  className={cn(
                    "relative h-7 w-12 shrink-0 border transition-colors",
                    autoSync
                      ? "border-primary bg-primary"
                      : "border-border bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 size-4 bg-background transition-transform",
                      autoSync ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                  <span className="sr-only">Automatic sync attempts</span>
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section
            className="border border-border bg-card p-5"
            aria-labelledby="data-heading"
          >
            <div className="flex items-center gap-2">
              <Database
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 id="data-heading" className="font-black">
                Data status
              </h2>
            </div>
            <div className="mt-5 space-y-4">
              <div className="border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black">2025/26 evidence</p>
                  <FreshnessState status="frozen" />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Complete historical baseline retained for priors and audit.
                </p>
              </div>
              <div className="border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black">2026/27 official feed</p>
                  <FreshnessState status="pending" />
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Publication stays disabled until the official bootstrap passes
                  its gate.
                </p>
              </div>
            </div>
          </section>

          <section className="border border-uncertainty/40 bg-uncertainty/5 p-5">
            <p className="text-xs font-black">What the states mean</p>
            <ol className="mt-3 space-y-3 text-xs leading-5 text-muted-foreground">
              <li>
                <strong className="text-foreground">1 · ID saved</strong> —
                stored only on this device.
              </li>
              <li>
                <strong className="text-foreground">2 · Squad available</strong>{" "}
                — a previous valid snapshot exists.
              </li>
              <li>
                <strong className="text-foreground">3 · Live sync</strong> —
                confirmed only after the official endpoint responds.
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
