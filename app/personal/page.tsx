"use client";

import React, { useState, useEffect } from 'react';
import { SquadView } from '@/components/personal/SquadView';
import { TransferRecommendationCard } from '@/components/personal/TransferRecommendationCard';
import { TemplateComparison } from '@/components/personal/TemplateComparison';
import { SquadHealthCard } from '@/components/personal/SquadHealthCard';
import { ProblemList } from '@/components/personal/ProblemList';
import { ChipRecommendationCard } from '@/components/personal/ChipRecommendationCard';
import { useFplSettings } from '@/contexts/FplSettingsContext';
import { Settings } from 'lucide-react';
import Link from 'next/link';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

export default function PersonalAdvisorPage() {
  const { fplId: savedFplId, setFplId: saveFplId } = useFplSettings();
  const [fplId, setFplId] = useState('');
  const [loading, setLoading] = useState(false);
  const [squad, setSquad] = useState<AnyData>(null);
  const [recommendations, setRecommendations] = useState<AnyData[]>([]);
  const [contextData, setContextData] = useState<AnyData>(null);
  const [analysis, setAnalysis] = useState<AnyData>(null);
  const [chipRecs, setChipRecs] = useState<AnyData[]>([]);
  const [viewedGw, setViewedGw] = useState<number | null>(null);

  // Load saved FPL ID
  useEffect(() => {
    if (savedFplId) {
      setFplId(savedFplId);
    }
  }, [savedFplId]);

  const fetchSquadForGw = async (gw: number) => {
    try {
      const squadRes = await fetch(`/api/personal/${fplId}/squad?gameweek=${gw}`);
      if (squadRes.ok) {
        const squadData = await squadRes.json();
        setSquad(squadData);
        setViewedGw(gw);
      }
    } catch (e) {
      console.error("Failed to fetch squad for GW", gw, e);
    }
  };

  const handleSync = async () => {
    if (!fplId) return;
    setLoading(true);
    
    // Save FPL ID for future use
    saveFplId(fplId);
    
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
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">My Team</h1>
            <p className="text-slate-400">Personal Transfer Advisor</p>
          </div>
          {savedFplId && (
            <Link 
              href="/settings"
              className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
              ID: {savedFplId}
            </Link>
          )}
        </div>

        {/* Input Section */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 mb-8">
          <div className="flex gap-4 max-w-lg">
            <input
              type="number"
              placeholder="Enter FPL Team ID"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              value={fplId}
              onChange={(e) => setFplId(e.target.value)}
            />
            <button
              onClick={handleSync}
              disabled={loading || !fplId}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Analyze My Team'}
            </button>
          </div>
          {!savedFplId && (
            <p className="text-sm text-slate-500 mt-3">
              💡 Your FPL ID will be saved automatically for next time
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Squad */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Your Squad</h2>
                {viewedGw && (
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => fetchSquadForGw(viewedGw - 1)}
                      className="px-3 py-1 text-xs border border-slate-700 rounded hover:bg-slate-800 text-slate-300"
                      disabled={viewedGw <= 1}
                    >
                      ← GW{viewedGw - 1}
                    </button>
                    <span className="text-sm font-medium text-white">GW {viewedGw}</span>
                    <button 
                      onClick={() => fetchSquadForGw(viewedGw + 1)}
                      className="px-3 py-1 text-xs border border-slate-700 rounded hover:bg-slate-800 text-slate-300"
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
                <div className="text-slate-400 p-8 border border-slate-800 rounded-xl text-center bg-slate-900/50">
                  Enter your FPL ID to see your squad analysis.
                </div>
              )}
            </div>
            
            {squad && contextData && (
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">Elite Context</h2>
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
                <h2 className="text-xl font-semibold text-white mb-4">💎 Chip Strategy</h2>
                <div className="space-y-3">
                  {chipRecs.map((chip: AnyData, i: number) => (
                    <ChipRecommendationCard key={i} {...chip} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-xl font-semibold text-white mb-4">AI Recommendations</h2>
              {recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec: AnyData, i: number) => (
                    <TransferRecommendationCard key={i} recommendation={rec} />
                  ))}
                </div>
              ) : (
                <div className="text-slate-400 p-8 border border-slate-800 rounded-xl text-center bg-slate-900/50">
                  {squad ? "No obvious transfers found." : "Sync team to get advice."}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
