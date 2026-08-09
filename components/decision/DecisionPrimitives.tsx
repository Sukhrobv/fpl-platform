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
  const positionTone = {
    GOALKEEPER: "bg-[#dbe9dd] text-[#355842]",
    DEFENDER: "bg-[#dfe7ed] text-[#43596a]",
    MIDFIELDER: "bg-[#ede0eb] text-[#70476c]",
    FORWARD: "bg-[#f3e0d6] text-[#8b513d]",
  } as const;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full px-2 font-bold tracking-[0.04em]",
          positionTone[player.position],
          compact ? "h-6 min-w-9 text-[9px]" : "h-7 min-w-11 text-[10px]",
        )}
        aria-hidden="true"
      >
        {positionLabel[player.position]}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-black",
            compact ? "text-xs" : "text-base",
          )}
        >
          {player.webName}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          <TeamMark shortName={player.team.shortName} name={player.team.name} />
          <span className="truncate">
            {player.team.name} · {availabilityLabel(player)}
          </span>
        </p>
      </div>
    </div>
  );
}

const crestCodes: Record<string, number> = {
  ARS: 3,
  AVL: 7,
  BHA: 36,
  BOU: 91,
  BRE: 94,
  BUR: 90,
  CHE: 8,
  CRY: 31,
  EVE: 11,
  FUL: 54,
  IPS: 40,
  LEE: 2,
  LEI: 13,
  LIV: 14,
  LUT: 102,
  MCI: 43,
  MUN: 1,
  NEW: 4,
  NFO: 17,
  NOR: 45,
  SHU: 18,
  SOU: 20,
  SUN: 56,
  TOT: 6,
  WAT: 57,
  WHU: 21,
  WOL: 39,
};

export function TeamMark({
  shortName,
  name,
  size = "sm",
}: {
  shortName: string;
  name: string;
  size?: "sm" | "md";
}) {
  const crestCode = crestCodes[shortName.toUpperCase()];
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[7px] font-black tracking-tighter text-muted-foreground",
        size === "sm" ? "size-3.5" : "size-6",
      )}
      title={name}
      aria-label={name}
    >
      <span aria-hidden="true">{shortName.slice(0, 1)}</span>
      {crestCode ? (
        // Official Premier League badge asset; the letter remains as a fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://resources.premierleague.com/premierleague/badges/50/t${crestCode}.png`}
          alt=""
          className="absolute inset-0 size-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
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
