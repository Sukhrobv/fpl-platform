"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { GWCellPopover } from "./GWCellPopover";
import { PlayerDetailsDialog } from "./PlayerDetailsDialog";

interface GWData {
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
}

interface Prediction {
  playerId: number;
  playerName: string;
  position: string;
  price: number;
  team: string;
  teamShort: string;
  totalXPts: number;
  history: Record<number, GWData>;
}

const TEAM_CODES: Record<string, number> = {
  ARS: 3, AVL: 7, BOU: 91, BRE: 94, BHA: 36, CHE: 8, CRY: 31, EVE: 11, FUL: 54, IPS: 40,
  LEI: 13, LIV: 14, MCI: 43, MUN: 1, NEW: 4, NFO: 17, SOU: 20, TOT: 6, WHU: 21, WOL: 39
};

export function PredictionsTable() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [gameweeks, setGameweeks] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [maxPrice, setMaxPrice] = useState<number>(150); // 15.0

  // Dialog state
  const [selectedPlayer, setSelectedPlayer] = useState<Prediction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'totalXPts',
    direction: 'desc'
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/predictions?range=5");
        const data = await res.json();
        setPredictions(data.predictions);
        setGameweeks(data.gameweeks);
      } catch (error) {
        console.error("Failed to fetch predictions", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleSort = (key: string) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const uniqueTeams = Array.from(new Set((predictions || []).map(p => p.teamShort))).sort();

  const filteredData = (predictions || [])
    .filter((p) => {
      const matchesSearch = p.playerName.toLowerCase().includes(search.toLowerCase());
      const matchesPosition = positionFilter === "ALL" || p.position === positionFilter;
      const matchesTeam = teamFilter === "ALL" || p.teamShort === teamFilter;
      const matchesPrice = p.price <= maxPrice;
      
      return matchesSearch && matchesPosition && matchesTeam && matchesPrice;
    })
    .sort((a, b) => {
      let aValue: any = a[sortConfig.key as keyof Prediction];
      let bValue: any = b[sortConfig.key as keyof Prediction];

      if (sortConfig.key === 'totalXPts') {
        aValue = a.totalXPts;
        bValue = b.totalXPts;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  const getXPtsColor = (xPts: number) => {
    if (xPts >= 6) return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
    if (xPts >= 4) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    if (xPts >= 2) return 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
    return 'bg-gray-50 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400 border-gray-100 dark:border-gray-800';
  };

  if (loading) return <div className="text-center p-10">Loading projections...</div>;

  return (
    <div className="space-y-4">
      {/* Filters Header */}
      <div className="flex flex-col gap-4 bg-card p-4 rounded-lg border shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">FPL Projections</h2>
            <p className="text-sm text-muted-foreground">
              Next {gameweeks.length} Gameweeks • {filteredData.length} players found
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Input
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
          
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Positions</SelectItem>
              <SelectItem value="GOALKEEPER">Goalkeepers</SelectItem>
              <SelectItem value="DEFENDER">Defenders</SelectItem>
              <SelectItem value="MIDFIELDER">Midfielders</SelectItem>
              <SelectItem value="FORWARD">Forwards</SelectItem>
            </SelectContent>
          </Select>

          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Teams</SelectItem>
              {uniqueTeams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-4 px-2 border rounded-md">
            <span className="text-sm font-medium whitespace-nowrap">Max £{(maxPrice / 10).toFixed(1)}</span>
            <Slider
              value={[maxPrice]}
              min={35}
              max={150}
              step={1}
              onValueChange={(val) => setMaxPrice(val[0])}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-md border bg-card shadow-sm overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[200px] sticky left-0 bg-muted/50 z-10">Player</TableHead>
              <TableHead className="w-[100px]">Team</TableHead>
              <TableHead className="w-[80px]">
                <Button variant="ghost" size="sm" onClick={() => handleSort('price')} className="-ml-3 h-8">
                  Price <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead className="w-[80px] text-center font-bold border-l border-r bg-muted/30">
                <Button variant="ghost" size="sm" onClick={() => handleSort('totalXPts')} className="h-8">
                  Total <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              {gameweeks.map(gw => (
                <TableHead key={gw} className="text-center min-w-[100px]">
                  GW {gw}
                </TableHead>
              ))}
              <TableHead className="w-[60px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5 + gameweeks.length} className="h-24 text-center">
                  No results found.
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((player) => (
                <TableRow key={player.playerId} className="hover:bg-muted/50">
                  <TableCell className="font-medium sticky left-0 bg-card z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                    <div className="flex items-center gap-3">
                      {TEAM_CODES[player.teamShort] && (
                        <img 
                          src={`https://resources.premierleague.com/premierleague/badges/50/t${TEAM_CODES[player.teamShort]}.png`} 
                          alt={player.teamShort}
                          className="w-8 h-8 object-contain"
                          loading="lazy"
                        />
                      )}
                      <div className="flex flex-col">
                        <span className="text-base truncate max-w-[120px]" title={player.playerName}>{player.playerName}</span>
                        <span className="text-xs text-muted-foreground capitalize">{player.position.toLowerCase()}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{player.teamShort}</TableCell>
                  <TableCell>£{(player.price / 10).toFixed(1)}</TableCell>
                  <TableCell className="text-center font-bold text-lg border-l border-r bg-muted/10">
                    {player.totalXPts.toFixed(1)}
                  </TableCell>
                  {gameweeks.map(gw => {
                    const data = player.history[gw];
                    if (!data) return <TableCell key={gw} className="text-center text-muted-foreground">-</TableCell>;
                    
                    return (
                      <TableCell key={gw} className="p-2">
                        <GWCellPopover data={data} gw={gw}>
                          <div className={`flex flex-col items-center justify-center p-1.5 rounded-md border cursor-pointer hover:shadow-md transition-shadow ${getXPtsColor(data.xPts)}`}>
                            <span className="text-xs font-semibold mb-0.5">{data.opponent}</span>
                            <span className="text-sm font-bold">{data.xPts.toFixed(1)}</span>
                          </div>
                        </GWCellPopover>
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedPlayer(player);
                        setDialogOpen(true);
                      }}
                      className="h-8 w-8 p-0"
                      title="View detailed breakdown"
                    >
                      <Info className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Player Details Dialog */}
      {selectedPlayer && (
        <PlayerDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          player={selectedPlayer}
          gameweeks={gameweeks}
        />
      )}
    </div>
  );
}
