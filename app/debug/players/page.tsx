"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Player {
  id: number;
  webName: string;
  team: { shortName: string };
  position: string;
  nowCost: number;
  totalPoints: number;
  form: number;
  selectedBy: number;
  status: string;
}

export default function DebugPlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState("");
  const [teamId, setTeamId] = useState("all");
  const [position, setPosition] = useState("all");
  const [status, setStatus] = useState("all");
  
  const [sortBy, setSortBy] = useState("totalPoints");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    // Fetch teams for filter
    fetch("/api/teams?sortBy=name")
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setTeams(json.data.items);
      });
  }, []);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: "20",
        sortBy,
        sortDir: "desc",
      });
      
      if (search) params.set("search", search);
      if (teamId && teamId !== "all") params.set("teamId", teamId);
      if (position && position !== "all") params.set("position", position);
      if (status && status !== "all") params.set("status", status);

      const res = await fetch(`/api/players?${params}`);
      const json = await res.json();
      if (json.success) {
        setPlayers(json.data.items);
        setTotalPages(json.data.totalPages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlayers();
  }, [page, sortBy, teamId, position, status]);

  return (
    <div className="container mx-auto p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Debug: Players API</h1>
        <div className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 p-4 bg-muted/50 rounded-lg">
        <Input
          placeholder="Search player..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchPlayers()}
          className="max-w-[200px]"
        />
        
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id.toString()}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={position} onValueChange={setPosition}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Positions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            <SelectItem value="GOALKEEPER">Goalkeepers</SelectItem>
            <SelectItem value="DEFENDER">Defenders</SelectItem>
            <SelectItem value="MIDFIELDER">Midfielders</SelectItem>
            <SelectItem value="FORWARD">Forwards</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="a">Available</SelectItem>
            <SelectItem value="d">Doubtful</SelectItem>
            <SelectItem value="i">Injured</SelectItem>
            <SelectItem value="u">Unavailable</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="totalPoints">Total Points</SelectItem>
            <SelectItem value="nowCost">Price</SelectItem>
            <SelectItem value="form">Form</SelectItem>
            <SelectItem value="selectedBy">Ownership</SelectItem>
            <SelectItem value="ictIndex">ICT Index</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={fetchPlayers}>Apply Search</Button>
      </div>

      <div className="border rounded-md bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Pos</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">Form</TableHead>
              <TableHead className="text-right">Owned %</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center h-24">
                  Loading...
                </TableCell>
              </TableRow>
            ) : (
              players.map((player) => (
                <TableRow key={player.id}>
                  <TableCell className="font-medium">{player.webName}</TableCell>
                  <TableCell>{player.team?.shortName}</TableCell>
                  <TableCell>{player.position}</TableCell>
                  <TableCell className="text-right">
                    £{(player.nowCost / 10).toFixed(1)}m
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {player.totalPoints}
                  </TableCell>
                  <TableCell className="text-right">{player.form}</TableCell>
                  <TableCell className="text-right">
                    {player.selectedBy}%
                  </TableCell>
                  <TableCell>
                    {player.status === 'a' ? (
                      <span className="text-green-600 font-bold">Avail</span>
                    ) : (
                      <span className="text-red-500 font-bold">{player.status}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
