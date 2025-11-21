import { PredictionsTable } from "@/components/predictions/PredictionsTable";

export default function PredictionsPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-3xl font-bold mb-6">FPL Predictions</h1>
      <PredictionsTable />
    </div>
  );
}
