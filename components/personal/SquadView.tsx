import React from 'react';

interface Player {
  id: number;
  webName: string;
  position: string;
  team: {
    shortName: string;
  };
  fplStats: {
    totalPoints: number;
  }[];
}

interface Pick {
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  player: Player;
}

export function SquadView({ picks, gameweek }: { picks: Pick[], gameweek: number }) {
  const startingXI = picks.filter(p => p.position <= 11);
  const bench = picks.filter(p => p.position > 11);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Gameweek {gameweek} Results</h2>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
        <div className="p-5 pb-3 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white">Starting XI</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {startingXI.map((pick) => (
              <PlayerCard key={pick.position} pick={pick} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800/50 bg-slate-900/50">
        <div className="p-5 pb-3 border-b border-slate-800/50">
          <h3 className="text-lg font-semibold text-slate-400">Bench</h3>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {bench.map((pick) => (
              <PlayerCard key={pick.position} pick={pick} isBench />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ pick, isBench = false }: { pick: Pick; isBench?: boolean }) {
  const positionColors: Record<string, string> = {
    GOALKEEPER: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    DEFENDER: "bg-green-500/20 text-green-400 border-green-500/30",
    MIDFIELDER: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    FORWARD: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  const positionColor = positionColors[pick.player.position] || "bg-slate-700 text-slate-300";

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${
      isBench 
        ? "bg-slate-800/30 border-slate-700/50" 
        : "bg-slate-800 border-slate-700"
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border ${positionColor}`}>
          {pick.player.position.slice(0, 3)}
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-sm text-white flex items-center gap-1">
            {pick.player.webName}
            {pick.isCaptain && (
              <span className="ml-1 text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">C</span>
            )}
            {pick.isViceCaptain && (
              <span className="ml-1 text-[10px] bg-slate-500 text-white px-1.5 py-0.5 rounded font-bold">V</span>
            )}
          </span>
          <span className="text-xs text-slate-400">{pick.player.team.shortName}</span>
        </div>
      </div>
      <div className={`text-sm font-bold ${
        (pick.player.fplStats[0]?.totalPoints || 0) > 5 
          ? "text-emerald-400" 
          : "text-slate-300"
      }`}>
        {pick.player.fplStats[0]?.totalPoints || 0} pts
      </div>
    </div>
  );
}
