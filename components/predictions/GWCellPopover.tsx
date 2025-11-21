"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
    raw: {
      xG: number;
      xA: number;
      csProb: number;
    };
  };
  gw: number;
}

export function GWCellPopover({ children, data, gw }: GWCellPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="center">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h4 className="font-semibold text-sm">GW {gw}</h4>
              <p className="text-xs text-muted-foreground">{data.fixture}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-primary">{data.xPts.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">xPts</div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-2">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase">Points Breakdown</h5>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-base">⚽</span>
                  <span>Attack</span>
                </span>
                <span className="font-semibold">{data.breakdown.attack.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-base">🛡️</span>
                  <span>Defense</span>
                </span>
                <span className="font-semibold">{data.breakdown.defense.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-base">⭐</span>
                  <span>Bonus</span>
                </span>
                <span className="font-semibold">{data.breakdown.bonus.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-base">👤</span>
                  <span>Appearance</span>
                </span>
                <span className="font-semibold">{data.breakdown.appearance.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Raw Stats */}
          <div className="space-y-2 border-t pt-2">
            <h5 className="text-xs font-semibold text-muted-foreground uppercase">Underlying Stats</h5>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-muted/50 rounded p-2">
                <div className="text-xs text-muted-foreground">xG</div>
                <div className="text-sm font-semibold">{data.raw.xG.toFixed(2)}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-xs text-muted-foreground">xA</div>
                <div className="text-sm font-semibold">{data.raw.xA.toFixed(2)}</div>
              </div>
              <div className="bg-muted/50 rounded p-2">
                <div className="text-xs text-muted-foreground">CS%</div>
                <div className="text-sm font-semibold">{(data.raw.csProb * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
