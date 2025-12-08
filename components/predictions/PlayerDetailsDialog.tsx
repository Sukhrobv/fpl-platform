// app/components/PlayerDetailsDialog.tsx
"use client";

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Target, Shield, Clock, TrendingUp, TrendingDown } from "lucide-react";

type RawExplain = {
  xG: number; xA: number; csProb: number;
  pStart?: number; eMin?: number;
  oppXga90?: number;
};

type GWContext = {
  player?: {
    xG90_recent?: number | null;
    xA90_recent?: number | null;
    xG90_season?: number | null;
    xA90_season?: number | null;
  };
  opponent?: {
    xGA90_recent?: number | null;
  };
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
      context?: GWContext;
    }>;
  };
  gameweeks: number[];
}

const fmt = (x?: number | null, digits = 2) =>
  x == null || Number.isNaN(x) ? "—" : Number(x).toFixed(digits);
const pct = (x?: number | null, digits = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(Number(x) * 100).toFixed(digits)}%`;

function trend(a?: number | null, b?: number | null) {
  if (a == null || b == null) return { dir: 0 };
  if (a > b * 1.1) return { dir: +1 };
  if (a < b * 0.9) return { dir: -1 };
  return { dir: 0 };
}

export function PlayerDetailsDialog({ open, onOpenChange, player, gameweeks }: PlayerDetailsDialogProps) {
  const [gwSelected, setGwSelected] = React.useState<number>(gameweeks[0]);

  const gwList = gameweeks.filter(gw => player.history[gw]);
  React.useEffect(() => {
    if (!gwList.includes(gwSelected) && gwList.length > 0) setGwSelected(gwList[0]);
  }, [open]);

  const dataSel = player.history[gwSelected];

  // Calculate aggregates
  const rows = gameweeks.map(gw => player.history[gw]).filter(Boolean);
  const mean = (arr: number[]) => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
  const avgXPts = player.totalXPts / gameweeks.length;
  const avgEmins = mean(rows.map(r => r.raw?.eMin ?? 0));

  // For selected GW
  const ctx = dataSel?.context;
  const xG90_r = ctx?.player?.xG90_recent ?? ctx?.player?.xG90_season ?? null;
  const xA90_r = ctx?.player?.xA90_recent ?? ctx?.player?.xA90_season ?? null;
  const xGA_op_r = ctx?.opponent?.xGA90_recent ?? dataSel?.raw?.oppXga90 ?? null;

  const t_xG = trend(xG90_r, ctx?.player?.xG90_season);
  const t_xA = trend(xA90_r, ctx?.player?.xA90_season);

  // Opponent defense strength label
  const oppStrength = xGA_op_r != null
    ? (xGA_op_r >= 1.5 ? "Strong" : xGA_op_r <= 1.0 ? "Weak" : "Medium")
    : "—";

  const pStartNum = (dataSel?.raw?.pStart ?? 0) * 100;
  const csProbNum = (dataSel?.raw?.csProb ?? 0) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl max-h-[95vh] overflow-y-auto bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-3xl">
            <div>
              {player.playerName}
              <span className="ml-4 text-xl text-emerald-400 font-mono">£{(player.price / 10).toFixed(1)}m</span>
            </div>
          </DialogTitle>
          <div className="text-slate-400 text-base mt-2">
            {player.teamShort} • {player.position}
          </div>
        </DialogHeader>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-6">
          <div className="bg-emerald-900/30 border-2 border-emerald-700/50 rounded-xl p-4 text-center">
            <div className="text-4xl font-bold text-emerald-400">{player.totalXPts.toFixed(1)}</div>
            <div className="text-xs text-slate-400 mt-2 uppercase tracking-wide font-semibold">Всего xPts (5 GW)</div>
          </div>
          <div className="bg-blue-900/30 border-2 border-blue-700/50 rounded-xl p-4 text-center">
            <div className="text-4xl font-bold text-blue-400">{avgXPts.toFixed(1)}</div>
            <div className="text-xs text-slate-400 mt-2 uppercase tracking-wide font-semibold">Средний xPts / GW</div>
          </div>
          <div className="bg-orange-900/30 border-2 border-orange-700/50 rounded-xl p-4 text-center">
            <div className="text-4xl font-bold text-orange-400">{fmt(xGA_op_r)}</div>
            <div className="text-xs text-slate-400 mt-2 uppercase tracking-wide font-semibold">OPP xGA (GW{gwSelected})</div>
          </div>
          <div className="bg-purple-900/30 border-2 border-purple-700/50 rounded-xl p-4 text-center">
            <div className="text-4xl font-bold text-purple-400">{fmt(avgEmins, 0)}</div>
            <div className="text-xs text-slate-400 mt-2 uppercase tracking-wide font-semibold">Exp. Minutes</div>
          </div>
        </div>

        {/* Gameweek Analysis Section */}
        <div className="border-t-2 border-slate-800 pt-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold">Gameweek Analysis</h3>
            <Select value={String(gwSelected)} onValueChange={(v) => setGwSelected(Number(v))}>
              <SelectTrigger className="w-[200px] bg-slate-900 border-slate-800 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                {gwList.map(gw => (
                  <SelectItem key={gw} value={String(gw)}>
                    GW {gw} vs {player.history[gw]?.opponent}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dataSel && (
            <div className="grid grid-cols-3 gap-6">
              {/* Left Column - Attack (takes 1/3) */}
              <div className="col-span-1">
                <div className="bg-slate-900/80 border-2 border-slate-800 rounded-xl p-5 h-full">
                  <div className="flex items-center gap-2 mb-5">
                    <Target className="h-5 w-5 text-orange-400" />
                    <span className="font-bold text-base uppercase tracking-wide text-orange-400">Атакующий потенциал</span>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                      <span className="text-sm text-slate-400">xG / 90</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xl">{fmt(xG90_r)}</span>
                        {t_xG.dir !== 0 && (
                          t_xG.dir > 0 ? <TrendingUp className="h-4 w-4 text-green-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-slate-800">
                      <span className="text-sm text-slate-400">xA / 90</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xl">{fmt(xA90_r)}</span>
                        {t_xA.dir !== 0 && (
                          t_xA.dir > 0 ? <TrendingUp className="h-4 w-4 text-green-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm text-slate-400">Оборона соп. (xGA)</span>
                      <Badge variant={oppStrength === "Strong" ? "destructive" : "outline"} className="text-sm font-bold">
                        {oppStrength}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Middle Column - Time & Defence (takes 1/3) */}
              <div className="col-span-1 space-y-6">
                {/* Playing Time */}
                <div className="bg-slate-900/80 border-2 border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="h-5 w-5 text-blue-400" />
                    <span className="font-bold text-base uppercase tracking-wide text-blue-400">Игровое время</span>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-sm text-slate-400">Start Probability</span>
                      <span className="text-lg font-bold">{pct(dataSel.raw.pStart)}</span>
                    </div>
                    <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${pStartNum}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Reliability */}
                <div className="bg-slate-900/80 border-2 border-slate-800 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="h-5 w-5 text-green-400" />
                    <span className="font-bold text-base uppercase tracking-wide text-green-400">Надежность</span>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2.5">
                      <span className="text-sm text-slate-400">Clean Sheet %</span>
                      <span className="text-lg font-bold">{pct(dataSel.raw.csProb)}</span>
                    </div>
                    <div className="bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-green-500 h-full rounded-full transition-all"
                        style={{ width: `${csProbNum}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Matches Table (takes 1/3) */}
              <div className="col-span-1">
                <div className="bg-slate-900/80 border-2 border-slate-800 rounded-xl p-5 h-full">
                  <h4 className="text-sm font-bold uppercase tracking-wider mb-4 text-slate-400">Все матчи (Next 5)</h4>
                  <div className="space-y-1">
                    <div className="grid grid-cols-[50px_1fr_60px] gap-2 pb-2 border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase">
                      <div>GW</div>
                      <div>OPP</div>
                      <div className="text-right">xPts</div>
                    </div>
                    {gameweeks.map(gw => {
                      const d = player.history[gw];
                      if (!d) return null;
                      return (
                        <div 
                          key={gw} 
                          className={`grid grid-cols-[50px_1fr_60px] gap-2 py-2.5 border-b border-slate-800/50 ${gw === gwSelected ? 'bg-slate-800/50 -mx-2 px-2 rounded' : ''}`}
                        >
                          <div className="font-bold text-base">{gw}</div>
                          <div className="text-sm">
                            <span className="font-semibold">{d.opponent}</span>
                            <span className="text-xs text-slate-500 ml-1.5">({d.isHome ? "H" : "A"})</span>
                          </div>
                          <div className="text-right font-bold text-emerald-400 text-base">{d.xPts.toFixed(1)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
