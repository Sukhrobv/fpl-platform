"use client";

import React, { useState } from 'react';
import { SquadView } from '@/components/personal/SquadView';
import { TransferRecommendationCard } from '@/components/personal/TransferRecommendationCard';
import { TemplateComparison } from '@/components/personal/TemplateComparison';
import { SquadHealthCard } from '@/components/personal/SquadHealthCard';
import { ProblemList } from '@/components/personal/ProblemList';
import { ChipRecommendationCard } from '@/components/personal/ChipRecommendationCard';

export default function PersonalAdvisorPage() {
  const [fplId, setFplId] = useState('');
  const [loading, setLoading] = useState(false);
  const [squad, setSquad] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [contextData, setContextData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [chipRecs, setChipRecs] = useState<any[]>([]);
  const [viewedGw, setViewedGw] = useState<number | null>(null);

  const fetchSquadForGw = async (gw: number) => {
    try {
      const squadRes = await fetch(`/api/personal/${fplId}/squad?gameweek=${gw}`);
      if (squadRes.ok) {
        const squadData = await squadRes.json();
        setSquad(squadData);
        setViewedGw(gw);
      }
    } catch (e) {
      console.error("Failed to fetch squad for GW", gw);
    }
  };

  const handleSync = async () => {
    if (!fplId) return;
    setLoading(true);
    try {
      // 1. Sync Team
      const syncRes = await fetch(`/api/personal/${fplId}/sync`, { method: 'POST' });
      if (!syncRes.ok) throw new Error('Sync failed');

      // 2. Fetch Squad (Latest)
      const squadRes = await fetch(`/api/personal/${fplId}/squad`);
      const squadData = await squadRes.json();
      setSquad(squadData);
      setViewedGw(squadData.gameweek);

      // 3. Fetch Recommendations
      const recRes = await fetch(`/api/personal/${fplId}/recommendations`);
      const recData = await recRes.json();
      setRecommendations(recData);

      // 4. Fetch Context
      const contextRes = await fetch(`/api/personal/context`);
      const cData = await contextRes.json();
      setContextData(cData);

      // 5. Fetch Analysis
      const analysisRes = await fetch(`/api/personal/${fplId}/analysis`);
      const analysisData = await analysisRes.json();
      setAnalysis(analysisData);

      // 6. Fetch Chip Recommendations
      const chipsRes = await fetch(`/api/personal/${fplId}/chips`);
      const chipsData = await chipsRes.json();
      setChipRecs(chipsData);

    } catch (error) {
      console.error(error);
      alert('Failed to load data. Please check FPL ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">Personal Transfer Advisor</h1>

      {/* Input Section */}
      <div className="flex gap-4 mb-8 max-w-md">
        <input
          type="number"
          placeholder="Enter FPL Team ID"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          value={fplId}
          onChange={(e) => setFplId(e.target.value)}
        />
        <button
          onClick={handleSync}
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          {loading ? 'Loading...' : 'Analyze My Team'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Squad */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Your Squad</h2>
                {viewedGw && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => fetchSquadForGw(viewedGw - 1)}
                            className="px-3 py-1 text-xs border rounded hover:bg-muted"
                            disabled={viewedGw <= 1}
                        >
                            ← GW{viewedGw - 1}
                        </button>
                        <span className="text-sm font-medium">GW {viewedGw}</span>
                        <button 
                            onClick={() => fetchSquadForGw(viewedGw + 1)}
                            className="px-3 py-1 text-xs border rounded hover:bg-muted"
                            disabled={viewedGw >= 38}
                        >
                            GW{viewedGw + 1} →
                        </button>
                    </div>
                )}
            </div>
            {squad ? (
              <SquadView picks={squad.picks} gameweek={squad.gameweek} />
            ) : (
              <div className="text-muted-foreground p-8 border rounded-lg text-center">
                Enter your FPL ID to see your squad analysis.
              </div>
            )}
          </div>
          
          {squad && contextData && (
            <div>
               <h2 className="text-xl font-semibold mb-4">Elite Context</h2>
               <TemplateComparison eliteEoMap={contextData.eliteEoMap} userPicks={squad.picks} />
            </div>
          )}
        </div>

        {/* Right Column: Analysis & Recommendations */}
        <div className="space-y-8">
          {analysis && (
            <>
              <SquadHealthCard health={analysis.health} />
              <ProblemList problems={analysis.problems} />
            </>
          )}

          {chipRecs.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">💎 Chip Strategy</h2>
              <div className="space-y-3">
                {chipRecs.map((chip: any, i: number) => (
                  <ChipRecommendationCard key={i} {...chip} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xl font-semibold mb-4">AI Recommendations</h2>
            {recommendations.length > 0 ? (
              <div className="space-y-4">
                {recommendations.map((rec: any, i: number) => (
                  <TransferRecommendationCard key={i} recommendation={rec} />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground p-8 border rounded-lg text-center">
                {squad ? "No obvious transfers found." : "Sync team to get advice."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
