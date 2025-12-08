// app/components/GWCellPopover.tsx
"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Target, Shield, Clock } from "lucide-react";

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
    context?: GWContext;
    defcon?: { prob: number; mean?: number; threshold?: number } | null;
  };
  gw: number;
  position?: string;
}

const fmt = (x?: number | null, d = 2) =>
  x == null || Number.isNaN(x) ? "—" : Number(x).toFixed(d);
const pct = (x?: number | null, d = 0) =>
  x == null || Number.isNaN(x) ? "—" : `${(Number(x) * 100).toFixed(d)}%`;

export function GWCellPopover({ children, data, gw, position }: GWCellPopoverProps) {
  const { raw, context } = data;
  const shotsPlayer = context?.player?.shots90_recent ?? context?.player?.shots90_season ?? null;
  const xgaOpp = context?.opponent?.xGA90_recent ?? raw.oppXga90 ?? null;
  
  const pStartNum = (raw.pStart ?? 0) * 100;
  const csProbNum = (raw.csProb ?? 0) * 100;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[400px] p-0 bg-[#0f111a] border border-slate-800 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-[#141620] border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Gameweek {gw}</div>
              <div className="text-2xl font-black text-white leading-tight mb-2">{data.fixture}</div>
              <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-bold px-2 py-0.5 text-xs rounded-md">
                {data.isHome ? "DOM" : "AWAY"}
              </Badge>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black text-emerald-400 leading-none tracking-tight">{data.xPts.toFixed(1)}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">XPTS</div>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Attack Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-orange-500" />
              <span className="font-bold text-xs uppercase tracking-wider text-orange-500">Ataka</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-[#141620] border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-medium text-slate-500 mb-1 uppercase">xG (Голы)</div>
                <div className="text-2xl font-bold text-white tracking-tight">{fmt(raw.xG)}</div>
              </div>
              <div className="bg-[#141620] border border-slate-800 rounded-lg p-3">
                <div className="text-[10px] font-medium text-slate-500 mb-1 uppercase">xA (Ассисты)</div>
                <div className="text-2xl font-bold text-white tracking-tight">{fmt(raw.xA)}</div>
              </div>
            </div>

            <div className="space-y-2 px-1">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-400 font-medium">Удары / 90</span>
                <span className="font-bold text-white">{fmt(shotsPlayer, 1)}</span>
              </div>
              {xgaOpp != null && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 font-medium">Допущенные xGA (L5)</span>
                  <span className="font-bold text-white">{fmt(xgaOpp)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Playing Time Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="font-bold text-xs uppercase tracking-wider text-blue-500">Игровое время</span>
            </div>
            <div className="bg-[#141620] border border-slate-800 rounded-lg p-3 space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-medium text-slate-400">Вероятность старта</span>
                  <span className="text-xs font-bold text-white">{pct(raw.pStart)}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${pStartNum}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800/50">
                <span className="text-xs font-medium text-slate-400">Ожидаемые минуты</span>
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-400 border-0 font-mono text-xs">
                  {fmt(raw.eMin, 0)} min
                </Badge>
              </div>
            </div>
          </div>

          {/* Defense Section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              <span className="font-bold text-xs uppercase tracking-wider text-emerald-500">Оборона</span>
            </div>
            <div className="bg-[#141620] border border-slate-800 rounded-lg p-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-medium text-slate-400">Вероятность CS</span>
                <span className="text-xs font-bold text-white">{pct(raw.csProb)}</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full" 
                  style={{ width: `${csProbNum}%` }}
                />
              </div>
            </div>
          </div>

          {/* Breakdown Summary */}
          <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-800">
            <div className="text-center p-2 bg-[#141620] rounded-lg border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">ATT</div>
              <div className="font-bold text-white text-sm">{data.breakdown.attack.toFixed(1)}</div>
            </div>
            <div className="text-center p-2 bg-[#141620] rounded-lg border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">DEF</div>
              <div className="font-bold text-white text-sm">{data.breakdown.defense.toFixed(1)}</div>
            </div>
            <div className="text-center p-2 bg-[#141620] rounded-lg border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">BONUS</div>
              <div className="font-bold text-white text-sm">{data.breakdown.bonus.toFixed(1)}</div>
            </div>
            <div className="text-center p-2 bg-[#141620] rounded-lg border border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">APP</div>
              <div className="font-bold text-white text-sm">{data.breakdown.appearance.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
