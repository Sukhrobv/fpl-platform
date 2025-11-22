import React from 'react';

interface TemplateComparisonProps {
  eliteEoMap: { [playerId: number]: number };
  userPicks: any[];
}

export function TemplateComparison({ eliteEoMap, userPicks }: TemplateComparisonProps) {
  // Identify "Template" players (EO > 50%)
  const templatePlayers = Object.entries(eliteEoMap)
    .filter(([_, eo]) => eo > 50)
    .map(([id, eo]) => ({ id: parseInt(id), eo }));

  // Check which template players the user owns
  const userPlayerIds = new Set(userPicks.map(p => p.player.fplId));
  
  const missingTemplate = templatePlayers.filter(p => !userPlayerIds.has(p.id));
  const ownedTemplate = templatePlayers.filter(p => userPlayerIds.has(p.id));

  // Identify "Differentials" (User players with EO < 10%)
  const differentials = userPicks.filter(p => {
    const eo = eliteEoMap[p.player.fplId] || 0;
    return eo < 10;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Elite Context (Top 100)</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Missing Template (Risk) */}
          <div>
            <h4 className="text-sm font-medium text-red-500 mb-2">⚠️ Missing Template (Risk)</h4>
            {missingTemplate.length > 0 ? (
              <ul className="space-y-2">
                {missingTemplate.map(p => (
                  <li key={p.id} className="text-sm flex justify-between bg-red-50 dark:bg-red-900/10 p-2 rounded">
                    <span>Player ID {p.id}</span>
                    <span className="font-bold">{p.eo.toFixed(0)}% EO</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">You own all template players.</p>
            )}
          </div>

          {/* Differentials (Gain) */}
          <div>
            <h4 className="text-sm font-medium text-purple-500 mb-2">💎 Your Differentials</h4>
            {differentials.length > 0 ? (
              <ul className="space-y-2">
                {differentials.map(pick => (
                  <li key={pick.id} className="text-sm flex justify-between bg-purple-50 dark:bg-purple-900/10 p-2 rounded">
                    <span>{pick.player.webName}</span>
                    <span className="font-bold">{(eliteEoMap[pick.player.fplId] || 0).toFixed(0)}% EO</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No low-ownership differentials found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
