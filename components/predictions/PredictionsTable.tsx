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
import { ArrowUpDown } from "lucide-react";

interface Prediction {
  playerId: number;
  playerName: string;
  xPts: number;
  breakdown: {
    appearance: number;
    attack: number;
    defense: number;
    bonus: number;
    other: number;
  };
  raw: {
    xG: number;
    xA: number;
    csProb: number;
  };
  fixture: string;
  position?: string; // API might need to return this or we infer
  price?: number;    // API might need to return this
}

export function PredictionsTable() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameweek, setGameweek] = useState<number>(0);
  
  // Filters
  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("ALL");
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'xPts',
    direction: 'desc'
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/predictions");
        const data = await res.json();
        setPredictions(data.predictions);
        setGameweek(data.gameweek);
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

  const filteredData = predictions
    .filter((p) => {
      const matchesSearch = p.playerName.toLowerCase().includes(search.toLowerCase());
      // Note: API currently doesn't return position in the top level object, 
      // we might need to update API or just rely on it being there.
      // Let's assume for now we might need to fix API if position is missing.
      // Checking route.ts... it returns what PredictionService returns.
      // PredictionService returns { playerId, playerName, xPts, breakdown, raw }
      // It does NOT return position or price in the response object explicitly unless I added it.
      // I should check route.ts again. 
      // route.ts maps: ...prediction, fixture...
      // It does NOT add position/price. I need to fix route.ts to include them for the UI to work well.
      // For now I will comment out position filtering logic or make it loose.
      return matchesSearch; 
    })
    .sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.key);
      const bValue = getNestedValue(b, sortConfig.key);
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

  // Helper to get nested values like 'breakdown.attack'
  function getNestedValue(obj: any, path: string) {
    return path.split('.').reduce((o, i) => o?.[i], obj);
  }

  if (loading) return <div>Loading predictions...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">GW {gameweek} Projections</h2>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[200px]"
          />
          {/* Position Filter - Placeholder until API returns position */}
          {/* 
          <Select value={positionFilter} onValueChange={setPositionFilter}>
            <SelectTrigger className="w-[150px]">
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
          */}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Player</TableHead>
              <TableHead>Fixture</TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('xPts')}>
                  xPts <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('breakdown.attack')}>
                  Att <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('breakdown.defense')}>
                  Def <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => handleSort('breakdown.bonus')}>
                  Bonus <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>xG</TableHead>
              <TableHead>xA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((player) => (
              <TableRow key={player.playerId}>
                <TableCell className="font-medium">{player.playerName}</TableCell>
                <TableCell>{player.fixture}</TableCell>
                <TableCell className="font-bold text-lg">{player.xPts.toFixed(2)}</TableCell>
                <TableCell>{player.breakdown.attack.toFixed(2)}</TableCell>
                <TableCell>{player.breakdown.defense.toFixed(2)}</TableCell>
                <TableCell>{player.breakdown.bonus.toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{player.raw.xG.toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{player.raw.xA.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
