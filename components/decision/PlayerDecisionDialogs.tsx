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
} from "@/components/player-explorer/model";
import {
  ConfidenceState,
  FreshnessState,
  MetricBlock,
  PlayerIdentity,
} from "./DecisionPrimitives";

function metricValue(value: number | null, digits = 1) {
  return value == null ? "—" : value.toFixed(digits);
}

export function PlayerDetailsDialog({
  player,
  gameweeks,
  open,
  onOpenChange,
  selected,
  onToggleCompare,
}: {
  player: ExplorerPlayer | null;
  gameweeks: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: boolean;
  onToggleCompare: (player: ExplorerPlayer) => void;
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

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricBlock
            label="Price"
            value={`£${(player.nowCost / 10).toFixed(1)}m`}
          />
          <MetricBlock
            label="Season points"
            value={String(player.totalPoints)}
          />
          <MetricBlock
            label="Points / game"
            value={player.pointsPerGame.toFixed(1)}
          />
          <MetricBlock
            label="Ownership"
            value={`${player.selectedBy.toFixed(1)}%`}
          />
          <MetricBlock label="Form" value={player.form.toFixed(1)} />
          <MetricBlock
            label="Next xPts"
            value={metricValue(player.forecastTotal)}
            tone="forecast"
            note={
              player.forecastTotal == null
                ? "Official fixtures pending"
                : `${gameweeks.length} gameweeks`
            }
          />
        </dl>

        <section aria-labelledby="player-forecast-title">
          <h3 id="player-forecast-title" className="mb-2 text-sm font-black">
            Forecast path
          </h3>
          {gameweeks.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {gameweeks.map((gameweek) => {
                const forecast = player.forecasts[gameweek];
                return (
                  <div
                    key={gameweek}
                    className="border border-border bg-background p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                          GW{gameweek}
                        </p>
                        <p className="mt-1 text-xs font-bold">
                          {forecast?.fixture ||
                            forecast?.opponent ||
                            "Fixture unavailable"}
                        </p>
                      </div>
                      <p className="fpl-data text-xl font-black text-forecast">
                        {forecast ? forecast.xPts.toFixed(1) : "—"}
                      </p>
                    </div>
                    <div className="mt-2">
                      <ConfidenceState
                        level={confidenceForForecast(forecast)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex gap-3 border border-uncertainty/40 bg-uncertainty/5 p-4 text-xs text-muted-foreground">
              <ShieldAlert
                className="size-4 shrink-0 text-uncertainty"
                aria-hidden="true"
              />
              Forecasts stay empty until the official 2026/27 fixtures are
              available.
            </div>
          )}
        </section>

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
