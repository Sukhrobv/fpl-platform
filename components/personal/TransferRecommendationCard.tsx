import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PredictionComparisonChart } from './PredictionComparisonChart';

interface TransferRecommendation {
  playerOut: {
    webName: string;
    team: { shortName: string };
    form: number;
    xPts?: number;
    history?: Record<number, any>;
  };
  playerIn: {
    webName: string;
    team: { shortName: string };
    form: number;
    nowCost: number;
    xPts?: number;
    history?: Record<number, any>;
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
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-semibold text-sm text-muted-foreground">Suggested Transfer</h4>
        <div className="flex gap-2">
          {ownershipContext?.isDifferential && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-purple-500 text-white shadow">
              💎 Differential
            </span>
          )}
          {ownershipContext?.isTemplate && (
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-blue-500 text-white shadow">
              🛡️ Template
            </span>
          )}
          <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-transparent bg-green-500 text-white shadow">
            +{recommendation.xPtsDelta.toFixed(1)} xPts (5 GWs)
          </span>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4">
        {/* Player Out */}
        <div className="flex-1 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-100 dark:border-red-900/50">
          <div className="text-xs text-red-600 dark:text-red-400 font-semibold mb-1">OUT</div>
          <div className="font-bold text-sm">{recommendation.playerOut.webName}</div>
          <div className="text-xs text-muted-foreground">
            {recommendation.playerOut.team.shortName} • xPts: {recommendation.playerOut.xPts?.toFixed(1)}
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-muted-foreground" />

        {/* Player In */}
        <div className="flex-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-100 dark:border-green-900/50">
          <div className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">IN</div>
          <div className="font-bold text-sm">{recommendation.playerIn.webName}</div>
          <div className="text-xs text-muted-foreground">
            {recommendation.playerIn.team.shortName} • xPts: {recommendation.playerIn.xPts?.toFixed(1)}
          </div>
          {ownershipContext && (
            <div className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
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

      <div className="mt-4 text-xs text-muted-foreground bg-muted p-2 rounded">
        💡 {recommendation.reason}
      </div>
    </div>
  );
}
