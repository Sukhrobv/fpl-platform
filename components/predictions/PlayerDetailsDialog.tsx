// app/components/PlayerDetailsDialog.tsx
"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type RawExplain = {
  xG: number; xA: number; csProb: number;
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

interface PlayerDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: {
    playerName: string;
    position: string;
    price: number;
    team: string;
    teamShort: string;
    totalXPts: number;
    history: Record<number, {
      xPts: number;
      fixture: string;
      opponent: string;
      isHome: boolean;
      breakdown: { appearance: number; attack: number; defense: number; bonus: number; };
      raw: RawExplain;
      // NEW:
      context?: GWContext;
      defcon?: { prob: number; mean?: number; threshold?: number } | null;
    }>;
  };
  gameweeks: number[];
}

const fmt = (x?: number | null, digits = 2) =>
  x == null || Number.isNaN(x) ? "—" : Number(x).toFixed(digits);
const pct = (x?: number | null, digits = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(Number(x) * 100).toFixed(digits)}%`;
function trend(a?: number | null, b?: number | null) {
  if (a == null || b == null) return { dir: 0, text: "" };
  if (a > b * 1.1)  return { dir: +1, text: "выше сезонного уровня" };
  if (a < b * 0.9)  return { dir: -1, text: "ниже сезонного уровня" };
  return { dir: 0, text: "на уровне сезона" };
}

export function PlayerDetailsDialog({ open, onOpenChange, player, gameweeks }: PlayerDetailsDialogProps) {
  const avgXPts = player.totalXPts / gameweeks.length;
  const [gwSelected, setGwSelected] = React.useState<number>(gameweeks[0]);

  const gwList = gameweeks.filter(gw => player.history[gw]);
  React.useEffect(() => {
    if (!gwList.includes(gwSelected) && gwList.length > 0) setGwSelected(gwList[0]);
  }, [open]); // при каждом открытии актуализируем выбранный GW

  const dataSel = player.history[gwSelected];

  // агрегаты по доступным рядам
  const rows = gameweeks.map(gw => player.history[gw]).filter(Boolean);
  const mean = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
  const avgLambdaAtt = mean(rows.map(r => r.raw?.lambdaAtt ?? 0));
  const avgLambdaDef = mean(rows.map(r => r.raw?.lambdaDef ?? 0));
  const avgOppXga    = mean(rows.map(r => r.raw?.oppXga90 ?? 0));
  const avgOppDeep   = mean(rows.map(r => r.raw?.oppDeep ?? 0));
  const avgPstart    = mean(rows.map(r => r.raw?.pStart ?? 0));
  const avgP60       = mean(rows.map(r => r.raw?.p60 ?? 0));
  const avgEmins     = mean(rows.map(r => r.raw?.eMin ?? 0));
  const avgDefconP   = mean(rows.map(r => r.defcon?.prob ?? 0));

  // подготовка “доводов” для выбранного GW
  const ctx = dataSel?.context;
  const isHome = ctx?.venue?.isHome ?? dataSel?.isHome ?? false;

  const shots90_r = ctx?.player?.shots90_recent ?? ctx?.player?.shots90_season ?? null;
  const xG90_r    = ctx?.player?.xG90_recent    ?? ctx?.player?.xG90_season    ?? null;
  const xA90_r    = ctx?.player?.xA90_recent    ?? ctx?.player?.xA90_season    ?? null;

  const xGA_op_r  = ctx?.opponent?.xGA90_recent ?? dataSel?.raw?.oppXga90 ?? null;
  const deep_op_r = ctx?.opponent?.deep_recent  ?? dataSel?.raw?.oppDeep  ?? null;
  const shOpp_r   = ctx?.opponent?.shotsAllowed90_recent ?? null;

  const t_xG = trend(xG90_r, ctx?.player?.xG90_season ?? null);
  const t_xA = trend(xA90_r, ctx?.player?.xA90_season ?? null);
  const t_sh = trend(shots90_r, ctx?.player?.shots90_season ?? null);

  const oppDefLabel =
    xGA_op_r != null
      ? (xGA_op_r >= 1.8 ? "слабая оборона (L5)"
         : xGA_op_r <= 1.2 ? "сильная оборона (L5)"
         : "средняя оборона (L5)")
      : "оборона (сезон/L5)";

  const deepLabel =
    deep_op_r != null
      ? (deep_op_r >= 9 ? "много deep входов (L5)"
         : deep_op_r <= 6 ? "мало deep входов (L5)"
         : "средне deep (L5)")
      : "deep (сезон/L5)";

  const defconLine = dataSel?.defcon?.prob != null
    ? `DEFCON: ${pct(dataSel.defcon.prob)} (порог ${dataSel.defcon.threshold ?? "—"}), ожидаемо +${(2 * (dataSel.defcon.prob || 0)).toFixed(2)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="text-xl">{player.playerName}</div>
              <div className="text-sm text-muted-foreground">
                {player.team} • {player.position} • £{(player.price / 10).toFixed(1)}
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-md text-xs border">
              {isHome ? "Home" : "Away"}
            </span>
          </DialogTitle>
          <DialogDescription>
            Contextual breakdown &amp; rationale for the next {gameweeks.length} gameweeks
          </DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 my-4">
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{player.totalXPts.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Total xPts (next {gameweeks.length})</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-primary">{(player.totalXPts / gameweeks.length).toFixed(2)}</div>
            <div className="text-xs text-muted-foreground">Avg xPts per GW</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold">λ_att {fmt(avgLambdaAtt)} • λ_def {fmt(avgLambdaDef)}</div>
            <div className="text-xs text-muted-foreground">Opp xGA/90 {fmt(avgOppXga)} • deep {fmt(avgOppDeep, 1)}</div>
          </div>
          <div className="bg-muted/40 rounded-lg p-3 text-center">
            <div className="text-lg font-semibold">
              P(start) {pct(avgPstart)} • P60 {pct(avgP60)} • E[min] {fmt(avgEmins, 0)}′
            </div>
            {avgDefconP > 0 && (
              <div className="text-xs text-muted-foreground">DEFCON avg P(hit) {pct(avgDefconP)}</div>
            )}
          </div>
        </div>

        {/* WHY THIS PROJECTION (selected GW) */}
        {dataSel && (
          <div className="rounded-lg border p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Why this projection — GW {gwSelected}</div>
              <Select value={String(gwSelected)} onValueChange={(v) => setGwSelected(Number(v))}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {gwList.map(gw => <SelectItem key={gw} value={String(gw)}>GW {gw}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {/* Attacking rationale */}
              <div className="rounded-md border p-3 bg-card">
                <div className="text-sm font-semibold mb-2">Attacking context</div>
                <ul className="text-sm space-y-1.5">
                  <li>
                    Удары: <b>{fmt(shots90_r)}</b> /90 {t_sh.text ? `(${t_sh.text})` : ""}; соперник допускает{" "}
                    <b>{fmt(shOpp_r, 1)}</b> /90 <span className="text-muted-foreground">(L5)</span>.
                  </li>
                  <li>
                    Ваша <b>xG90 {fmt(xG90_r)}</b> и <b>xA90 {fmt(xA90_r)}</b> <span className="text-muted-foreground">(L5{ctx?.player?.xG90_recent ? "" : "/season"})</span>.
                  </li>
                  <li>
                    Соперник: <b>{oppDefLabel}</b>, <b>{deepLabel}</b>.
                    {xGA_op_r != null && <> xGA(L5): <b>{fmt(xGA_op_r)}</b></>}
                    {deep_op_r != null && <>; DeepAllowed(L5): <b>{fmt(deep_op_r, 1)}</b></>}
                  </li>
                </ul>
              </div>

              {/* Defensive & reliability */}
              <div className="rounded-md border p-3 bg-card">
                <div className="text-sm font-semibold mb-2">Reliability & defensive</div>
                <ul className="text-sm space-y-1.5">
                  <li>Вероятность CS: <b>{pct(dataSel.raw.csProb)}</b>{dataSel.raw.lambdaDef != null && <> • λ_def <b>{fmt(dataSel.raw.lambdaDef)}</b></>}</li>
                  {dataSel.defcon && (
                    <li>DEFCON порог {dataSel.defcon.threshold}: шанс <b>{pct(dataSel.defcon.prob)}</b>, ожидаемо <b>+{(2*(dataSel.defcon.prob||0)).toFixed(2)}</b> очка.</li>
                  )}
                  <li>Итог: <b>{dataSel.xPts.toFixed(2)}</b> = атака <b>{dataSel.breakdown.attack.toFixed(2)}</b> + оборона <b>{dataSel.breakdown.defense.toFixed(2)}</b> + бонус <b>{dataSel.breakdown.bonus.toFixed(2)}</b> + выход <b>{dataSel.breakdown.appearance.toFixed(2)}</b>.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[70px]">GW</TableHead>
                <TableHead className="min-w-[120px]">Fixture</TableHead>
                <TableHead className="text-center w-[80px]">xPts</TableHead>
                <TableHead className="text-center w-[70px]">Attack</TableHead>
                <TableHead className="text-center w-[70px]">Defense</TableHead>
                <TableHead className="text-center w-[70px]">Bonus</TableHead>
                <TableHead className="text-center w-[80px]">Appear.</TableHead>
                <TableHead className="text-center w-[60px]">xG</TableHead>
                <TableHead className="text-center w-[60px]">xA</TableHead>
                <TableHead className="text-center w-[60px]">CS%</TableHead>
                <TableHead className="text-center w-[70px]">DEFCON%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gameweeks.map(gw => {
                const d = player.history[gw];
                if (!d) {
                  return (
                    <TableRow key={gw}>
                      <TableCell className="font-medium">GW {gw}</TableCell>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        Blank Gameweek
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={gw} className={cn(gw === gwSelected && "bg-muted/20")}>
                    <TableCell className="font-medium">GW {gw}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{d.opponent}</span>
                        <span className="text-xs text-muted-foreground">{d.isHome ? 'Home' : 'Away'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-lg">{d.xPts.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-sm">{d.breakdown.attack.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-sm">{d.breakdown.defense.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-sm">{d.breakdown.bonus.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-sm">{d.breakdown.appearance.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{d.raw.xG.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{d.raw.xA.toFixed(2)}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{(d.raw.csProb * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">{d.defcon?.prob != null ? (d.defcon.prob * 100).toFixed(0) + "%" : "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
