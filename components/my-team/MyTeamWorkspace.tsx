"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Crown,
  HeartPulse,
  LoaderCircle,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { useFplSettings } from "@/contexts/FplSettingsContext";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import {
  captaincy,
  eliteSquadSummary,
  groupStartersByPosition,
  playerPoints,
  splitSquad,
  type ChipRecommendation,
  type EliteContext,
  type SquadAnalysis,
  type SquadData,
  type SquadHealth,
  type SquadPick,
  type SquadProblem,
  type TransferRecommendation,
} from "./model";

interface WorkspaceData {
  squad: SquadData;
  analysis: SquadAnalysis | null;
  recommendations: TransferRecommendation[];
  context: EliteContext | null;
  chips: ChipRecommendation[];
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed");
  }
  return body;
}

async function optionalJson<T>(promise: Promise<Response>, fallback: T) {
  try {
    return await responseJson<T>(await promise);
  } catch {
    return fallback;
  }
}

async function fetchWorkspace(fplId: string): Promise<WorkspaceData> {
  const [squad, analysis, recommendations, context, chips] = await Promise.all([
    fetch(`/api/personal/${fplId}/squad`).then(responseJson<SquadData>),
    optionalJson(
      fetch(`/api/personal/${fplId}/analysis`),
      null as SquadAnalysis | null,
    ),
    optionalJson(
      fetch(`/api/personal/${fplId}/recommendations`),
      [] as TransferRecommendation[],
    ),
    optionalJson(fetch("/api/personal/context"), null as EliteContext | null),
    optionalJson(
      fetch(`/api/personal/${fplId}/chips`),
      [] as ChipRecommendation[],
    ),
  ]);
  return { squad, analysis, recommendations, context, chips };
}

function formatRank(rank: number | null) {
  return rank == null ? "—" : new Intl.NumberFormat("en-GB").format(rank);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-3 py-2.5 last:border-r-0">
      <dt className="text-[10px] font-bold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="fpl-data mt-1 text-lg font-black">{value}</dd>
    </div>
  );
}

function Armband({ type }: { type: "captain" | "vice" }) {
  return (
    <span
      className={cn(
        "inline-grid size-5 place-items-center border text-[10px] font-black",
        type === "captain"
          ? "border-uncertainty bg-uncertainty text-accent-foreground"
          : "border-border bg-background text-muted-foreground",
      )}
      aria-label={type === "captain" ? "Captain" : "Vice-captain"}
    >
      {type === "captain" ? "C" : "V"}
    </span>
  );
}

function PlayerTile({
  pick,
  bench = false,
}: {
  pick: SquadPick;
  bench?: boolean;
}) {
  const flagged = pick.player.status !== "a";
  return (
    <div
      className={cn(
        "relative min-w-0 border bg-card px-2 py-2 text-center shadow-sm",
        bench ? "border-border/70 bg-background" : "border-foreground/20",
        flagged && "border-risk/60",
      )}
      title={pick.player.news || pick.player.team.name}
    >
      <div className="absolute -top-2 left-1/2 flex -translate-x-1/2 gap-1">
        {pick.isCaptain && <Armband type="captain" />}
        {pick.isViceCaptain && <Armband type="vice" />}
        {flagged && (
          <span className="inline-grid size-5 place-items-center border border-risk bg-card text-risk">
            <CircleAlert className="size-3" aria-label="Availability flag" />
          </span>
        )}
      </div>
      <div className="truncate pt-1 text-xs font-black">
        {pick.player.webName}
      </div>
      <div className="mt-0.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
        <span>{pick.player.team.shortName}</span>
        <span aria-hidden="true">·</span>
        <span className="fpl-data">{playerPoints(pick)} pts</span>
      </div>
    </div>
  );
}

function DesktopPitch({ picks }: { picks: SquadPick[] }) {
  const groups = groupStartersByPosition(picks);
  const bench = splitSquad(picks).bench;

  return (
    <div className="hidden lg:block">
      <div className="relative overflow-hidden border border-foreground/20 bg-secondary/65 px-5 py-7">
        <div className="pointer-events-none absolute inset-4 border border-foreground/15" />
        <div className="pointer-events-none absolute top-1/2 right-4 left-4 border-t border-foreground/15" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 border border-foreground/15" />
        <div className="pointer-events-none absolute top-4 left-1/2 h-14 w-36 -translate-x-1/2 border-x border-b border-foreground/15" />
        <div className="pointer-events-none absolute bottom-4 left-1/2 h-14 w-36 -translate-x-1/2 border-x border-t border-foreground/15" />
        <div className="relative flex min-h-[34rem] flex-col-reverse justify-between gap-6">
          {groups.map((group) => (
            <div
              key={group.position}
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(group.picks.length, 1)}, minmax(0, 8rem))`,
                justifyContent: "space-around",
              }}
            >
              {group.picks.map((pick) => (
                <PlayerTile key={pick.id} pick={pick} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="border-x border-b border-border bg-muted/40 p-3">
        <p className="mb-3 text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
          Bench
        </p>
        <div className="grid grid-cols-4 gap-3">
          {bench.map((pick) => (
            <PlayerTile key={pick.id} pick={pick} bench />
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileSquadList({ picks }: { picks: SquadPick[] }) {
  const { starters, bench } = splitSquad(picks);
  const sections = [
    { label: "Starting XI", picks: starters },
    { label: "Bench", picks: bench },
  ];

  return (
    <div className="border border-border bg-card lg:hidden">
      {sections.map((section) => (
        <div key={section.label}>
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
            {section.label}
          </div>
          <ul>
            {section.picks.map((pick) => (
              <li
                key={pick.id}
                className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="w-8 text-[10px] font-bold text-muted-foreground">
                    {pick.player.position.slice(0, 3)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black">
                      {pick.player.webName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {pick.player.team.shortName}
                    </p>
                  </div>
                  {pick.isCaptain && <Armband type="captain" />}
                  {pick.isViceCaptain && <Armband type="vice" />}
                </div>
                <span className="fpl-data text-xs font-bold">
                  {playerPoints(pick)} pts
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function HealthPanel({ health }: { health: SquadHealth }) {
  const tone =
    health.score >= 85
      ? "text-fresh"
      : health.score >= 60
        ? "text-uncertainty"
        : "text-risk";
  const metrics = [
    { label: "Availability", value: health.breakdown.availability },
    { label: "Fixtures", value: health.breakdown.fixtures },
    { label: "Form & value", value: health.breakdown.form },
  ];

  return (
    <section
      className="border border-border bg-card p-4"
      aria-labelledby="health-title"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
            <HeartPulse className="size-3.5" aria-hidden="true" />
            Squad health
          </p>
          <h2 id="health-title" className="text-lg font-black">
            {health.verdict}
          </h2>
        </div>
        <div className={cn("fpl-data text-3xl font-black", tone)}>
          {health.score}
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <div className="space-y-4">
        {metrics.map((metric) => (
          <Progress key={metric.label} value={metric.value}>
            <ProgressLabel>{metric.label}</ProgressLabel>
            <ProgressValue>{() => `${metric.value}/100`}</ProgressValue>
          </Progress>
        ))}
      </div>
    </section>
  );
}

const problemMeta: Record<
  SquadProblem["severity"],
  { label: string; icon: typeof AlertTriangle; className: string }
> = {
  HIGH: { label: "High", icon: AlertTriangle, className: "text-risk" },
  MEDIUM: {
    label: "Medium",
    icon: CircleAlert,
    className: "text-uncertainty",
  },
  LOW: { label: "Low", icon: ShieldCheck, className: "text-muted-foreground" },
};

function ProblemsPanel({ problems }: { problems: SquadProblem[] }) {
  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="issues-title"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 id="issues-title" className="text-sm font-black">
          Problems to resolve
        </h2>
        <Badge variant={problems.length ? "destructive" : "outline"}>
          {problems.length}
        </Badge>
      </div>
      {problems.length ? (
        <ul>
          {problems.slice(0, 4).map((problem, index) => {
            const meta = problemMeta[problem.severity];
            const Icon = meta.icon;
            return (
              <li
                key={`${problem.type}-${problem.playerId ?? index}`}
                className="flex gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", meta.className)}
                  aria-hidden="true"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black">
                      {problem.type.replaceAll("_", " ")}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {problem.message}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-3 px-4 py-5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-4 text-fresh" aria-hidden="true" />
          No urgent squad problems detected.
        </div>
      )}
    </section>
  );
}

function DecisionsPanel({
  picks,
  recommendations,
  chips,
  context,
}: {
  picks: SquadPick[];
  recommendations: TransferRecommendation[];
  chips: ChipRecommendation[];
  context: EliteContext | null;
}) {
  const { captain, viceCaptain } = captaincy(picks);
  const elite = context
    ? eliteSquadSummary(picks, context.eliteEoMap)
    : { missingTemplate: 0, differentials: 0 };
  const topTransfer = recommendations[0];
  const topChip = chips[0];

  return (
    <section
      className="border border-border bg-card"
      aria-labelledby="decisions-title"
    >
      <div className="border-b border-border px-4 py-3">
        <p className="text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
          Decision queue
        </p>
        <h2 id="decisions-title" className="mt-1 text-lg font-black">
          Next actions
        </h2>
      </div>
      <div className="divide-y divide-border">
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-black">
            <Crown className="size-4 text-uncertainty" aria-hidden="true" />
            Captaincy
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-border bg-background p-2.5">
              <p className="text-[10px] text-muted-foreground">Captain</p>
              <p className="mt-1 truncate text-xs font-black">
                {captain?.player.webName ?? "Not set"}
              </p>
            </div>
            <div className="border border-border bg-background p-2.5">
              <p className="text-[10px] text-muted-foreground">Vice</p>
              <p className="mt-1 truncate text-xs font-black">
                {viceCaptain?.player.webName ?? "Not set"}
              </p>
            </div>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs font-black">
              <ArrowUpRight
                className="size-4 text-positive-delta"
                aria-hidden="true"
              />
              Transfer signal
            </p>
            <span className="text-[10px] text-muted-foreground">
              {recommendations.length} ideas
            </span>
          </div>
          {topTransfer ? (
            <div>
              <div className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate font-bold text-negative-delta">
                  {topTransfer.playerOut.webName}
                </span>
                <ArrowRight
                  className="size-3.5 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate text-right font-bold text-positive-delta">
                  {topTransfer.playerIn.webName}
                </span>
              </div>
              <p className="fpl-data mt-2 text-right text-xs font-black text-forecast">
                +{topTransfer.xPtsDelta.toFixed(1)} xPts / 5 GW
              </p>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              No verified upgrade is available with the current fixture data.
            </p>
          )}
          <Button
            className="mt-3 w-full"
            variant="outline"
            render={
              <Link
                href={
                  topTransfer
                    ? `/predictions?out=${topTransfer.playerOut.id}&in=${topTransfer.playerIn.id}`
                    : "/predictions"
                }
              />
            }
          >
            <UserRoundSearch data-icon="inline-start" aria-hidden="true" />
            {topTransfer ? "Evaluate this transfer" : "Review player pool"}
          </Button>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-3">
            <p className="text-[10px] text-muted-foreground">Differentials</p>
            <p className="fpl-data mt-1 text-lg font-black text-forecast">
              {elite.differentials}
            </p>
          </div>
          <div className="p-3">
            <p className="text-[10px] text-muted-foreground">Template gaps</p>
            <p className="fpl-data mt-1 text-lg font-black text-risk">
              {elite.missingTemplate}
            </p>
          </div>
        </div>

        {topChip && (
          <div className="flex gap-3 p-4">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-uncertainty"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-black">
                {topChip.chip.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {topChip.trigger} · {topChip.confidence.toFixed(0)}% confidence
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyTeam({
  fplId,
  setFplId,
  onSubmit,
  loading,
}: {
  fplId: string;
  setFplId: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
}) {
  return (
    <div className="grid min-h-[30rem] place-items-center border border-border bg-card px-5 py-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 grid size-12 place-items-center border border-foreground bg-foreground text-background">
          <UsersRound className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-3xl font-black tracking-[-0.035em]">
          Connect your team
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Load a saved squad now. A fresh sync will use the official FPL API
          only when the season endpoint is ready.
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex gap-2">
          <label className="flex-1 text-left">
            <span className="sr-only">FPL team ID</span>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              value={fplId}
              onChange={(event) => setFplId(event.target.value)}
              placeholder="FPL team ID"
            />
          </label>
          <Button type="submit" disabled={!fplId || loading}>
            {loading ? (
              <LoaderCircle className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw />
            )}
            Load team
          </Button>
        </form>
        <Link
          href="/settings"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Settings className="size-3.5" aria-hidden="true" />
          Manage saved FPL ID
        </Link>
      </div>
    </div>
  );
}

export function MyTeamWorkspace() {
  const { fplId: savedFplId, setFplId: saveFplId, autoSync } = useFplSettings();
  const [fplId, setFplId] = useState(savedFplId);
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const autoLoadedId = useRef<string | null>(null);

  const hydrate = useCallback(async (id: string, syncFirst = false) => {
    setLoading(true);
    setError(null);
    setSyncNote(null);
    try {
      if (syncFirst) {
        try {
          await responseJson(
            await fetch(`/api/personal/${id}/sync`, { method: "POST" }),
          );
        } catch (syncError) {
          setSyncNote(
            syncError instanceof Error
              ? `${syncError.message}. Showing the latest stored squad instead.`
              : "Fresh sync unavailable. Showing the latest stored squad instead.",
          );
        }
      }
      setData(await fetchWorkspace(id));
    } catch (loadError) {
      setData(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your team",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!savedFplId || autoLoadedId.current === savedFplId) return;
    autoLoadedId.current = savedFplId;
    setFplId(savedFplId);
    void hydrate(savedFplId, autoSync);
  }, [autoSync, hydrate, savedFplId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fplId) return;
    autoLoadedId.current = fplId;
    saveFplId(fplId);
    void hydrate(fplId, true);
  };

  const loadGameweek = async (gameweek: number) => {
    if (!data || !fplId) return;
    setLoading(true);
    setError(null);
    try {
      const squad = await responseJson<SquadData>(
        await fetch(`/api/personal/${fplId}/squad?gameweek=${gameweek}`),
      );
      setData((current) => (current ? { ...current, squad } : current));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Gameweek unavailable",
      );
    } finally {
      setLoading(false);
    }
  };

  const squadMeta = useMemo(() => {
    if (!data) return null;
    const { starters, bench } = splitSquad(data.squad.picks);
    return { starters: starters.length, bench: bench.length };
  }, [data]);

  if (!data) {
    return (
      <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <div
            className="mb-4 flex items-start gap-3 border border-risk/40 bg-risk/5 px-4 py-3 text-sm"
            role="alert"
          >
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-risk"
              aria-hidden="true"
            />
            <div>
              <p className="font-bold">Team could not be loaded</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            </div>
          </div>
        )}
        <EmptyTeam
          fplId={fplId}
          setFplId={setFplId}
          onSubmit={handleSubmit}
          loading={loading}
        />
      </div>
    );
  }

  const { squad, analysis, recommendations, context, chips } = data;

  return (
    <div className="mx-auto w-full max-w-[100rem] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">My Team</Badge>
            <span className="text-xs font-semibold text-stale">
              Stored GW{squad.gameweek} snapshot
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-[-0.035em] sm:text-4xl">
            Squad decision board
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            See the shape of the team first, then resolve availability,
            captaincy and transfer decisions in priority order.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <label className="w-36">
            <span className="sr-only">FPL team ID</span>
            <Input
              type="number"
              inputMode="numeric"
              value={fplId}
              onChange={(event) => setFplId(event.target.value)}
            />
          </label>
          <Button type="submit" variant="outline" disabled={loading || !fplId}>
            <RefreshCw
              className={cn(
                loading && "animate-spin motion-reduce:animate-none",
              )}
              data-icon="inline-start"
              aria-hidden="true"
            />
            Sync
          </Button>
          <Button
            variant="ghost"
            size="icon"
            render={<Link href="/settings" />}
            aria-label="My Team settings"
          >
            <Settings aria-hidden="true" />
          </Button>
        </form>
      </div>

      {(syncNote || error) && (
        <div
          className={cn(
            "mb-4 flex items-start gap-3 border px-4 py-3 text-xs",
            error
              ? "border-risk/40 bg-risk/5"
              : "border-uncertainty/40 bg-uncertainty/5",
          )}
          role={error ? "alert" : "status"}
        >
          <CircleAlert
            className={cn(
              "mt-0.5 size-4 shrink-0",
              error ? "text-risk" : "text-uncertainty",
            )}
            aria-hidden="true"
          />
          {error ?? syncNote}
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 border border-border bg-card sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="GW points" value={String(squad.gameweekPoints ?? "—")} />
        <Metric label="Total" value={String(squad.totalPoints ?? "—")} />
        <Metric label="Rank" value={formatRank(squad.overallRank)} />
        <Metric
          label="Value"
          value={`£${(squad.teamValue / 10).toFixed(1)}m`}
        />
        <Metric label="Bank" value={`£${(squad.bank / 10).toFixed(1)}m`} />
        <Metric label="Free transfers" value={String(squad.freeTransfers)} />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(19rem,0.8fr)]">
        <section aria-labelledby="squad-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black tracking-[0.12em] text-muted-foreground uppercase">
                Formation
              </p>
              <h2 id="squad-title" className="mt-1 text-lg font-black">
                {squadMeta?.starters ?? 0} starters · {squadMeta?.bench ?? 0}{" "}
                bench
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={loading || squad.gameweek <= 1}
                onClick={() => void loadGameweek(squad.gameweek - 1)}
                aria-label={`Load gameweek ${squad.gameweek - 1}`}
              >
                <ChevronLeft aria-hidden="true" />
                GW{squad.gameweek - 1}
              </Button>
              <span className="fpl-data min-w-12 text-center text-xs font-black">
                GW{squad.gameweek}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={loading || squad.gameweek >= 38}
                onClick={() => void loadGameweek(squad.gameweek + 1)}
                aria-label={`Load gameweek ${squad.gameweek + 1}`}
              >
                GW{squad.gameweek + 1}
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          </div>
          <DesktopPitch picks={squad.picks} />
          <MobileSquadList picks={squad.picks} />
        </section>

        <aside className="space-y-4" aria-label="Squad decisions">
          {analysis ? (
            <>
              <HealthPanel health={analysis.health} />
              <ProblemsPanel problems={analysis.problems} />
            </>
          ) : (
            <div className="border border-border bg-card p-4 text-xs leading-5 text-muted-foreground">
              <CalendarDays className="mb-2 size-4" aria-hidden="true" />
              Health analysis is waiting for official fixture context.
            </div>
          )}
          <DecisionsPanel
            picks={squad.picks}
            recommendations={recommendations}
            chips={chips}
            context={context}
          />
        </aside>
      </div>

      <div className="mt-6 flex flex-col justify-between gap-3 border border-border bg-card px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">
          <Target className="size-4 text-forecast" aria-hidden="true" />
          Decisions use the latest stored squad; unpublished 2026/27 data is not
          activated.
        </span>
        <Link
          href="/predictions"
          className="inline-flex items-center gap-1.5 font-bold text-foreground hover:underline"
        >
          Compare the full player pool
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
