// app/components/GWCellPopover.tsx
"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, Shield, Clock, TrendingUp, Activity } from "lucide-react";

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
  const { raw, context, defcon } = data;
  const shotsPlayer = context?.player?.shots90_recent ?? context?.player?.shots90_season ?? null;
  const shotsAllowedOpp = context?.opponent?.shotsAllowed90_recent ?? null;
  const xgaOpp = context?.opponent?.xGA90_recent ?? raw.oppXga90 ?? null;
  
  const pStartNum = (raw.pStart ?? 0) * 100;
  const p60Num = (raw.p60 ?? 0) * 100;
  const csProbNum = (raw.csProb ?? 0) * 100;
  const defconProbNum = (defcon?.prob ?? 0) * 100;

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-[380px] p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 pb-2 border-b">
          <div>
            <div className="font-semibold text-base">{data.fixture}</div>
            <div className="text-xs text-muted-foreground">Gameweek {gw}</div>
          </div>
          <Badge variant="outline" className="text-lg font-bold px-3 py-1">
            {data.xPts.toFixed(1)} pts
          </Badge>
        </div>

        <div className="space-y-3">
          {/* Attack Section */}
          <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/20 dark:to-red-950/20 rounded-lg p-3 border border-orange-200 dark:border-orange-900">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              <span className="font-semibold text-sm">Атака</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ожидаемые голы (xG)</span>
                <Badge variant="secondary" className="font-mono">{fmt(raw.xG)}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Ожидаемые ассисты (xA)</span>
                <Badge variant="secondary" className="font-mono">{fmt(raw.xA)}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Удары за 90 мин</span>
                <span className="font-medium">{fmt(shotsPlayer)} vs {fmt(shotsAllowedOpp, 1)} <span className="text-xs text-muted-foreground">допускает</span></span>
              </div>
              {xgaOpp != null && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Оборона соперника (xGA)</span>
                  <Badge variant={xgaOpp >= 1.5 ? "default" : "outline"} className="font-mono">
                    {fmt(xgaOpp)} <span className="text-xs ml-1">L5</span>
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Playing Time Section */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 rounded-lg p-3 border border-blue-200 dark:border-blue-900">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="font-semibold text-sm">Игровое время</span>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Вероятность старта</span>
                  <span className="text-xs font-semibold">{pct(raw.pStart)}</span>
                </div>
                <Progress value={pStartNum} className="h-1.5" />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Вероятность 60+ минут</span>
                  <span className="text-xs font-semibold">{pct(raw.p60)}</span>
                </div>
                <Progress value={p60Num} className="h-1.5" />
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-muted-foreground text-sm">Ожидаемые минуты</span>
                <Badge variant="outline" className="font-mono">{fmt(raw.eMin, 0)}′</Badge>
              </div>
            </div>
          </div>

          {/* Defense Section */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-lg p-3 border border-green-200 dark:border-green-900">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-sm">Оборона</span>
            </div>
            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">Вероятность чистого листа</span>
                  <span className="text-xs font-semibold">{pct(raw.csProb)}</span>
                </div>
                <Progress value={csProbNum} className="h-1.5" />
              </div>
              {defcon?.prob != null && position !== "GOALKEEPER" && (
                <div className="pt-1 border-t border-green-200 dark:border-green-800">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-muted-foreground">DEFCON бонус (порог {defcon.threshold ?? (position === "DEFENDER" ? 10 : 12)})</span>
                    <span className="text-xs font-semibold">{pct(defcon.prob)}</span>
                  </div>
                  <Progress value={defconProbNum} className="h-1.5" />
                  <div className="text-xs text-muted-foreground mt-1">
                    Ожидаемо: <span className="font-semibold text-foreground">+{(2 * (defcon.prob || 0)).toFixed(2)}</span> очка
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Breakdown Summary */}
          <div className="grid grid-cols-4 gap-2 pt-2 border-t">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Атака</div>
              <div className="font-semibold text-sm">{data.breakdown.attack.toFixed(1)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Оборона</div>
              <div className="font-semibold text-sm">{data.breakdown.defense.toFixed(1)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Бонус</div>
              <div className="font-semibold text-sm">{data.breakdown.bonus.toFixed(1)}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-0.5">Выход</div>
              <div className="font-semibold text-sm">{data.breakdown.appearance.toFixed(1)}</div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
