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
  free_hit: "from-green-500 to-emerald-500"
};

export function ChipRecommendationCard({
  chip,
  confidence,
  reasoning,
  expectedValue,
  trigger
}: ChipRecommendationCardProps) {
  const Icon = chipIcons[chip];
  const confidenceColor = confidence >= 80 ? "text-green-600" : confidence >= 60 ? "text-yellow-600" : "text-orange-600";

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-gradient-to-br from-background to-muted/20">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-gradient-to-br ${chipColors[chip]}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">{chipNames[chip]}</h3>
            <p className="text-sm text-muted-foreground">{trigger}</p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${confidenceColor}`}>
            {confidence.toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground">Confidence</p>
        </div>
      </div>

      {/* Expected Value */}
      <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-md border">
        <TrendingUp className="h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium">Expected Value</p>
          <p className="text-lg font-bold text-primary">+{expectedValue.toFixed(1)} pts</p>
        </div>
      </div>

      {/* Reasoning */}
      <div className="text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Why now?</p>
        <p>{reasoning}</p>
      </div>
    </div>
  );
}
