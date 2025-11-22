"use client";

import React, { useState } from 'react';
import { SquadView } from '@/components/personal/SquadView';
import { TransferRecommendationCard } from '@/components/personal/TransferRecommendationCard';
import { TemplateComparison } from '@/components/personal/TemplateComparison';
import { SquadHealthCard } from '@/components/personal/SquadHealthCard';
import { ProblemList } from '@/components/personal/ProblemList';

export default function PersonalAdvisorPage() {
  const [fplId, setFplId] = useState('');
  const [loading, setLoading] = useState(false);
  const [squad, setSquad] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [contextData, setContextData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleSync = async () => {
    if (!fplId) return;
    setLoading(true);
    try {
      // 1. Sync Team
      const syncRes = await fetch(`/api/personal/${fplId}/sync`, { method: 'POST' });
      if (!syncRes.ok) throw new Error('Sync failed');

      // 2. Fetch Squad
      const squadRes = await fetch(`/api/personal/${fplId}/squad`);
      const squadData = await squadRes.json();
      setSquad(squadData);

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
            <h2 className="text-xl font-semibold mb-4">Your Squad</h2>
            {squad ? (
              <SquadView picks={squad.picks} />
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
