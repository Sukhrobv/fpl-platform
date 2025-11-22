import React from "react";
import { Activity, Heart, Calendar, TrendingUp } from "lucide-react";

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
    if (score >= 85) return "text-green-500";
    if (score >= 70) return "text-blue-500";
    if (score >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressColor = (score: number) => {
    if (score >= 85) return "bg-green-500";
    if (score >= 70) return "bg-blue-500";
    if (score >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Squad Health</h3>
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
              className="text-gray-200 dark:text-gray-700"
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
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Heart className="w-4 h-4" />
              <span>Availability</span>
            </div>
            <span className="font-medium">{health.breakdown.availability}/100</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(health.breakdown.availability)} transition-all duration-500`}
              style={{ width: `${health.breakdown.availability}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <Calendar className="w-4 h-4" />
              <span>Fixtures</span>
            </div>
            <span className="font-medium">{health.breakdown.fixtures}/100</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${getProgressColor(health.breakdown.fixtures)} transition-all duration-500`}
              style={{ width: `${health.breakdown.fixtures}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
              <TrendingUp className="w-4 h-4" />
              <span>Form & Value</span>
            </div>
            <span className="font-medium">{health.breakdown.form}/100</span>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
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
