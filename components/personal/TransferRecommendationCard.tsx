import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PredictionComparisonChart } from './PredictionComparisonChart';

interface TransferRecommendation {
  playerOut: {
    webName: string;
    team: { shortName: string };
    form: number;
    xPts?: number;
    history?: Record<number, unknown>;
  };
  playerIn: {
    webName: string;
    team: { shortName: string };
    form: number;
    nowCost: number;
    xPts?: number;
    history?: Record<number, unknown>;
  };
  xPtsDelta: number;
  reason: string;
  ownershipContext?: {
    eliteEo: number;
    isDifferential: boolean;
    isTemplate: boolean;
  };
}

interface TransferRecommendationCardProps {
  recommendation: TransferRecommendation;
}

export function TransferRecommendationCard({ recommendation }: TransferRecommendationCardProps) {
  const { ownershipContext } = recommendation;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-sm text-slate-400">Suggested Transfer</h4>
        <div className="flex gap-2">
          {ownershipContext?.isDifferential && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
              💎 Differential
            </span>
          )}
          {ownershipContext?.isTemplate && (
            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
              🛡️ Template
            </span>
          )}
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            +{recommendation.xPtsDelta.toFixed(1)} xPts (5 GWs)
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4">
        {/* Player Out */}
        <div className="flex-1 p-3 bg-red-500/10 rounded-lg border border-red-500/30">
          <div className="text-xs text-red-400 font-semibold mb-1">OUT</div>
          <div className="font-bold text-sm text-white">{recommendation.playerOut.webName}</div>
          <div className="text-xs text-slate-400">
            {recommendation.playerOut.team.shortName} • xPts: {recommendation.playerOut.xPts?.toFixed(1)}
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-slate-500" />

        {/* Player In */}
        <div className="flex-1 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
          <div className="text-xs text-emerald-400 font-semibold mb-1">IN</div>
          <div className="font-bold text-sm text-white">{recommendation.playerIn.webName}</div>
          <div className="text-xs text-slate-400">
            {recommendation.playerIn.team.shortName} • xPts: {recommendation.playerIn.xPts?.toFixed(1)}
          </div>
          {ownershipContext && (
            <div className="mt-1 text-xs font-medium text-blue-400">
              Elite EO: {ownershipContext.eliteEo.toFixed(0)}%
            </div>
          )}
        </div>
      </div>

      <PredictionComparisonChart 
        playerOutName={recommendation.playerOut.webName}
        playerInName={recommendation.playerIn.webName}
        playerOutHistory={recommendation.playerOut.history}
        playerInHistory={recommendation.playerIn.history}
      />

      <div className="mt-4 text-xs text-slate-400 bg-slate-800/50 p-3 rounded-lg border border-slate-700">
        💡 {recommendation.reason}
      </div>
    </div>
  );
}
