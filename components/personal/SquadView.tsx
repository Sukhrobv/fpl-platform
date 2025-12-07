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

interface SquadViewProps {
  picks: Pick[];
}

export function SquadView({ picks, gameweek }: { picks: Pick[], gameweek: number }) {
  const startingXI = picks.filter(p => p.position <= 11);
  const bench = picks.filter(p => p.position > 11);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Gameweek {gameweek} Results</h2>
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold leading-none tracking-tight">Starting XI</h3>
        </div>
        <div className="p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {startingXI.map((pick) => (
              <PlayerCard key={pick.position} pick={pick} />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/50 text-muted-foreground shadow-sm">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold leading-none tracking-tight">Bench</h3>
        </div>
        <div className="p-6 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {bench.map((pick) => (
              <PlayerCard key={pick.position} pick={pick} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ pick }: { pick: Pick }) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-md bg-background">
      <div className="flex items-center gap-3">
        <div className="flex flex-col">
          <span className="font-medium text-sm">
            {pick.player.webName} 
            {pick.isCaptain && <span className="ml-1 text-xs bg-yellow-500 text-black px-1 rounded">C</span>}
            {pick.isViceCaptain && <span className="ml-1 text-xs bg-gray-300 text-black px-1 rounded">V</span>}
          </span>
          <span className="text-xs text-muted-foreground">{pick.player.team.shortName} • {pick.player.position}</span>
        </div>
      </div>
      <div className="font-bold text-sm">
        {pick.player.fplStats[0]?.totalPoints || 0} pts
      </div>
    </div>
  );
}
