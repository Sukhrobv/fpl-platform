"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  Scale,
  ShieldAlert,
  Trash2,
  UserRoundSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  confidenceForForecast,
  evaluateTransfer,
  type ExplorerPlayer,
  type PreseasonOverride,
  type PreseasonOverrideKind,
} from "@/components/player-explorer/model";
import { Input } from "@/components/ui/input";
import {
  ConfidenceState,
  FreshnessState,
  MetricBlock,
  PlayerIdentity,
} from "./DecisionPrimitives";

function metricValue(value: number | null, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}

const overrideKinds: Array<{ value: PreseasonOverrideKind; label: string }> = [
  { value: "LATE_RETURN", label: "Late return" },
  { value: "MANAGED_MINUTES", label: "Managed minutes" },
  { value: "UNAVAILABLE", label: "Confirmed unavailable" },
  { value: "SELECTION_RISK", label: "Selection risk" },
  { value: "CONFIRMED_STARTER", label: "Confirmed starter (evidence only)" },
];

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function PreseasonOverrideEditor({
  player,
  override,
  onChange,
}: {
  player: ExplorerPlayer;
  override: PreseasonOverride | null;
  onChange: (
    seasonPlayerId: number,
    override: PreseasonOverride | null,
  ) => void;
}) {
  const [kind, setKind] = useState<PreseasonOverrideKind>(
    override?.kind ?? "MANAGED_MINUTES",
  );
  const [availabilityCap, setAvailabilityCap] = useState(
    override?.availabilityCap?.toString() ?? "",
  );
  const [startCap, setStartCap] = useState(
    override?.startProbabilityCap != null
      ? String(Math.round(override.startProbabilityCap * 100))
      : "",
  );
  const [minutesCap, setMinutesCap] = useState(
    override?.expectedMinutesCap?.toString() ?? "",
  );
  const [throughGw, setThroughGw] = useState(
    String(override?.appliesThroughGameweek ?? 1),
  );
  const [note, setNote] = useState(override?.note ?? "");
  const [sourceUrl, setSourceUrl] = useState(override?.sourceUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKind(override?.kind ?? "MANAGED_MINUTES");
    setAvailabilityCap(override?.availabilityCap?.toString() ?? "");
    setStartCap(
      override?.startProbabilityCap != null
        ? String(Math.round(override.startProbabilityCap * 100))
        : "",
    );
    setMinutesCap(override?.expectedMinutesCap?.toString() ?? "");
    setThroughGw(String(override?.appliesThroughGameweek ?? 1));
    setNote(override?.note ?? "");
    setSourceUrl(override?.sourceUrl ?? "");
    setError(null);
  }, [override, player.id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/preseason-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: "2026/27",
          seasonPlayerId: player.id,
          kind,
          availabilityCap:
            kind === "UNAVAILABLE" ? 0 : numberOrNull(availabilityCap),
          startProbabilityCap:
            numberOrNull(startCap) == null
              ? null
              : numberOrNull(startCap)! / 100,
          expectedMinutesCap: numberOrNull(minutesCap),
          appliesThroughGameweek: numberOrNull(throughGw) ?? 1,
          note,
          sourceUrl: sourceUrl || null,
        }),
      });
      const payload = (await response.json()) as {
        override?: PreseasonOverride;
        error?: unknown;
      };
      if (!response.ok || !payload.override) {
        throw new Error("Override could not be saved");
      }
      onChange(player.id, payload.override);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Override could not be saved",
      );
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/preseason-overrides?season=2026%2F27&seasonPlayerId=${player.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Override could not be cleared");
      onChange(player.id, null);
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Override could not be cleared",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="border border-uncertainty/40 bg-uncertainty/5 p-4"
      aria-labelledby="preseason-override-title"
    >
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h3 id="preseason-override-title" className="text-sm font-black">
            Preseason note
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Manual evidence can only cap uncertain availability, starts or
            minutes. It expires automatically after its chosen GW.
          </p>
        </div>
        {override ? (
          <Badge variant="outline">
            Active through GW{override.appliesThroughGameweek}
          </Badge>
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Select
          value={kind}
          onValueChange={(value) => setKind(value as PreseasonOverrideKind)}
        >
          <SelectTrigger aria-label="Preseason note type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {overrideKinds.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={throughGw}
          onChange={(event) => setThroughGw(event.target.value)}
          type="number"
          min={1}
          max={38}
          aria-label="Applies through gameweek"
          placeholder="Applies through GW"
        />
        <Input
          value={availabilityCap}
          onChange={(event) => setAvailabilityCap(event.target.value)}
          type="number"
          min={0}
          max={100}
          disabled={kind === "UNAVAILABLE"}
          aria-label="Availability cap percent"
          placeholder="Availability cap %"
        />
        <Input
          value={startCap}
          onChange={(event) => setStartCap(event.target.value)}
          type="number"
          min={0}
          max={100}
          aria-label="Start probability cap percent"
          placeholder="Start cap %"
        />
        <Input
          value={minutesCap}
          onChange={(event) => setMinutesCap(event.target.value)}
          type="number"
          min={0}
          max={90}
          aria-label="Expected minutes cap"
          placeholder="Minutes cap"
        />
        <Input
          value={sourceUrl}
          onChange={(event) => setSourceUrl(event.target.value)}
          type="url"
          aria-label="Source URL"
          placeholder="Optional source URL"
        />
      </div>
      <Input
        className="mt-3"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        aria-label="Preseason note reason"
        placeholder="Reason and confirmed context"
      />
      {error ? <p className="mt-2 text-xs text-risk">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save note"}
        </Button>
        {override ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void clear()}
            disabled={saving}
          >
            Clear note
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function PlayerDetailsDialog({
  player,
  gameweeks,
  open,
  onOpenChange,
  selected,
  onToggleCompare,
  override,
  onOverrideChange,
}: {
  player: ExplorerPlayer | null;
  gameweeks: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: boolean;
  onToggleCompare: (player: ExplorerPlayer) => void;
  override: PreseasonOverride | null;
  onOverrideChange: (
    seasonPlayerId: number,
    override: PreseasonOverride | null,
  ) => void;
}) {
  if (!player) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="border-b border-border pb-4 pr-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <PlayerIdentity player={player} />
            <FreshnessState status="frozen" />
          </div>
          <DialogTitle className="sr-only">
            {player.webName} details
          </DialogTitle>
          <DialogDescription>
            Player facts and forecasts remain visibly separate.
          </DialogDescription>
        </DialogHeader>

        <dl className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border pb-4 text-xs">
          {[
            ["Price", `£${(player.nowCost / 10).toFixed(1)}m`],
            ["Ownership", `${player.selectedBy.toFixed(1)}%`],
            ["Season points", String(player.totalPoints)],
            ["PPG", player.pointsPerGame.toFixed(1)],
            ["Form", player.form.toFixed(1)],
            ["GW1 xPts", metricValue(player.forecastTotal)],
            ["£m / season pt", metricValue(player.costPerSeasonPoint, 2)],
            ["£m / xPt", metricValue(player.costPerForecastPoint, 2)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="fpl-data font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="player-forecast-title">
          <h3 id="player-forecast-title" className="mb-2 text-sm font-black">
            Next five gameweeks
          </h3>
          {gameweeks.length ? (
            <div className="overflow-x-auto border border-border bg-background">
              <div className="min-w-[44rem] divide-y divide-border">
                {gameweeks.map((gameweek) => {
                  const forecast = player.forecasts[gameweek];
                  const fixture = player.fixtures[gameweek];
                  return (
                    <article
                      key={gameweek}
                      className="grid grid-cols-[5rem_9rem_8rem_1fr] gap-4 p-4 text-xs"
                    >
                      <div>
                        <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                          GW{gameweek}
                        </p>
                        <p className="mt-1 text-sm font-black">
                          {fixture?.fixture ?? forecast?.fixture ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                          Expected points
                        </p>
                        <p className="fpl-data mt-1 text-2xl font-black text-forecast">
                          {forecast ? forecast.xPts.toFixed(1) : "—"}
                        </p>
                        {forecast?.range ? (
                          <p className="fpl-data mt-1 text-muted-foreground">
                            {forecast.range.lower.toFixed(1)}–
                            {forecast.range.upper.toFixed(1)} range
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                          Availability
                        </p>
                        {forecast ? (
                          <div className="mt-1">
                            <ConfidenceState
                              level={confidenceForForecast(forecast)}
                            />
                            <p className="fpl-data mt-2">
                              {forecast.raw?.eMin?.toFixed(0) ?? "—"} min ·{" "}
                              {forecast.raw?.pStart != null
                                ? `${(forecast.raw.pStart * 100).toFixed(0)}% start`
                                : "—"}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-1 leading-5 text-muted-foreground">
                            Fixture confirmed. Estimate awaits current-season
                            evidence.
                          </p>
                        )}
                      </div>
                      {forecast ? (
                        <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-l border-border pl-4">
                          <div>
                            <p className="text-muted-foreground">Appearance</p>
                            <p className="fpl-data font-bold">
                              {forecast.breakdown.appearance.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Attack</p>
                            <p className="fpl-data font-bold">
                              {forecast.breakdown.attack.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Clean sheet</p>
                            <p className="fpl-data font-bold">
                              {(forecast.breakdown.cleanSheet ?? 0).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Goals conceded
                            </p>
                            <p className="fpl-data font-bold">
                              −
                              {(
                                forecast.breakdown.goalsConcededPenalty ?? 0
                              ).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">DEFCON</p>
                            <p className="fpl-data font-bold">
                              {(forecast.breakdown.defcon ?? 0).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Final xG / xA per 90
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.player?.attackRate?.fixtureXG90?.toFixed(
                                2,
                              ) ?? "—"}{" "}
                              /{" "}
                              {forecast.context?.player?.attackRate?.fixtureXA90?.toFixed(
                                2,
                              ) ?? "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Role · evidence
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.reliability?.roleContinuity !=
                              null
                                ? `${(forecast.context.reliability.roleContinuity * 100).toFixed(0)}%`
                                : "—"}{" "}
                              ·{" "}
                              {forecast.context?.reliability?.evidenceQuality !=
                              null
                                ? `${(forecast.context.reliability.evidenceQuality * 100).toFixed(0)}%`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Opponent defence prior
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.opponent?.strengthSource ===
                              "HISTORICAL"
                                ? `${forecast.context.opponent.historicalSourceSeason ?? "prior"} ×${forecast.context.opponent.historicalDefenseMultiplier?.toFixed(2) ?? "1.00"}`
                                : "Neutral"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              H2H v {forecast.opponent}
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.player?.h2h
                                ? `${forecast.context.player.h2h.matches} matches · ${forecast.context.player.h2h.minutes} min`
                                : "No qualifying history"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">H2H xG / xA</p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.player?.h2h
                                ? `${forecast.context.player.h2h.xG.toFixed(2)} / ${forecast.context.player.h2h.xA.toFixed(2)}`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              H2H goals / assists
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.player?.h2h
                                ? `${forecast.context.player.h2h.goals} / ${forecast.context.player.h2h.assists}`
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              H2H model weight
                            </p>
                            <p className="fpl-data font-bold">
                              {forecast.context?.player?.h2h
                                ? `${(forecast.context.player.h2h.weight * 100).toFixed(0)}%`
                                : "—"}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="border-l border-border pl-4 leading-5 text-muted-foreground">
                          Detailed xPts components will appear here only when
                          the season-scoped model has real inputs for this GW.
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex gap-3 border border-uncertainty/40 bg-uncertainty/5 p-4 text-xs text-muted-foreground">
              <ShieldAlert
                className="size-4 shrink-0 text-uncertainty"
                aria-hidden="true"
              />
              The five-gameweek fixture plan is unavailable until the canonical
              season schedule is synced.
            </div>
          )}
        </section>

        <PreseasonOverrideEditor
          player={player}
          override={override}
          onChange={onOverrideChange}
        />

        <DialogFooter>
          <Button
            variant={selected ? "secondary" : "default"}
            onClick={() => onToggleCompare(player)}
          >
            <Scale aria-hidden="true" />
            {selected ? "Remove from comparison" : "Add to comparison"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PlayerComparisonDialog({
  players,
  open,
  onOpenChange,
  onRemove,
  onStartTransfer,
}: {
  players: ExplorerPlayer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: (player: ExplorerPlayer) => void;
  onStartTransfer: () => void;
}) {
  const bestForecast = useMemo(
    () =>
      players
        .filter((player) => player.forecastTotal != null)
        .sort((a, b) => (b.forecastTotal ?? 0) - (a.forecastTotal ?? 0))[0],
    [players],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="border-b border-border pb-4 pr-8">
          <DialogTitle className="text-lg font-black">
            Compare players
          </DialogTitle>
          <DialogDescription>
            Facts, forecasts and evidence status are compared without mixing
            their meaning.
          </DialogDescription>
        </DialogHeader>

        {players.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-32 border border-border bg-muted/40 p-3 text-left text-[10px] uppercase">
                    Metric
                  </th>
                  {players.map((player) => (
                    <th
                      key={player.id}
                      className="min-w-44 border border-border p-3 text-left align-top"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <PlayerIdentity player={player} compact />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRemove(player)}
                          aria-label={`Remove ${player.webName} from comparison`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Price",
                    (player: ExplorerPlayer) =>
                      `£${(player.nowCost / 10).toFixed(1)}m`,
                  ],
                  [
                    "Points",
                    (player: ExplorerPlayer) => String(player.totalPoints),
                  ],
                  [
                    "PPG",
                    (player: ExplorerPlayer) => player.pointsPerGame.toFixed(1),
                  ],
                  [
                    "Ownership",
                    (player: ExplorerPlayer) =>
                      `${player.selectedBy.toFixed(1)}%`,
                  ],
                  ["Form", (player: ExplorerPlayer) => player.form.toFixed(1)],
                  [
                    "Next xPts",
                    (player: ExplorerPlayer) =>
                      metricValue(player.forecastTotal),
                  ],
                ].map(([label, value]) => (
                  <tr key={String(label)}>
                    <th
                      scope="row"
                      className="border border-border bg-muted/40 p-3 text-left text-[10px] font-black uppercase"
                    >
                      {String(label)}
                    </th>
                    {players.map((player) => (
                      <td
                        key={player.id}
                        className={cn(
                          "fpl-data border border-border p-3 text-right font-bold",
                          label === "Next xPts" && "text-forecast",
                        )}
                      >
                        {(value as (player: ExplorerPlayer) => string)(player)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border border-border p-5 text-sm text-muted-foreground">
            Select players in the table to compare them.
          </p>
        )}

        <div className="flex items-center gap-3 border border-border bg-background p-3">
          <Scale className="size-4 text-forecast" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            {bestForecast
              ? `${bestForecast.webName} has the strongest available forecast in this set.`
              : "No comparable forecast is published for this set yet."}
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onStartTransfer} disabled={players.length < 2}>
            Evaluate transfer
            <ArrowRight aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TransferAdvisorDialog({
  players,
  open,
  onOpenChange,
}: {
  players: ExplorerPlayer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [outId, setOutId] = useState("");
  const [inId, setInId] = useState("");

  useEffect(() => {
    if (!open) return;
    setOutId(String(players[0]?.id ?? ""));
    setInId(String(players[1]?.id ?? ""));
  }, [open, players]);

  const playerOut = players.find((player) => String(player.id) === outId);
  const playerIn = players.find((player) => String(player.id) === inId);
  const evaluation =
    playerOut && playerIn ? evaluateTransfer(playerOut, playerIn) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="border-b border-border pb-4 pr-8">
          <DialogTitle className="text-lg font-black">
            Transfer advisor
          </DialogTitle>
          <DialogDescription>
            Evaluate one positional swap. This flow supports a decision; it does
            not execute an FPL transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label>
            <span className="mb-1.5 block text-[10px] font-black tracking-wider text-muted-foreground uppercase">
              Player out
            </span>
            <Select value={outId} onValueChange={setOutId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {players.map((player) => (
                  <SelectItem key={player.id} value={String(player.id)}>
                    {player.webName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <ArrowRight
            className="mb-2 hidden size-4 text-muted-foreground sm:block"
            aria-hidden="true"
          />
          <label>
            <span className="mb-1.5 block text-[10px] font-black tracking-wider text-muted-foreground uppercase">
              Player in
            </span>
            <Select value={inId} onValueChange={setInId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {players.map((player) => (
                  <SelectItem key={player.id} value={String(player.id)}>
                    {player.webName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        {playerOut && playerIn && evaluation && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-border bg-background p-3">
                <PlayerIdentity player={playerOut} compact />
              </div>
              <div className="border border-border bg-background p-3">
                <PlayerIdentity player={playerIn} compact />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <MetricBlock
                label="Forecast delta"
                value={
                  evaluation.forecastDelta == null
                    ? "—"
                    : `${evaluation.forecastDelta >= 0 ? "+" : ""}${evaluation.forecastDelta.toFixed(1)}`
                }
                tone={
                  evaluation.forecastDelta != null &&
                  evaluation.forecastDelta > 0
                    ? "positive"
                    : evaluation.forecastDelta != null &&
                        evaluation.forecastDelta < 0
                      ? "risk"
                      : "uncertainty"
                }
              />
              <MetricBlock
                label="Price delta"
                value={`${evaluation.costDelta >= 0 ? "+" : "−"}£${(Math.abs(evaluation.costDelta) / 10).toFixed(1)}m`}
              />
              <MetricBlock
                label="Position"
                value={evaluation.compatible ? "Valid" : "Invalid"}
                tone={evaluation.compatible ? "positive" : "risk"}
              />
            </dl>
            <div
              className={cn(
                "flex gap-3 border p-3 text-xs",
                evaluation.verdict === "upgrade"
                  ? "border-positive-delta/40 bg-positive-delta/5"
                  : evaluation.verdict === "invalid" ||
                      evaluation.verdict === "downgrade"
                    ? "border-risk/40 bg-risk/5"
                    : "border-uncertainty/40 bg-uncertainty/5",
              )}
            >
              <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
              <p>
                {evaluation.verdict === "upgrade" &&
                  "The available forecast supports this upgrade."}
                {evaluation.verdict === "downgrade" &&
                  "The available forecast does not support this move."}
                {evaluation.verdict === "neutral" &&
                  "The forecast difference is too small to justify the move alone."}
                {evaluation.verdict === "awaiting-data" &&
                  "Official fixture evidence is required before judging this move."}
                {evaluation.verdict === "invalid" &&
                  "FPL transfers must replace a player with another player in the same position."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" render={<Link href="/personal" />}>
            <UserRoundSearch aria-hidden="true" />
            Back to My Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
