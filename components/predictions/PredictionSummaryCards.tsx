import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, DollarSign, Shield, Zap } from "lucide-react";

interface Prediction {
  playerId: number;
  playerName: string;
  position: string;
  price: number;
  teamShort: string;
  totalXPts: number;
  history: Record<number, any>;
}

interface SummaryCardsProps {
  predictions: Prediction[];
}

export function PredictionSummaryCards({ predictions }: SummaryCardsProps) {
  if (!predictions.length) return null;

  // 1. Top Captain (Highest xPts)
  const topCaptain = [...predictions].sort((a, b) => b.totalXPts - a.totalXPts)[0];

  // 2. Best Value (xPts / Price)
  const bestValue = [...predictions]
    .filter(p => p.totalXPts > 2) // Filter out low scorers
    .sort((a, b) => (b.totalXPts / b.price) - (a.totalXPts / a.price))[0];

  // 3. Top Defender
  const topDefender = predictions
    .filter(p => p.position === "DEFENDER")
    .sort((a, b) => b.totalXPts - a.totalXPts)[0];

  // 4. Top Differential (< 10% ownership - mock for now as we don't have ownership in this view yet, using price as proxy for "hidden gem")
  // actually let's just show Top Midfielder for now
  const topMid = predictions
    .filter(p => p.position === "MIDFIELDER")
    .sort((a, b) => b.totalXPts - a.totalXPts)[0];

  const cards = [
    {
      title: "Top Captain Pick",
      icon: TrendingUp,
      player: topCaptain,
      metric: `${topCaptain?.totalXPts.toFixed(1)} xPts`,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10 border-emerald-500/20"
    },
    {
      title: "Best Value",
      icon: DollarSign,
      player: bestValue,
      metric: `${(bestValue?.totalXPts / (bestValue?.price / 10)).toFixed(2)} pts/£m`,
      color: "text-blue-500",
      bg: "bg-blue-500/10 border-blue-500/20"
    },
    {
      title: "Top Defender",
      icon: Shield,
      player: topDefender,
      metric: `${topDefender?.totalXPts.toFixed(1)} xPts`,
      color: "text-purple-500",
      bg: "bg-purple-500/10 border-purple-500/20"
    },
    {
      title: "Top Midfielder",
      icon: Zap,
      player: topMid,
      metric: `${topMid?.totalXPts.toFixed(1)} xPts`,
      color: "text-amber-500",
      bg: "bg-amber-500/10 border-amber-500/20"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => (
        <Card key={idx} className={`border backdrop-blur-sm ${card.bg}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            {card.player ? (
              <div className="flex flex-col">
                <div className="text-2xl font-bold truncate">{card.player.playerName}</div>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-muted-foreground">
                    {card.player.teamShort} • £{(card.player.price / 10).toFixed(1)}
                  </p>
                  <span className={`text-sm font-bold ${card.color}`}>
                    {card.metric}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
