"use client";

import React from 'react';
import { Sparkles, Zap, Users, TrendingUp } from 'lucide-react';

interface ChipRecommendationCardProps {
  chip: "wildcard" | "bench_boost" | "triple_captain" | "free_hit";
  confidence: number;
  reasoning: string;
  expectedValue: number;
  trigger: string;
}

const chipIcons = {
  wildcard: Sparkles,
  bench_boost: Users,
  triple_captain: Zap,
  free_hit: TrendingUp
};

const chipNames = {
  wildcard: "Wildcard",
  bench_boost: "Bench Boost",
  triple_captain: "Triple Captain",
  free_hit: "Free Hit"
};

const chipColors = {
  wildcard: "from-purple-500 to-pink-500",
  bench_boost: "from-blue-500 to-cyan-500",
  triple_captain: "from-yellow-500 to-orange-500",
  free_hit: "from-emerald-500 to-teal-500"
};

const chipBorderColors = {
  wildcard: "border-purple-500/30",
  bench_boost: "border-blue-500/30",
  triple_captain: "border-yellow-500/30",
  free_hit: "border-emerald-500/30"
};

export function ChipRecommendationCard({
  chip,
  confidence,
  reasoning,
  expectedValue,
  trigger
}: ChipRecommendationCardProps) {
  const Icon = chipIcons[chip];
  const confidenceColor = confidence >= 80 ? "text-emerald-400" : confidence >= 60 ? "text-yellow-400" : "text-orange-400";

  return (
    <div className={`border rounded-xl p-4 space-y-3 bg-slate-900 ${chipBorderColors[chip]}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg bg-gradient-to-br ${chipColors[chip]}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg text-white">{chipNames[chip]}</h3>
            <p className="text-sm text-slate-400">{trigger}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${confidenceColor}`}>
            {confidence.toFixed(0)}%
          </div>
          <p className="text-xs text-slate-500">Confidence</p>
        </div>
      </div>

      {/* Expected Value */}
      <div className="flex items-center gap-2 p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/30">
        <TrendingUp className="h-4 w-4 text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-slate-300">Expected Value</p>
          <p className="text-lg font-bold text-emerald-400">+{expectedValue.toFixed(1)} pts</p>
        </div>
      </div>

      {/* Reasoning */}
      <div className="text-sm">
        <p className="font-medium text-slate-300 mb-1">Why now?</p>
        <p className="text-slate-400">{reasoning}</p>
      </div>
    </div>
  );
}
