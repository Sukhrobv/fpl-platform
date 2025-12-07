import { PredictionsTable } from "@/components/predictions/PredictionsTable";

export default function PredictionsPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-emerald-900/20 to-transparent pointer-events-none" />
      <div className="absolute top-[-200px] right-[-200px] w-[600px] h-[600px] bg-blue-900/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative max-w-[1600px] mx-auto p-4 sm:p-8">
        <div className="mb-10 flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
            FPL Projections
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Advanced xPts models powered by Understat xG/xA data and proprietary algorithms.
          </p>
        </div>
        
        <PredictionsTable />
      </div>
    </div>
  );
}
