"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
    }>;
  };
  gameweeks: number[];
}

export function PlayerDetailsDialog({ open, onOpenChange, player, gameweeks }: PlayerDetailsDialogProps) {
  const avgXPts = player.totalXPts / gameweeks.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] lg:max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span className="text-xl">{player.playerName}</span>
              <span className="text-sm text-muted-foreground ml-3">
                {player.team} • {player.position} • £{(player.price / 10).toFixed(1)}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription>
            Detailed prediction breakdown for the next {gameweeks.length} gameweeks
          </DialogDescription>
        </DialogHeader>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 my-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">{player.totalXPts.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">Total xPts</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary">{avgXPts.toFixed(2)}</div>
            <div className="text-sm text-muted-foreground">Avg xPts per GW</div>
          </div>
        </div>

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
              </TableRow>
            </TableHeader>
            <TableBody>
              {gameweeks.map(gw => {
                const data = player.history[gw];
                if (!data) {
                  return (
                    <TableRow key={gw}>
                      <TableCell className="font-medium">GW {gw}</TableCell>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        Blank Gameweek
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <TableRow key={gw}>
                    <TableCell className="font-medium">GW {gw}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{data.opponent}</span>
                        <span className="text-xs text-muted-foreground">{data.isHome ? 'Home' : 'Away'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-bold text-lg">
                      {data.xPts.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {data.breakdown.attack.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {data.breakdown.defense.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {data.breakdown.bonus.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {data.breakdown.appearance.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {data.raw.xG.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {data.raw.xA.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {(data.raw.csProb * 100).toFixed(0)}%
                    </TableCell>
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
