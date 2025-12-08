import { PredictionsTable } from "@/components/predictions/PredictionsTable";

export default function PredictionsPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Predictions</h1>
          <p className="text-slate-400">
            Advanced xPts models powered by Understat xG/xA data and proprietary algorithms.
          </p>
        </div>
        
        <PredictionsTable />
      </div>
    </div>
  );
}
