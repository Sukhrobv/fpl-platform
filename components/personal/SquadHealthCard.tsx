import React from "react";
import { Heart, Calendar, TrendingUp } from "lucide-react";

interface SquadHealthCardProps {
  health: {
    score: number;
    verdict: string;
    breakdown: {
      availability: number;
      fixtures: number;
      form: number;
    };
  };
}

export function SquadHealthCard({ health }: SquadHealthCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-blue-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getProgressColor = (score: number) => {
    if (score >= 85) return "bg-emerald-500";
    if (score >= 70) return "bg-blue-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getBorderColor = (score: number) => {
    if (score >= 85) return "border-emerald-500/50";
    if (score >= 70) return "border-blue-500/50";
    if (score >= 50) return "border-yellow-500/50";
    return "border-red-500/50";
  };

  return (
    <div className={`bg-slate-900 rounded-xl border ${getBorderColor(health.score)} p-5`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-white">Squad Health</h3>
          <p className={`text-sm font-medium ${getScoreColor(health.score)}`}>
            {health.verdict}
          </p>
        </div>
        <div className="relative flex items-center justify-center w-16 h-16">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              className="text-slate-700"
            />
            <circle
              cx="32"
              cy="32"
              r="28"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
              strokeDasharray={175}
              strokeDashoffset={175 - (175 * health.score) / 100}
              className={`${getScoreColor(health.score)} transition-all duration-1000 ease-out`}
            />
          </svg>
          <span className={`absolute text-xl font-bold ${getScoreColor(health.score)}`}>
            {health.score}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Heart className="w-4 h-4" />
              <span>Availability</span>
            </div>
            <span className="font-medium text-slate-200">{health.breakdown.availability}/100</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(health.breakdown.availability)} transition-all duration-500`}
              style={{ width: `${health.breakdown.availability}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Calendar className="w-4 h-4" />
              <span>Fixtures</span>
            </div>
            <span className="font-medium text-slate-200">{health.breakdown.fixtures}/100</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(health.breakdown.fixtures)} transition-all duration-500`}
              style={{ width: `${health.breakdown.fixtures}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <TrendingUp className="w-4 h-4" />
              <span>Form & Value</span>
            </div>
            <span className="font-medium text-slate-200">{health.breakdown.form}/100</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(health.breakdown.form)} transition-all duration-500`}
              style={{ width: `${health.breakdown.form}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
