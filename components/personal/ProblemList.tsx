import React from "react";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";

interface SquadProblem {
  type: "INJURY" | "BENCH_VALUE" | "FIXTURE_RISK" | "LOW_XPTS";
  severity: "HIGH" | "MEDIUM" | "LOW";
  message: string;
  playerId?: number;
  playerName?: string;
}

interface ProblemListProps {
  problems: SquadProblem[];
}

export function ProblemList({ problems }: ProblemListProps) {
  if (problems.length === 0) return null;

  const getIcon = (severity: string) => {
    switch (severity) {
      case "HIGH":
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case "MEDIUM":
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBgColor = (severity: string) => {
    switch (severity) {
      case "HIGH":
        return "bg-red-500/10 border-red-500/30";
      case "MEDIUM":
        return "bg-yellow-500/10 border-yellow-500/30";
      default:
        return "bg-blue-500/10 border-blue-500/30";
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-white">Detected Issues</h3>
      <div className="grid gap-3">
        {problems.map((problem, index) => (
          <div
            key={index}
            className={`flex items-start gap-3 p-4 rounded-xl border ${getBgColor(problem.severity)}`}
          >
            <div className="mt-0.5">{getIcon(problem.severity)}</div>
            <div>
              <div className="font-medium text-sm text-white">
                {problem.type.replace("_", " ")}
              </div>
              <div className="text-sm text-slate-400">
                {problem.message}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
