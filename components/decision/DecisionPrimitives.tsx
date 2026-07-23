import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  Database,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  availabilityLabel,
  positionLabel,
  type ExplorerPlayer,
  type ForecastConfidence,
} from "@/components/player-explorer/model";

export function PlayerIdentity({
  player,
  compact = false,
}: {
  player: ExplorerPlayer;
  compact?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className={cn(
          "grid shrink-0 place-items-center border border-foreground bg-foreground font-black text-background",
          compact ? "size-8 text-[10px]" : "size-11 text-xs",
        )}
        aria-hidden="true"
      >
        {positionLabel[player.position]}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-black",
            compact ? "text-xs" : "text-base",
          )}
        >
          {player.webName}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {player.team.name} · {availabilityLabel(player)}
        </p>
      </div>
    </div>
  );
}

const metricTone = {
  fact: "text-foreground",
  forecast: "text-forecast",
  positive: "text-positive-delta",
  risk: "text-risk",
  uncertainty: "text-uncertainty",
} as const;

export function MetricBlock({
  label,
  value,
  note,
  tone = "fact",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: keyof typeof metricTone;
}) {
  return (
    <div className="border border-border bg-background px-3 py-2.5">
      <dt className="text-[10px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={cn("fpl-data mt-1 text-lg font-black", metricTone[tone])}>
        {value}
      </dd>
      {note && <p className="mt-1 text-[10px] text-muted-foreground">{note}</p>}
    </div>
  );
}

const confidenceMeta: Record<
  ForecastConfidence,
  { label: string; icon: typeof CircleCheck; className: string }
> = {
  high: {
    label: "High confidence",
    icon: CircleCheck,
    className: "text-fresh",
  },
  medium: {
    label: "Medium confidence",
    icon: CircleAlert,
    className: "text-uncertainty",
  },
  low: { label: "Low confidence", icon: CircleDashed, className: "text-risk" },
  unavailable: {
    label: "Awaiting evidence",
    icon: CircleDashed,
    className: "text-muted-foreground",
  },
};

export function ConfidenceState({ level }: { level: ForecastConfidence }) {
  const meta = confidenceMeta[level];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold",
        meta.className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

const freshnessMeta = {
  fresh: { label: "Fresh", icon: ShieldCheck, className: "text-fresh" },
  frozen: { label: "Evidence frozen", icon: Database, className: "text-stale" },
  pending: {
    label: "Source pending",
    icon: Clock3,
    className: "text-uncertainty",
  },
} as const;

export function FreshnessState({
  status,
}: {
  status: keyof typeof freshnessMeta;
}) {
  const meta = freshnessMeta[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold",
        meta.className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}
