// app/components/GWCellPopover.tsx
"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type RawExplain = {
  xG: number; xA: number; csProb: number;
  // опциональные поля, если сервер их шлёт:
  lambdaAtt?: number; lambdaDef?: number;
  teamXg90?: number; oppXga90?: number; oppDeep?: number; rPpda?: number;
  pStart?: number; p60?: number; eMin?: number;
  gShare?: number; aShare?: number; role?: string;
};

type GWContext = {
  player?: {
    xG90_recent?: number | null;
    xA90_recent?: number | null;
    shots90_recent?: number | null;
    xG90_season?: number | null;
    xA90_season?: number | null;
    shots90_season?: number | null;
  };
  opponent?: {
    xGA90_recent?: number | null;
    deep_recent?: number | null;
    shotsAllowed90_recent?: number | null;
  };
  venue?: { isHome: boolean };
};

interface GWCellPopoverProps {
  children: React.ReactNode;
  data: {
    xPts: number;
    fixture: string;
    opponent: string;
    isHome: boolean;
    breakdown: {
      appearance: number;
      attack: number;
      defense: number;
      bonus: number;
    };
    raw: RawExplain;
    // опционально:
    context?: GWContext;
    defcon?: { prob: number; mean?: number; threshold?: number } | null;
  };
  gw: number;
  position?: string; // "FORWARD"|"MIDFIELDER"|"DEFENDER"|"GOALKEEPER"
}

const fmt = (x?: number | null, d = 2) =>
  x == null || Number.isNaN(x) ? "—" : Number(x).toFixed(d);
const pct = (x?: number | null, d = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(Number(x) * 100).toFixed(d)}%`;

export function GWCellPopover({ children, data, gw, position }: GWCellPopoverProps) {
  const { raw, context, defcon } = data;
  const shotsPlayer =
    context?.player?.shots90_recent ??
    context?.player?.shots90_season ??
    null;
  const shotsAllowedOpp = context?.opponent?.shotsAllowed90_recent ?? null;
  const xgaOpp = context?.opponent?.xGA90_recent ?? raw.oppXga90 ?? null;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[320px] p-3">
        <div className="text-xs text-muted-foreground mb-1">
          GW {gw} • {data.fixture}
        </div>

        <div className="space-y-2">
          <section>
            <div className="text-[11px] uppercase tracking-wide text-foreground/70 mb-1">
              Атака — почему такая проекция
            </div>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>
                Удары: вы <b>{fmt(shotsPlayer)}</b>/90 vs соперник допускает{" "}
                <b>{fmt(shotsAllowedOpp, 1)}</b>/90 <span className="text-muted-foreground">(L5)</span>
              </li>
              <li>
                xG {fmt(raw.xG)} • xA {fmt(raw.xA)}; оборона соперника (L5) xGA {fmt(xgaOpp)}
              </li>
            </ul>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-foreground/70 mb-1">
              Минуты / надёжность
            </div>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>
                P(start) {pct(raw.pStart)} • P60 {pct(raw.p60)} • E[min] {fmt(raw.eMin, 0)}′
              </li>
              {raw.role && (
                <li>Роль: <b>{raw.role}</b> (gShare {pct(raw.gShare)}, aShare {pct(raw.aShare)})</li>
              )}
            </ul>
          </section>

          <section>
            <div className="text-[11px] uppercase tracking-wide text-foreground/70 mb-1">
              Оборона
            </div>
            <ul className="list-disc pl-4 text-sm space-y-0.5">
              <li>CS: {pct(raw.csProb)}{raw.lambdaDef != null ? ` • λ_def=${fmt(raw.lambdaDef)}` : ""}</li>
              {defcon?.prob != null && position !== "GOALKEEPER" && (
                <li>
                  DEFCON: порог {defcon.threshold ?? (position === "DEFENDER" ? 10 : 12)} • P(hit) {pct(defcon.prob)} • ожид. +{(2 * defcon.prob).toFixed(2)}
                </li>
              )}
            </ul>
          </section>

          <div className="pt-2 border-t text-xs">
            <span className="font-medium">xPts:</span> {data.xPts.toFixed(2)} •
            <span className="ml-1">Attack:</span> {data.breakdown.attack.toFixed(2)} •
            <span className="ml-1">Defense:</span> {data.breakdown.defense.toFixed(2)} •
            <span className="ml-1">Bonus:</span> {data.breakdown.bonus.toFixed(2)}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
