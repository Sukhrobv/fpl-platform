"use client";

import { memo, useState } from "react";
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

export const ForecastCell = memo(function ForecastCell({
  forecast,
  gameweek,
  tone = "text-forecast",
}: {
  forecast?: GameweekForecast;
  gameweek: number;
  tone?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!forecast) return <EmptyForecastCell />;

  const confidence = confidenceForForecast(forecast);
  if (confidence === "unavailable") return <EmptyForecastCell />;
  const meta = confidenceMeta[confidence];
  const Icon = meta.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="group flex w-full items-center justify-end gap-1.5 px-1 py-1 text-right outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`Gameweek ${gameweek}: ${forecast.xPts.toFixed(1)} expected points, ${meta.label.toLowerCase()}`}
      >
        <Icon className={cn("size-3.5", meta.className)} aria-hidden="true" />
        <span className={cn("fpl-data font-black", tone)}>
          {forecast.xPts.toFixed(1)}
        </span>
      </PopoverTrigger>
      {open ? (
        <PopoverContent align="end" className="w-72 p-0">
          <PopoverHeader className="border-b border-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <PopoverTitle>GW{gameweek} forecast</PopoverTitle>
              <span
                className={cn(
                  "flex items-center gap-1 text-xs",
                  meta.className,
                )}
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
            <dd className={cn("fpl-data text-right font-bold", tone)}>
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
            <dt className="text-muted-foreground">Clean sheet</dt>
            <dd className="fpl-data text-right">
              {(forecast.breakdown.cleanSheet ?? 0).toFixed(2)}
            </dd>
            <dt className="text-muted-foreground">Goals conceded</dt>
            <dd className="fpl-data text-right">
              −{(forecast.breakdown.goalsConcededPenalty ?? 0).toFixed(2)}
            </dd>
            <dt className="text-muted-foreground">DEFCON</dt>
            <dd className="fpl-data text-right">
              {(forecast.breakdown.defcon ?? 0).toFixed(2)}
            </dd>
            <dt className="text-muted-foreground">Saves</dt>
            <dd className="fpl-data text-right">
              {(forecast.breakdown.saves ?? 0).toFixed(2)}
            </dd>
            <dt className="text-muted-foreground">Bonus</dt>
            <dd className="fpl-data text-right">
              {forecast.breakdown.bonus.toFixed(2)}
            </dd>
            <dt className="text-muted-foreground">Expected minutes</dt>
            <dd className="fpl-data text-right">
              {forecast.raw?.eMin != null ? forecast.raw.eMin.toFixed(0) : "—"}
            </dd>
            {forecast.context?.preseasonMinutesEvidence ? (
              <>
                <dt className="text-muted-foreground">Pre-season tracker</dt>
                <dd className="fpl-data text-right">
                  {forecast.context.preseasonMinutesEvidence.expectedMinutesCap}{" "}
                  min cap ·{" "}
                  {forecast.context.preseasonMinutesEvidence.totalMinutes}/
                  {forecast.context.preseasonMinutesEvidence.possibleMinutes}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Start chance</dt>
            <dd className="fpl-data text-right">
              {forecast.raw?.pStart != null
                ? `${(forecast.raw.pStart * 100).toFixed(0)}%`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">P(≥60 min)</dt>
            <dd className="fpl-data text-right">
              {forecast.raw?.p60 != null
                ? `${(forecast.raw.p60 * 100).toFixed(0)}%`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Player xG / xA per 90</dt>
            <dd className="fpl-data text-right">
              {forecast.context?.player?.xG90_recent != null ||
              forecast.context?.player?.xA90_recent != null
                ? `${forecast.context.player?.xG90_recent?.toFixed(2) ?? "—"} / ${forecast.context.player?.xA90_recent?.toFixed(2) ?? "—"}`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Team / venue / opponent</dt>
            <dd className="fpl-data text-right">
              {forecast.context?.player?.attackRate
                ? `×${forecast.context.player.attackRate.fixtureMultiplier.toFixed(2)}`
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Opponent defence prior</dt>
            <dd className="fpl-data text-right">
              {forecast.context?.opponent?.strengthSource === "HISTORICAL"
                ? `${forecast.context.opponent.historicalSourceSeason ?? "prior"} ×${forecast.context.opponent.historicalDefenseMultiplier?.toFixed(2) ?? "1.00"}`
                : "Neutral"}
            </dd>
            <dt className="text-muted-foreground">
              H2H v {forecast.opponent}
              {forecast.context?.player?.h2h?.sourceSeason
                ? ` (${forecast.context.player.h2h.sourceSeason})`
                : ""}
            </dt>
            <dd className="fpl-data text-right">
              {forecast.context?.player?.h2h
                ? `${forecast.context.player.h2h.matches} matches / ${forecast.context.player.h2h.minutes} min`
                : "No qualifying history"}
            </dd>
            {forecast.context?.player?.h2h ? (
              <>
                <dt className="text-muted-foreground">H2H xG / xA</dt>
                <dd className="fpl-data text-right">
                  {forecast.context.player.h2h.xG.toFixed(2)} /{" "}
                  {forecast.context.player.h2h.xA.toFixed(2)}
                </dd>
                <dt className="text-muted-foreground">H2H goals / assists</dt>
                <dd className="fpl-data text-right">
                  {forecast.context.player.h2h.goals} /{" "}
                  {forecast.context.player.h2h.assists}
                </dd>
                <dt className="text-muted-foreground">H2H model weight</dt>
                <dd className="fpl-data text-right">
                  {(forecast.context.player.h2h.weight * 100).toFixed(0)}%
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Final xG / xA per 90</dt>
            <dd className="fpl-data text-right">
              {forecast.context?.player?.attackRate
                ? `${forecast.context.player.attackRate.fixtureXG90?.toFixed(2) ?? "—"} / ${forecast.context.player.attackRate.fixtureXA90?.toFixed(2) ?? "—"}`
                : "—"}
            </dd>
          </dl>
          <div className="border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
            <p className="font-bold text-foreground">Why this is provisional</p>
            <p className="mt-1 leading-5">
              Rates begin with bounded historical evidence and progressively use
              official current-season results after each settled gameweek. Bonus
              and save values are conservative rate-based expectations.
            </p>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
});
