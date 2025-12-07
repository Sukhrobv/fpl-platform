import React from 'react';

interface TemplateComparisonProps {
  eliteEoMap: { [playerId: number]: number };
  userPicks: { id: number; player: { fplId: number; webName: string } }[];
}

export function TemplateComparison({ eliteEoMap, userPicks }: TemplateComparisonProps) {
  // Identify "Template" players (EO > 50%)
  const templatePlayers = Object.entries(eliteEoMap)
    .filter(([, eo]) => eo > 50)
    .map(([id, eo]) => ({ id: parseInt(id), eo }));

  // Check which template players the user owns
  const userPlayerIds = new Set(userPicks.map(p => p.player.fplId));
  
  const missingTemplate = templatePlayers.filter(p => !userPlayerIds.has(p.id));

  // Identify "Differentials" (User players with EO < 10%)
  const differentials = userPicks.filter(p => {
    const eo = eliteEoMap[p.player.fplId] || 0;
    return eo < 10;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h3 className="text-lg font-semibold text-white mb-4">Elite Context (Top 100)</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Missing Template (Risk) */}
          <div>
            <h4 className="text-sm font-medium text-yellow-400 mb-3">⚠️ Missing Template (Risk)</h4>
            {missingTemplate.length > 0 ? (
              <ul className="space-y-2">
                {missingTemplate.map(p => (
                  <li key={p.id} className="text-sm flex justify-between bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
                    <span className="text-slate-300">Player ID {p.id}</span>
                    <span className="font-bold text-yellow-400">{p.eo.toFixed(0)}% EO</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">You own all template players.</p>
            )}
          </div>

          {/* Differentials (Gain) */}
          <div>
            <h4 className="text-sm font-medium text-purple-400 mb-3">💎 Your Differentials</h4>
            {differentials.length > 0 ? (
              <ul className="space-y-2">
                {differentials.map(pick => (
                  <li key={pick.id} className="text-sm flex justify-between bg-purple-500/10 border border-purple-500/30 p-3 rounded-lg">
                    <span className="text-slate-300">{pick.player.webName}</span>
                    <span className="font-bold text-purple-400">{(eliteEoMap[pick.player.fplId] || 0).toFixed(0)}% EO</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">No low-ownership differentials found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
