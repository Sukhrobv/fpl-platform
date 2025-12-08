// app/components/PredictionsTable.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Info, Filter, Search } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { GWCellPopover } from "./GWCellPopover";
import { PlayerDetailsDialog } from "./PlayerDetailsDialog";
import { PredictionSummaryCards } from "./PredictionSummaryCards";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  raw: RawExplain;
  context?: GWContext;
  defcon?: { prob: number; mean?: number; threshold?: number } | null;
}

interface Prediction {
  playerId: number;
  playerName: string;
  position: "GOALKEEPER" | "DEFENDER" | "MIDFIELDER" | "FORWARD";
  price: number;
  team: string;
  teamShort: string;
  totalXPts: number;
  history: Record<number, GWData>;
}

const TEAM_CODES: Record<string, number> = {
  ARS: 3, AVL: 7, BOU: 91, BRE: 94, BHA: 36, BUR: 3, CHE: 8, CRY: 31, EVE: 11, FUL: 54, 
  IPS: 40, LEE: 11, LEI: 13, LIV: 14, MCI: 43, MUN: 1, NEW: 4, NFO: 17, SOU: 20, 
  SUN: 17, TOT: 6, WHU: 21, WOL: 39
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

  const uniqueTeams = Array.from(new Set(predictions.map(p => p.teamShort))).sort();

  const filteredData = predictions
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
      } else if (sortConfig.key === 'price') {
        aValue = a.price;
        bValue = b.price;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  // Heatmap color function
  const getHeatmapStyle = (xPts: number) => {
    // Scale: 0 to 8+
    // 0-2: Gray/Red
    // 2-4: Yellow/Orange
    // 4-6: Green
    // 6+: Bright Green/Blue
    
    if (xPts >= 7) return { bg: 'bg-[#00ff87]/20', text: 'text-[#00ff87]', border: 'border-[#00ff87]/30' };
    if (xPts >= 5) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    if (xPts >= 3.5) return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' };
    if (xPts >= 2) return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' };
    return { bg: 'bg-slate-500/5', text: 'text-slate-400', border: 'border-slate-500/10' };
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-slate-400 animate-pulse">Analyzing fixtures & stats...</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <PredictionSummaryCards predictions={predictions} />

      {/* Main Content Area */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center bg-slate-900">
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative w-full lg:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search player..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-slate-800 border-slate-700 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
              />
            </div>
            
            {/* Mobile Filters Trigger could go here */}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700">
                <SelectValue placeholder="Position" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="ALL">All Positions</SelectItem>
                <SelectItem value="GOALKEEPER">GK</SelectItem>
                <SelectItem value="DEFENDER">DEF</SelectItem>
                <SelectItem value="MIDFIELDER">MID</SelectItem>
                <SelectItem value="FORWARD">FWD</SelectItem>
              </SelectContent>
            </Select>

            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="ALL">All Teams</SelectItem>
                {uniqueTeams.map(team => (
                  <SelectItem key={team} value={team}>{team}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="bg-slate-800 border-slate-700 gap-2">
                  <Filter className="h-4 w-4" />
                  Price: £{(maxPrice / 10).toFixed(1)}m
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 bg-slate-900 border-slate-800">
                <div className="space-y-4">
                  <h4 className="font-medium leading-none">Max Price</h4>
                  <div className="flex items-center gap-4">
                    <Slider
                      value={[maxPrice]}
                      min={35}
                      max={150}
                      step={1}
                      onValueChange={(val) => setMaxPrice(val[0])}
                      className="flex-1"
                    />
                    <span className="w-12 text-sm font-mono text-right">
                      £{(maxPrice / 10).toFixed(1)}
                    </span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-900">
              <TableRow className="hover:bg-transparent border-slate-800">
                <TableHead className="w-[250px] sticky left-0 bg-slate-900 z-20 pl-6 text-slate-400">Player</TableHead>
                <TableHead className="w-[100px] text-center text-slate-400">Team</TableHead>
                <TableHead className="w-[100px] text-center cursor-pointer hover:text-white transition-colors text-slate-400" onClick={() => handleSort('price')}>
                  <div className="flex items-center justify-center gap-1">
                    Price <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[100px] text-center font-bold bg-slate-800 cursor-pointer hover:bg-slate-700 transition-colors" onClick={() => handleSort('totalXPts')}>
                  <div className="flex items-center justify-center gap-1 text-emerald-400">
                    Total <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                {gameweeks.map(gw => (
                  <TableHead key={gw} className="text-center min-w-[110px] text-xs uppercase tracking-wider text-slate-400">
                    GW {gw}
                  </TableHead>
                ))}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5 + gameweeks.length} className="h-32 text-center text-slate-400">
                    No players found matching your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((player) => (
                  <TableRow key={player.playerId} className="hover:bg-slate-800 border-slate-800 transition-colors group">
                    <TableCell className="font-medium sticky left-0 bg-slate-900 group-hover:bg-slate-800 transition-colors z-20 pl-6 border-r border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {TEAM_CODES[player.teamShort] && (
                            <img 
                              src={`https://resources.premierleague.com/premierleague/badges/50/t${TEAM_CODES[player.teamShort]}.png`} 
                              alt={player.teamShort}
                              className="w-9 h-9 object-contain drop-shadow-md"
                              loading="lazy"
                            />
                          )}
                          <div className="absolute -bottom-1 -right-1 bg-slate-900 text-[10px] px-1 rounded border border-slate-700 text-slate-400">
                            {player.position.substring(0, 3)}
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors truncate max-w-[140px]" title={player.playerName}>
                            {player.playerName}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-slate-400 text-xs">{player.teamShort}</TableCell>
                    <TableCell className="text-center font-mono text-sm">£{(player.price / 10).toFixed(1)}</TableCell>
                    <TableCell className="text-center font-bold text-lg bg-slate-800 border-x border-slate-800 text-emerald-400 font-mono">
                      {player.totalXPts.toFixed(1)}
                    </TableCell>
                    {gameweeks.map(gw => {
                      const d = player.history[gw];
                      if (!d) {
                        return <TableCell key={gw} className="text-center text-slate-500">-</TableCell>;
                      }
                      const style = getHeatmapStyle(d.xPts);
                      return (
                        <TableCell key={gw} className="p-1">
                          <GWCellPopover data={d} gw={gw} position={player.position}>
                            <div className={`
                              flex flex-col items-center justify-center py-2 px-1 rounded-md border cursor-pointer 
                              transition-all duration-200 hover:scale-105 hover:shadow-lg hover:brightness-110
                              ${style.bg} ${style.border}
                            `}>
                              <span className="text-[10px] font-medium opacity-70 mb-0.5">{d.opponent}</span>
                              <span className={`text-sm font-bold font-mono ${style.text}`}>{d.xPts.toFixed(1)}</span>
                            </div>
                          </GWCellPopover>
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedPlayer(player);
                          setDialogOpen(true);
                        }}
                        className="h-8 w-8 opacity-50 group-hover:opacity-100 transition-opacity hover:bg-slate-700 hover:text-emerald-400 text-slate-500"
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
        
        <div className="p-4 border-t border-slate-800 bg-slate-900 text-xs text-center text-slate-400">
          Showing {filteredData.length} players • Projections based on xG, xA, and recent form.
        </div>
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
