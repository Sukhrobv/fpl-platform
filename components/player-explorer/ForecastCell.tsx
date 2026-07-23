"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  confidenceForForecast,
  type ForecastConfidence,
  type GameweekForecast,
} from "./model";

const confidenceMeta: Record<
  Exclude<ForecastConfidence, "unavailable">,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  high: {
    label: "High confidence",
    icon: CircleCheck,
    className: "text-fresh",
  },
  medium: {
    label: "Medium confidence",
    icon: CircleDot,
    className: "text-uncertainty",
  },
  low: {
    label: "Low confidence",
    icon: CircleAlert,
    className: "text-risk",
  },
};

export function EmptyForecastCell() {
  return (
    <span
      className="flex w-full items-center justify-end gap-1.5 text-muted-foreground"
      title="Forecast unavailable until official fixtures are published"
    >
      <CircleDashed className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">—</span>
      <span className="sr-only">Forecast unavailable</span>
    </span>
  );
}

export function ForecastCell({
  forecast,
  gameweek,
}: {
  forecast?: GameweekForecast;
  gameweek: number;
}) {
  if (!forecast) return <EmptyForecastCell />;

  const confidence = confidenceForForecast(forecast);
  if (confidence === "unavailable") return <EmptyForecastCell />;
  const meta = confidenceMeta[confidence];
  const Icon = meta.icon;

  return (
    <Popover>
      <PopoverTrigger
        className="group flex w-full items-center justify-end gap-1.5 px-1 py-1 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Gameweek ${gameweek}: ${forecast.xPts.toFixed(1)} expected points, ${meta.label.toLowerCase()}`}
      >
        <Icon className={cn("size-3.5", meta.className)} aria-hidden="true" />
        <span className="fpl-data font-bold text-forecast">
          {forecast.xPts.toFixed(1)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <PopoverHeader className="border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <PopoverTitle>GW{gameweek} forecast</PopoverTitle>
            <span
              className={cn("flex items-center gap-1 text-xs", meta.className)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {meta.label}
            </span>
          </div>
          <PopoverDescription>
            {forecast.fixture ||
              `${forecast.opponent} ${forecast.isHome ? "(H)" : "(A)"}`}
          </PopoverDescription>
        </PopoverHeader>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-3 py-3">
          <dt className="text-muted-foreground">Expected points</dt>
          <dd className="fpl-data text-right font-bold text-forecast">
            {forecast.xPts.toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">Appearance</dt>
          <dd className="fpl-data text-right">
            {forecast.breakdown.appearance.toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">Attack</dt>
          <dd className="fpl-data text-right">
            {forecast.breakdown.attack.toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">Defence</dt>
          <dd className="fpl-data text-right">
            {forecast.breakdown.defense.toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">DEFCON</dt>
          <dd className="fpl-data text-right">
            {(forecast.breakdown.defcon ?? 0).toFixed(2)}
          </dd>
          <dt className="text-muted-foreground">Expected minutes</dt>
          <dd className="fpl-data text-right">
            {forecast.raw?.eMin != null ? forecast.raw.eMin.toFixed(0) : "—"}
          </dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}
