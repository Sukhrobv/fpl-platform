"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CopyPlus,
  Crown,
  FilePlus2,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import {
  assessPreseasonSquad,
  buildBalancedPreseasonSquad,
  type BalancedAutoPickResult,
  type PreseasonPlayerAssessment,
  type PreseasonPosition,
  type SquadAssessment,
  type SquadInput,
} from "@/lib/services/preseasonDecisionModel";
import {
  getOptimalSquadLineup,
  normalizeFplSquadIds,
} from "@/lib/services/squadLineup";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TeamMark } from "@/components/decision/DecisionPrimitives";

type Position = PreseasonPosition;

interface PreviewPlayer {
  seasonPlayerId: number;
  playerName: string;
  team: string;
  position: Position;
  price: number;
  totalXPts: number;
  estimateStatus: "PREVIEW_ONLY" | "PARTIAL" | "UNAVAILABLE";
  availability: { status: string; chanceOfPlaying: number | null };
  confidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceScore: number;
  limitations: string[];
  evidence: PreseasonPlayerAssessment["priorMetrics"];
  reliability: PreseasonPlayerAssessment["reliability"];
  fixtures: Array<{ opponent: string; isHome: boolean }>;
  forecasts?: Record<number, GameweekForecast>;
}

interface GameweekForecast {
  xPts: number;
  fixture: string;
  opponent: string;
  isHome: boolean;
}

interface PreviewResponse {
  season: { code: string };
  snapshot: { id: number; fetchedAt: string };
  preview: { methodology: string; projections: PreviewPlayer[] };
}

interface PredictionsResponse {
  gameweeks: number[];
  predictions: Array<{
    playerId: number;
    history: Record<number, GameweekForecast>;
  }>;
}

interface SquadDraftState {
  playerIds: number[];
  starterIds: number[];
  captainId: number | null;
  viceCaptainId: number | null;
  bank: number;
}

interface SquadDraft {
  id: number;
  name: string;
  state: SquadDraftState;
  previewSnapshotId: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DraftsResponse {
  season: string;
  snapshotId: number;
  drafts: SquadDraft[];
}

interface Slot {
  position: Position;
  index: number;
}

interface Recommendation {
  kind: "PICK" | "SWAP";
  incoming: PreviewPlayer;
  outgoing?: PreviewPlayer;
  ratingLift?: number;
  explanation: string[];
  metrics?: {
    expectedPointsDelta: number;
    reliabilityDelta: number;
    priceDelta: number;
    defconActionsDelta: number | null;
    squadPotentialDelta: number;
    squadReliabilityDelta: number;
    squadResilienceDelta: number;
  };
}

interface RecommendationGroup {
  position: Position;
  recommendations: Recommendation[];
}

const POSITION_GROUPS: Array<{
  position: Position;
  label: string;
  shortLabel: string;
  count: number;
}> = [
  { position: "GOALKEEPER", label: "Goalkeepers", shortLabel: "GK", count: 2 },
  { position: "DEFENDER", label: "Defenders", shortLabel: "DEF", count: 5 },
  { position: "MIDFIELDER", label: "Midfielders", shortLabel: "MID", count: 5 },
  { position: "FORWARD", label: "Forwards", shortLabel: "FWD", count: 3 },
];

function forecastedXPts(player: PreviewPlayer, gameweek: number) {
  return player.forecasts?.[gameweek]?.xPts ?? player.totalXPts;
}

function forecastedFixture(player: PreviewPlayer, gameweek: number) {
  return (
    player.forecasts?.[gameweek]?.fixture ??
    (player.fixtures[0]
      ? `${player.fixtures[0].opponent} (${player.fixtures[0].isHome ? "H" : "A"})`
      : "-")
  );
}

function forecastedFiveGameweekXPts(
  player: PreviewPlayer,
  gameweeks: readonly number[],
) {
  return gameweeks
    .slice(0, 5)
    .reduce((total, gameweek) => total + forecastedXPts(player, gameweek), 0);
}

interface ForecastValueRange {
  min: number;
  max: number;
}

interface ForecastTableRanges {
  byGameweek: Map<number, ForecastValueRange>;
  fiveGameweeks: ForecastValueRange;
  difference: ForecastValueRange | null;
}

function forecastValueRange(values: readonly number[]): ForecastValueRange {
  if (!values.length) return { min: 0, max: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function forecastValueTone(value: number, range: ForecastValueRange) {
  const spread = range.max - range.min;
  if (spread < 0.05) return "text-muted-foreground";

  const relativeValue = (value - range.min) / spread;
  if (relativeValue >= 0.86) return "text-emerald-800";
  if (relativeValue >= 0.72) return "text-emerald-600";
  if (relativeValue >= 0.58) return "text-lime-700";
  if (relativeValue >= 0.43) return "text-amber-700";
  if (relativeValue >= 0.28) return "text-orange-700";
  if (relativeValue >= 0.14) return "text-red-600";
  return "text-red-800";
}

function asAssessment(
  player: PreviewPlayer,
  projectedPoints = player.totalXPts,
): PreseasonPlayerAssessment {
  return {
    id: player.seasonPlayerId,
    team: player.team,
    position: player.position,
    price: player.price,
    projectedPoints,
    availability: player.availability,
    confidence: player.confidence,
    confidenceScore: player.confidenceScore,
    uncertaintyReasons: player.limitations,
    priorUsage: { minutes: 0, appearances: 0, starts: null },
    priorMetrics: player.evidence,
    reliability: player.reliability,
  };
}

function slotId({ position, index }: Slot) {
  return `${position}-${index}`;
}

function formatSigned(value: number, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

const SquadForecastTableRow = memo(function SquadForecastTableRow({
  player,
  start,
  displayedGameweeks,
  gameweeks,
  ranges,
  activeSlotFiveGameweekXPts,
  isPlayerSelectionMode,
  selected,
  inActiveSlot,
  onChoosePlayer,
}: {
  player: PreviewPlayer;
  start: number;
  displayedGameweeks: readonly number[];
  gameweeks: readonly number[];
  ranges: ForecastTableRanges;
  activeSlotFiveGameweekXPts: number | null;
  isPlayerSelectionMode: boolean;
  selected: boolean;
  inActiveSlot: boolean;
  onChoosePlayer: (player: PreviewPlayer) => void;
}) {
  const fiveGameweekXPts = forecastedFiveGameweekXPts(player, gameweeks);
  const difference =
    activeSlotFiveGameweekXPts == null
      ? null
      : fiveGameweekXPts - activeSlotFiveGameweekXPts;
  const rowClassName = cn(
    "absolute left-0 grid w-full grid-cols-[minmax(10rem,1fr)_3.25rem_repeat(5,3.25rem)_4rem] items-center gap-x-1 border-b border-border/70 px-3 text-xs",
    isPlayerSelectionMode ? "h-[52px]" : "h-[42px]",
    selected && "bg-primary/8",
    isPlayerSelectionMode &&
      "text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
  );
  const rowContent = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <TeamMark shortName={player.team} name={player.team} size="sm" />
        <span className="min-w-0 truncate font-bold">{player.playerName}</span>
      </span>
      <span className="fpl-data text-right text-muted-foreground">
        {(player.price / 10).toFixed(1)}
      </span>
      {displayedGameweeks.map((gameweek) => {
        const xPts = forecastedXPts(player, gameweek);
        return (
          <span
            key={gameweek}
            className="flex h-full flex-col items-center justify-center text-center"
          >
            <span
              className={cn(
                "fpl-data block font-black",
                forecastValueTone(
                  xPts,
                  ranges.byGameweek.get(gameweek) ?? { min: 0, max: 0 },
                ),
              )}
            >
              {xPts.toFixed(1)}
            </span>
            {isPlayerSelectionMode ? (
              <span className="block w-full truncate text-center text-[8px] font-bold text-muted-foreground">
                {forecastedFixture(player, gameweek)}
              </span>
            ) : null}
          </span>
        );
      })}
      <span className="flex h-full flex-col items-center justify-center text-center">
        <span
          className={cn(
            "fpl-data block font-black",
            isPlayerSelectionMode
              ? difference == null || ranges.difference == null
                ? "text-muted-foreground"
                : forecastValueTone(difference, ranges.difference)
              : forecastValueTone(fiveGameweekXPts, ranges.fiveGameweeks),
          )}
        >
          {isPlayerSelectionMode
            ? difference == null
              ? "-"
              : formatSigned(difference)
            : fiveGameweekXPts.toFixed(1)}
        </span>
        {isPlayerSelectionMode ? (
          <span aria-hidden="true" className="invisible block text-[8px]">
            fixture
          </span>
        ) : null}
      </span>
    </>
  );

  return isPlayerSelectionMode ? (
    <button
      type="button"
      disabled={selected && !inActiveSlot}
      onClick={() => onChoosePlayer(player)}
      className={rowClassName}
      style={{ transform: `translateY(${start}px)` }}
    >
      {rowContent}
    </button>
  ) : (
    <div
      className={rowClassName}
      style={{ transform: `translateY(${start}px)` }}
    >
      {rowContent}
    </div>
  );
});

const PITCH_GROUPS = POSITION_GROUPS;

const teamKitTones: Record<string, string> = {
  ARS: "#e30613",
  AVL: "#6b1f3a",
  BHA: "#0057b8",
  BOU: "#d71920",
  BRE: "#e30613",
  BUR: "#6c1d45",
  CHE: "#034694",
  CRY: "#1b458f",
  EVE: "#003399",
  FUL: "#151515",
  LEE: "#1d4f91",
  LIV: "#c8102e",
  MCI: "#6cabdd",
  MUN: "#da291c",
  NEW: "#222222",
  NFO: "#dd0000",
  SUN: "#e30613",
  TOT: "#132257",
  WHU: "#7a263a",
  WOL: "#fdb913",
};

function kitTone(team: string) {
  return teamKitTones[team.toUpperCase()] ?? "#53616f";
}

function swapMetrics(outgoing: PreviewPlayer, incoming: PreviewPlayer) {
  const outgoingDefcon = outgoing.evidence.defconActions90;
  const incomingDefcon = incoming.evidence.defconActions90;
  return {
    expectedPointsDelta: incoming.totalXPts - outgoing.totalXPts,
    reliabilityDelta: incoming.reliability.score - outgoing.reliability.score,
    priceDelta: incoming.price - outgoing.price,
    defconActionsDelta:
      incomingDefcon != null && outgoingDefcon != null
        ? incomingDefcon - outgoingDefcon
        : null,
  };
}

function formatPrice(price: number) {
  return `£${(price / 10).toFixed(1)}`;
}

function calculateBank(
  playerIds: readonly number[],
  playerPool: readonly PreviewPlayer[],
) {
  const pricesByPlayerId = new Map(
    playerPool.map((player) => [player.seasonPlayerId, player.price]),
  );
  const spent = playerIds.reduce(
    (total, playerId) => total + (pricesByPlayerId.get(playerId) ?? 0),
    0,
  );
  return 1000 - spent;
}

async function readApiJson<T>(
  response: Response,
): Promise<T | { error: string }> {
  const body = await response.text();
  if (!body.trim()) {
    return { error: "The data service returned an empty response." };
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    return { error: "The data service returned an invalid response." };
  }
}

function emptyDraftState(): SquadDraftState {
  return {
    playerIds: [],
    starterIds: [],
    captainId: null,
    viceCaptainId: null,
    bank: 0,
  };
}

function normalizePreviewSquadIds(
  ids: readonly number[],
  playerPool: readonly PreviewPlayer[],
) {
  return normalizeFplSquadIds(
    ids,
    playerPool.map((player) => ({
      id: player.seasonPlayerId,
      position: player.position,
    })),
  );
}

function reliabilityTone(score: number) {
  if (score >= 75) return "text-fresh";
  if (score >= 60) return "text-uncertainty";
  return "text-risk";
}

function decisionRating(assessment: SquadAssessment) {
  return (
    assessment.potential.total * 2 +
    assessment.reliability.startingXI * 0.45 +
    assessment.resilience.score * 0.25
  );
}

export function Gw1SquadBuilder() {
  const [players, setPlayers] = useState<PreviewPlayer[]>([]);
  const [snapshot, setSnapshot] = useState<PreviewResponse["snapshot"] | null>(
    null,
  );
  const [gameweeks, setGameweeks] = useState<number[]>([1]);
  const [activeGameweek, setActiveGameweek] = useState(1);
  const activeGameweekRef = useRef(activeGameweek);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [positionFilter, setPositionFilter] = useState<Position | "ALL">("ALL");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [starterIds, setStarterIds] = useState<number[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<SquadDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [draftsReady, setDraftsReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newVariantOpen, setNewVariantOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [autoPick, setAutoPick] = useState<BalancedAutoPickResult | null>(null);
  const [autoPickError, setAutoPickError] = useState<string | null>(null);
  const [selectionHistory, setSelectionHistory] = useState<number[][]>([]);
  const [isPlayerSelectionMode, setIsPlayerSelectionMode] = useState(false);
  const [activeSlot, setActiveSlot] = useState<Slot>({
    position: "GOALKEEPER",
    index: 0,
  });
  const forecastTableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeGameweekRef.current = activeGameweek;
  }, [activeGameweek]);
  const draftState = useMemo<SquadDraftState>(
    () => ({
      playerIds: selectedIds,
      starterIds,
      captainId,
      viceCaptainId,
      bank: calculateBank(selectedIds, players),
    }),
    [captainId, players, selectedIds, starterIds, viceCaptainId],
  );
  const restoreDraft = useCallback(
    (draft: SquadDraft, playerPool: PreviewPlayer[]) => {
      const playerIds = normalizePreviewSquadIds(
        draft.state.playerIds,
        playerPool,
      );
      const lineup =
        playerIds.length === 15
          ? getOptimalSquadLineup(
              playerIds
                .map((id) =>
                  playerPool.find((player) => player.seasonPlayerId === id),
                )
                .filter((player): player is PreviewPlayer => player != null)
                .map((player) =>
                  asAssessment(
                    player,
                    forecastedXPts(player, activeGameweekRef.current),
                  ),
                ),
            )
          : null;
      setSelectedIds(playerIds);
      setStarterIds(lineup?.starterIds ?? []);
      setCaptainId(lineup?.captainId ?? null);
      setViceCaptainId(lineup?.viceCaptainId ?? null);
      setSelectionHistory([]);
      setAutoPick(null);
      setAutoPickError(null);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      try {
        const [previewResponse, draftsResponse, predictionsResponse] =
          await Promise.all([
            fetch("/api/preseason-squad?season=2026/27"),
            fetch("/api/preseason-squad-drafts?season=2026/27"),
            fetch("/api/predictions?season=2026/27"),
          ]);
        const payload = await readApiJson<PreviewResponse>(previewResponse);
        const draftsPayload = await readApiJson<DraftsResponse>(draftsResponse);
        const predictionsPayload =
          await readApiJson<PredictionsResponse>(predictionsResponse);
        if (!previewResponse.ok || !("preview" in payload)) {
          throw new Error(
            "error" in payload ? payload.error : "Preview unavailable",
          );
        }
        if (!draftsResponse.ok || !("drafts" in draftsPayload)) {
          throw new Error(
            "error" in draftsPayload
              ? draftsPayload.error
              : "Saved drafts unavailable",
          );
        }
        let loadedDrafts = draftsPayload.drafts;
        if (!loadedDrafts.length) {
          const createResponse = await fetch("/api/preseason-squad-drafts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              season: payload.season.code,
              name: "Squad draft",
              state: emptyDraftState(),
            }),
          });
          const created = (await createResponse.json()) as
            | { draft: SquadDraft }
            | { error: string };
          if (!createResponse.ok || !("draft" in created)) {
            throw new Error(
              "error" in created ? created.error : "Could not create draft",
            );
          }
          loadedDrafts = [created.draft];
        }
        const forecastsByPlayerId = new Map(
          predictionsResponse.ok && "predictions" in predictionsPayload
            ? predictionsPayload.predictions.map((prediction) => [
                prediction.playerId,
                prediction.history,
              ])
            : [],
        );
        const playerPool = payload.preview.projections.map((player) => ({
          ...player,
          forecasts: forecastsByPlayerId.get(player.seasonPlayerId),
        }));
        const availableGameweeks =
          predictionsResponse.ok &&
          "gameweeks" in predictionsPayload &&
          predictionsPayload.gameweeks.length
            ? predictionsPayload.gameweeks
            : [1];
        if (!active) return;
        setPlayers(playerPool);
        setSnapshot(payload.snapshot);
        setGameweeks(availableGameweeks);
        setActiveGameweek(availableGameweeks[0] ?? 1);
        setDrafts(loadedDrafts);
        setActiveDraftId(loadedDrafts[0].id);
        restoreDraft(loadedDrafts[0], playerPool);
        setDraftsReady(true);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Preview unavailable",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPreview();
    return () => {
      active = false;
    };
  }, [restoreDraft]);

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => players.find((player) => player.seasonPlayerId === id))
        .filter((player): player is PreviewPlayer => player != null),
    [players, selectedIds],
  );
  const assessments = useMemo(
    () =>
      selected.map((player) =>
        asAssessment(player, forecastedXPts(player, activeGameweek)),
      ),
    [activeGameweek, selected],
  );
  const benchIds = useMemo(
    () => selectedIds.filter((id) => !starterIds.includes(id)),
    [selectedIds, starterIds],
  );
  const hasCompleteLineup =
    selected.length === 15 && starterIds.length === 11 && benchIds.length === 4;
  const starterSlots = useMemo(
    () =>
      POSITION_GROUPS.map((group) => ({
        ...group,
        slots: selected
          .filter((player) => player.position === group.position)
          .map((player, index) => ({ player, index }))
          .filter(({ player }) => starterIds.includes(player.seasonPlayerId)),
      })),
    [selected, starterIds],
  );
  const benchSlots = useMemo(
    () =>
      selected
        .map((player) => ({
          player,
          index: selected
            .filter((candidate) => candidate.position === player.position)
            .findIndex(
              (candidate) => candidate.seasonPlayerId === player.seasonPlayerId,
            ),
        }))
        .filter(({ player }) => benchIds.includes(player.seasonPlayerId)),
    [benchIds, selected],
  );
  const squadInput = useMemo<SquadInput | null>(
    () =>
      selected.length === 15 &&
      starterIds.length === 11 &&
      benchIds.length === 4 &&
      captainId != null &&
      viceCaptainId != null
        ? {
            players: assessments,
            starterIds,
            benchIds,
            captainId,
            viceCaptainId,
            bank: calculateBank(selectedIds, players),
          }
        : null,
    [
      assessments,
      benchIds,
      captainId,
      players,
      selected.length,
      selectedIds,
      starterIds,
      viceCaptainId,
    ],
  );
  const assessment = useMemo(
    () => (squadInput ? assessPreseasonSquad(squadInput) : null),
    [squadInput],
  );
  const proposedCaptain = selected.find(
    (player) => player.seasonPlayerId === captainId,
  );
  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [activeDraftId, drafts],
  );
  const spent = selected.reduce((sum, player) => sum + player.price, 0);
  const bank = 1000 - spent;

  const playerForSlot = (slot: Slot) =>
    selected.filter((player) => player.position === slot.position)[slot.index];

  function renderSquadSlot(slot: Slot, player?: PreviewPlayer) {
    const group = POSITION_GROUPS.find(
      (item) => item.position === slot.position,
    );
    const selectedSlot = slotId(activeSlot) === slotId(slot);
    return (
      <div
        key={slotId(slot)}
        className="relative h-[9.25rem] w-[10.5rem] shrink-0 2xl:h-[10.5rem] 2xl:w-[11rem]"
      >
        <button
          type="button"
          onClick={() => openPlayerDialog(slot)}
          className={cn(
            "flex size-full flex-col items-center justify-center bg-transparent px-1 text-center transition-opacity hover:opacity-75",
            selectedSlot ? "text-primary" : "text-foreground",
          )}
          aria-label={
            player
              ? `${player.playerName}, ${player.team}, ${formatPrice(player.price)}`
              : `Add ${group?.label.slice(0, -1) ?? "player"} slot ${slot.index + 1}`
          }
          aria-pressed={selectedSlot}
        >
          {player ? (
            <span className="min-w-0">
              <span
                className={cn(
                  "mx-auto grid h-20 w-24 place-items-center border border-white/45 text-sm font-black text-white shadow-sm 2xl:h-24 2xl:w-28 2xl:text-base",
                  selectedSlot &&
                    "ring-2 ring-primary ring-offset-2 ring-offset-secondary",
                )}
                style={{
                  backgroundColor: kitTone(player.team),
                  clipPath:
                    "polygon(19% 0, 34% 0, 41% 14%, 59% 14%, 66% 0, 81% 0, 100% 28%, 82% 43%, 78% 100%, 22% 100%, 18% 43%, 0 28%)",
                }}
              >
                {player.team.slice(0, 1)}
              </span>
              <span className="mt-2 block truncate text-base font-black 2xl:text-lg">
                {player.playerName}
              </span>
              <span className="fpl-data mt-1 block text-base font-black text-forecast 2xl:text-lg">
                {forecastedXPts(player, activeGameweek).toFixed(1)} xPts
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground 2xl:text-sm">
                {forecastedFixture(player, activeGameweek)}
              </span>
            </span>
          ) : (
            <>
              <span className="sr-only">Add {group?.shortLabel}</span>
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full border border-dashed border-foreground/30 text-muted-foreground",
                  selectedSlot && "border-primary text-primary",
                )}
              >
                <Plus className="size-5" />
              </span>
            </>
          )}
        </button>
        {player ? (
          <button
            type="button"
            onClick={() => removePlayer(player, slot)}
            className="absolute top-2 right-2 z-10 grid size-6 place-items-center border border-border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:border-risk hover:text-risk 2xl:top-3 2xl:right-3"
            aria-label={`Remove ${player.playerName}`}
            title={`Remove ${player.playerName}`}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  const activeSlotPlayer = playerForSlot(activeSlot);
  const activeSlotFiveGameweekXPts = activeSlotPlayer
    ? forecastedFiveGameweekXPts(activeSlotPlayer, gameweeks)
    : null;
  const forecastTablePlayers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const requiredPosition = isPlayerSelectionMode
      ? activeSlot.position
      : positionFilter;

    return players
      .filter(
        (player) =>
          (requiredPosition === "ALL" ||
            player.position === requiredPosition) &&
          (teamFilter === "ALL" || player.team === teamFilter) &&
          (!normalized ||
            player.playerName.toLocaleLowerCase().includes(normalized) ||
            player.team.toLocaleLowerCase().includes(normalized)),
      )
      .sort(
        (left, right) =>
          forecastedFiveGameweekXPts(right, gameweeks) -
            forecastedFiveGameweekXPts(left, gameweeks) ||
          forecastedXPts(right, activeGameweek) -
            forecastedXPts(left, activeGameweek),
      );
  }, [
    activeGameweek,
    activeSlot.position,
    gameweeks,
    isPlayerSelectionMode,
    players,
    positionFilter,
    query,
    teamFilter,
  ]);
  const displayedGameweeks = useMemo(() => gameweeks.slice(0, 5), [gameweeks]);
  const forecastTableRanges = useMemo(() => {
    const byGameweek = new Map(
      displayedGameweeks.map((gameweek) => [
        gameweek,
        forecastValueRange(
          forecastTablePlayers.map((player) =>
            forecastedXPts(player, gameweek),
          ),
        ),
      ]),
    );
    const fiveGameweeks = forecastValueRange(
      forecastTablePlayers.map((player) =>
        forecastedFiveGameweekXPts(player, gameweeks),
      ),
    );
    const difference =
      activeSlotFiveGameweekXPts == null
        ? null
        : forecastValueRange(
            forecastTablePlayers.map(
              (player) =>
                forecastedFiveGameweekXPts(player, gameweeks) -
                activeSlotFiveGameweekXPts,
            ),
          );

    return { byGameweek, fiveGameweeks, difference };
  }, [
    activeSlotFiveGameweekXPts,
    displayedGameweeks,
    forecastTablePlayers,
    gameweeks,
  ]);
  const forecastTableVirtualizer = useVirtualizer({
    count: forecastTablePlayers.length,
    getScrollElement: () => forecastTableScrollRef.current,
    estimateSize: () => (isPlayerSelectionMode ? 52 : 42),
    overscan: 5,
  });
  useEffect(() => {
    forecastTableVirtualizer.measure();
    forecastTableScrollRef.current?.scrollTo({ top: 0 });
  }, [isPlayerSelectionMode]);
  const teams = useMemo(
    () => Array.from(new Set(players.map((player) => player.team))).sort(),
    [players],
  );
  const candidates = forecastTablePlayers;

  function selectPosition(position: Position) {
    const group = POSITION_GROUPS.find((item) => item.position === position);
    if (!group) return;
    const used = selected.filter(
      (player) => player.position === position,
    ).length;
    setActiveSlot({ position, index: Math.min(used, group.count - 1) });
  }

  const applySelection = useCallback(
    (nextIds: number[], recordHistory = true) => {
      const legalIds = normalizePreviewSquadIds(nextIds, players);
      const selectionChanged =
        legalIds.length !== selectedIds.length ||
        legalIds.some((id, index) => id !== selectedIds[index]);
      if (!selectionChanged) return;
      if (recordHistory) {
        setSelectionHistory((current) => [...current.slice(-19), selectedIds]);
      }
      setSelectedIds(legalIds);
      if (legalIds.length !== 15) {
        setStarterIds([]);
        setCaptainId(null);
        setViceCaptainId(null);
        return;
      }
      const nextPlayers = legalIds
        .map((id) => players.find((player) => player.seasonPlayerId === id))
        .filter((player): player is PreviewPlayer => player != null)
        .map((player) =>
          asAssessment(player, forecastedXPts(player, activeGameweek)),
        );
      const lineup = getOptimalSquadLineup(nextPlayers);
      setStarterIds(lineup.starterIds);
      setCaptainId(lineup.captainId);
      setViceCaptainId(lineup.viceCaptainId);
    },
    [activeGameweek, players, selectedIds],
  );

  function selectGameweek(gameweek: number) {
    setActiveGameweek(gameweek);
    if (selectedIds.length !== 15) return;
    const lineupPlayers = selectedIds
      .map((id) => players.find((player) => player.seasonPlayerId === id))
      .filter((player): player is PreviewPlayer => player != null)
      .map((player) => asAssessment(player, forecastedXPts(player, gameweek)));
    const lineup = getOptimalSquadLineup(lineupPlayers);
    setStarterIds(lineup.starterIds);
    setCaptainId(lineup.captainId);
    setViceCaptainId(lineup.viceCaptainId);
  }

  function openPlayerDialog(slot: Slot) {
    setActiveSlot(slot);
    setQuery("");
    setTeamFilter("ALL");
    setIsPlayerSelectionMode(true);
  }

  function undoLastSelection() {
    const previousSelection = selectionHistory.at(-1);
    if (!previousSelection) return;
    setSelectionHistory((current) => current.slice(0, -1));
    applySelection(previousSelection, false);
  }

  useEffect(() => {
    function handleUndo(event: KeyboardEvent) {
      const target = event.target;
      if (
        !(
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z"
        ) ||
        selectionHistory.length === 0 ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      event.preventDefault();
      undoLastSelection();
    }
    window.addEventListener("keydown", handleUndo);
    return () => window.removeEventListener("keydown", handleUndo);
  }, [selectionHistory]);

  function currentDraftState(): SquadDraftState {
    return draftState;
  }

  const saveActiveDraft = useCallback(async () => {
    if (activeDraftId == null) return false;
    setSaveStatus("saving");
    try {
      const response = await fetch(
        `/api/preseason-squad-drafts/${activeDraftId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: draftState }),
        },
      );
      const payload = (await response.json()) as
        | { draft: SquadDraft }
        | { error: string };
      if (!response.ok || !("draft" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Could not save draft",
        );
      }
      setDrafts((current) =>
        current.map((draft) =>
          draft.id === payload.draft.id ? payload.draft : draft,
        ),
      );
      setSaveStatus("saved");
      setSaveError(null);
      return true;
    } catch (saveFailure) {
      setSaveStatus("error");
      setSaveError(
        saveFailure instanceof Error
          ? saveFailure.message
          : "Could not save draft",
      );
      return false;
    }
  }, [activeDraftId, draftState]);

  useEffect(() => {
    if (!draftsReady || activeDraftId == null) return;
    const timeout = window.setTimeout(() => {
      void saveActiveDraft();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [activeDraftId, draftsReady, saveActiveDraft]);

  async function createDraft(name: string, state = currentDraftState()) {
    const normalizedName = name.trim();
    if (!normalizedName) return null;
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/preseason-squad-drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          season: "2026/27",
          name: normalizedName,
          state,
        }),
      });
      const payload = (await response.json()) as
        | { draft: SquadDraft }
        | { error: string };
      if (!response.ok || !("draft" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "Could not create draft",
        );
      }
      setDrafts((current) => [payload.draft, ...current]);
      setActiveDraftId(payload.draft.id);
      setSaveStatus("saved");
      setSaveError(null);
      return payload.draft;
    } catch (createFailure) {
      setSaveStatus("error");
      setSaveError(
        createFailure instanceof Error
          ? createFailure.message
          : "Could not create draft",
      );
      return null;
    }
  }

  async function switchDraft(draftId: number) {
    const draft = drafts.find((item) => item.id === draftId);
    if (!draft || draft.id === activeDraftId) return;
    if (!(await saveActiveDraft())) return;
    setActiveDraftId(draft.id);
    restoreDraft(draft, players);
  }

  async function createNewDraft() {
    if (activeDraftId != null && !(await saveActiveDraft())) return;
    const draft = await createDraft("Squad draft", emptyDraftState());
    if (draft) restoreDraft(draft, players);
  }

  async function createVariant() {
    if (!(await saveActiveDraft())) return;
    const draft = await createDraft(newVariantName);
    if (draft) {
      setNewVariantOpen(false);
      setNewVariantName("");
    }
  }

  async function deleteActiveDraft() {
    if (
      activeDraftId == null ||
      !window.confirm("Delete this saved draft? This cannot be undone.")
    ) {
      return;
    }
    try {
      const response = await fetch(
        `/api/preseason-squad-drafts/${activeDraftId}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Could not delete draft");
      const remainingDrafts = drafts.filter(
        (draft) => draft.id !== activeDraftId,
      );
      setDrafts(remainingDrafts);
      if (remainingDrafts[0]) {
        setActiveDraftId(remainingDrafts[0].id);
        restoreDraft(remainingDrafts[0], players);
      } else {
        await createNewDraft();
      }
    } catch (deleteFailure) {
      setSaveStatus("error");
      setSaveError(
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "Could not delete draft",
      );
    }
  }

  const choosePlayer = useCallback(
    (player: PreviewPlayer, slot = activeSlot) => {
      setAutoPick(null);
      setAutoPickError(null);
      const positionLimit = POSITION_GROUPS.find(
        (group) => group.position === slot.position,
      )?.count;
      const hasOpenSlot =
        positionLimit != null &&
        selected.filter((candidate) => candidate.position === slot.position)
          .length < positionLimit;
      const current =
        (hasOpenSlot ? undefined : playerForSlot(slot)) ??
        (selected.length === 15
          ? selected
              .filter((candidate) => candidate.position === slot.position)
              .at(-1)
          : undefined);
      const withoutCurrent = current
        ? selectedIds.filter((id) => id !== current.seasonPlayerId)
        : selectedIds;
      const nextIds = withoutCurrent.includes(player.seasonPlayerId)
        ? withoutCurrent
        : [...withoutCurrent, player.seasonPlayerId];
      applySelection(nextIds);
      setQuery("");
      setIsPlayerSelectionMode(false);
    },
    [activeSlot, applySelection, selected, selectedIds],
  );

  function removePlayer(player: PreviewPlayer, slot: Slot) {
    setAutoPick(null);
    setAutoPickError(null);
    setActiveSlot(slot);
    applySelection(selectedIds.filter((id) => id !== player.seasonPlayerId));
  }

  function applyBalancedAutoPick() {
    try {
      const result = buildBalancedPreseasonSquad(
        players.map((player) =>
          asAssessment(player, forecastedXPts(player, activeGameweek)),
        ),
      );
      setSelectionHistory((current) => [...current.slice(-19), selectedIds]);
      setSelectedIds(result.squad.players.map((player) => player.id));
      setStarterIds(result.squad.starterIds);
      setCaptainId(result.squad.captainId);
      setViceCaptainId(result.squad.viceCaptainId);
      setActiveSlot({ position: "GOALKEEPER", index: 0 });
      setAutoPick(result);
      setAutoPickError(null);
    } catch (pickError) {
      setAutoPick(null);
      setAutoPickError(
        pickError instanceof Error
          ? pickError.message
          : "Balanced auto-pick could not build a valid squad",
      );
    }
  }

  const recommendationGroups = useMemo<RecommendationGroup[]>(() => {
    const emptyGroups = POSITION_GROUPS.filter(
      (group) =>
        selected.filter((player) => player.position === group.position).length <
        group.count,
    );
    if (emptyGroups.length) {
      return POSITION_GROUPS.map((group) => {
        if (!emptyGroups.some((empty) => empty.position === group.position)) {
          return { position: group.position, recommendations: [] };
        }
        const incoming = players
          .filter(
            (player) =>
              player.position === group.position &&
              !selectedIds.includes(player.seasonPlayerId) &&
              player.estimateStatus !== "UNAVAILABLE",
          )
          .sort(
            (left, right) =>
              forecastedXPts(right, activeGameweek) -
              forecastedXPts(left, activeGameweek),
          )[0];
        return {
          position: group.position,
          recommendations: incoming
            ? [
                {
                  kind: "PICK",
                  incoming,
                  explanation: [
                    `${forecastedXPts(incoming, activeGameweek).toFixed(2)} GW${activeGameweek} xPts`,
                    `reliability ${incoming.reliability.score.toFixed(0)}`,
                    `${formatPrice(incoming.price)}`,
                  ],
                },
              ]
            : [],
        };
      });
    }
    if (!assessment || !squadInput || !assessment.validation.valid) {
      return POSITION_GROUPS.map((group) => ({
        position: group.position,
        recommendations: [],
      }));
    }
    const currentLineup = getOptimalSquadLineup(assessments);
    if (
      currentLineup.captainId == null ||
      currentLineup.viceCaptainId == null
    ) {
      return POSITION_GROUPS.map((group) => ({
        position: group.position,
        recommendations: [],
      }));
    }
    const currentAssessment = assessPreseasonSquad({
      players: assessments,
      starterIds: currentLineup.starterIds,
      benchIds: currentLineup.benchIds,
      captainId: currentLineup.captainId,
      viceCaptainId: currentLineup.viceCaptainId,
      bank: calculateBank(selectedIds, players),
    });
    const currentRating = decisionRating(currentAssessment);
    const byId = new Map(
      players.map((player) => [player.seasonPlayerId, player]),
    );
    return POSITION_GROUPS.map((group) => {
      const suggestions: Recommendation[] = [];
      for (const outgoing of selected.filter(
        (player) => player.position === group.position,
      )) {
        const alternatives = players.filter(
          (candidate) =>
            candidate.position === outgoing.position &&
            !selectedIds.includes(candidate.seasonPlayerId) &&
            candidate.estimateStatus !== "UNAVAILABLE" &&
            candidate.price <= bank + outgoing.price,
        );
        for (const incoming of alternatives) {
          const replacementIds = selectedIds.map((id) =>
            id === outgoing.seasonPlayerId ? incoming.seasonPlayerId : id,
          );
          const replacementPlayers = replacementIds
            .map((id) => byId.get(id))
            .filter((player): player is PreviewPlayer => player != null)
            .map((player) =>
              asAssessment(player, forecastedXPts(player, activeGameweek)),
            );
          const replacementLineup = getOptimalSquadLineup(replacementPlayers);
          if (
            replacementLineup.captainId == null ||
            replacementLineup.viceCaptainId == null
          ) {
            continue;
          }
          const replacementInput: SquadInput = {
            players: replacementPlayers,
            starterIds: replacementLineup.starterIds,
            benchIds: replacementLineup.benchIds,
            captainId: replacementLineup.captainId,
            viceCaptainId: replacementLineup.viceCaptainId,
            bank: bank + outgoing.price - incoming.price,
          };
          const replacement = assessPreseasonSquad(replacementInput);
          const ratingLift = decisionRating(replacement) - currentRating;
          if (replacement.validation.valid && ratingLift > 0.15) {
            const playerMetrics = {
              ...swapMetrics(outgoing, incoming),
              expectedPointsDelta:
                forecastedXPts(incoming, activeGameweek) -
                forecastedXPts(outgoing, activeGameweek),
            };
            const metrics = {
              ...playerMetrics,
              squadPotentialDelta:
                replacement.potential.total - currentAssessment.potential.total,
              squadReliabilityDelta:
                replacement.reliability.startingXI -
                currentAssessment.reliability.startingXI,
              squadResilienceDelta:
                replacement.resilience.score -
                currentAssessment.resilience.score,
            };
            suggestions.push({
              kind: "SWAP",
              incoming,
              outgoing,
              ratingLift,
              metrics,
              explanation: [],
            });
          }
        }
      }
      return {
        position: group.position,
        recommendations: suggestions
          .sort(
            (left, right) => (right.ratingLift ?? 0) - (left.ratingLift ?? 0),
          )
          .slice(0, 1),
      };
    });
  }, [
    activeGameweek,
    assessment,
    assessments,
    players,
    selected,
    selectedIds,
    squadInput,
  ]);

  const recommendations = useMemo(
    () => recommendationGroups.flatMap((group) => group.recommendations),
    [recommendationGroups],
  );
  const bestNextRecommendation = useMemo(
    () =>
      [...recommendations]
        .filter((recommendation) => recommendation.kind === "SWAP")
        .sort(
          (left, right) => (right.ratingLift ?? 0) - (left.ratingLift ?? 0),
        )[0] ?? null,
    [recommendations],
  );

  if (loading) {
    return (
      <div className="grid min-h-[32rem] place-items-center">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-3 text-sm font-bold">Preparing squad workspace</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex gap-3 border border-risk/40 bg-risk/5 p-5">
          <AlertTriangle className="size-5 shrink-0 text-risk" />
          <div>
            <p className="font-black">Squad workspace unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-5 py-5 lg:px-8 xl:flex xl:h-full xl:flex-col xl:overflow-hidden">
      <header className="shrink-0 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <h1 className="text-2xl font-black sm:text-3xl">Squad</h1>
            {assessment ? (
              <div className="flex flex-wrap items-center divide-x divide-border text-xs">
                {[
                  [
                    "Potential",
                    assessment.potential.total.toFixed(2),
                    "text-forecast",
                  ],
                  [
                    "XI reliability",
                    assessment.reliability.startingXI.toFixed(0),
                    reliabilityTone(assessment.reliability.startingXI),
                  ],
                  [
                    "Resilience",
                    assessment.resilience.score.toFixed(0),
                    reliabilityTone(assessment.resilience.score),
                  ],
                ].map(([label, value, tone]) => (
                  <div key={label} className="px-3 first:pl-0">
                    <p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                      {label}
                    </p>
                    <p
                      className={cn(
                        "fpl-data mt-0.5 text-base font-black",
                        tone,
                      )}
                    >
                      {value}
                    </p>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 px-3">
                  <Crown
                    className="size-3.5 text-forecast"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                      Captain
                    </p>
                    <p className="mt-0.5 text-sm font-black">
                      {proposedCaptain?.playerName ?? "-"}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[13rem] items-center gap-1 border border-border bg-background p-1">
              <select
                value={activeDraftId ?? ""}
                onChange={(event) =>
                  void switchDraft(Number(event.target.value))
                }
                className="h-7 min-w-0 flex-1 bg-transparent px-2 text-xs font-bold outline-none"
                aria-label="Saved squad draft"
              >
                {drafts.map((draft) => (
                  <option key={draft.id} value={draft.id}>
                    {draft.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => void createNewDraft()}
                title="Start a new saved draft"
                aria-label="Start a new saved draft"
              >
                <FilePlus2 />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setNewVariantName(
                    activeDraft
                      ? `${activeDraft.name} variant`
                      : "Squad variant",
                  );
                  setNewVariantOpen(true);
                }}
                title="Save this squad as a new variant"
                aria-label="Save this squad as a new variant"
              >
                <CopyPlus />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => void deleteActiveDraft()}
                disabled={activeDraftId == null}
                title="Delete saved draft"
                aria-label="Delete saved draft"
              >
                <Trash2 />
              </Button>
            </div>
            <span
              className={cn(
                "text-[10px] font-bold",
                saveStatus === "error"
                  ? "text-risk"
                  : saveStatus === "saving"
                    ? "text-muted-foreground"
                    : "text-fresh",
              )}
              role="status"
            >
              {saveStatus === "saving"
                ? "Saving"
                : saveStatus === "error"
                  ? "Save failed"
                  : "Saved"}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={undoLastSelection}
              disabled={selectionHistory.length === 0}
              title="Undo last squad change (Ctrl+Z)"
            >
              <Undo2 aria-hidden="true" />
              Undo
            </Button>
            <Button onClick={applyBalancedAutoPick} disabled={!players.length}>
              <Sparkles aria-hidden="true" />
              Auto-build
            </Button>
            <Badge variant="outline" className="gap-1.5 rounded-none py-1.5">
              <ShieldCheck className="size-3.5 text-fresh" />
              Preview {snapshot?.id}
            </Badge>
          </div>
        </div>
      </header>

      <Dialog open={newVariantOpen} onOpenChange={setNewVariantOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void createVariant();
            }}
          >
            <DialogHeader>
              <DialogTitle>Save squad variant</DialogTitle>
              <DialogDescription>
                Keep this version while you compare another squad idea.
              </DialogDescription>
            </DialogHeader>
            <Input
              className="mt-4"
              value={newVariantName}
              onChange={(event) => setNewVariantName(event.target.value)}
              maxLength={80}
              autoFocus
            />
            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNewVariantOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!newVariantName.trim()}>
                Save variant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={false}>
        <DialogContent className="w-[min(68rem,calc(100%-2rem))] max-w-none gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-base font-black">
                  {activeSlotPlayer?.playerName ??
                    `Choose a ${POSITION_GROUPS.find((group) => group.position === activeSlot.position)?.label.slice(0, -1)}`}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {activeSlotPlayer
                    ? `${activeSlotPlayer.team} · ${formatPrice(activeSlotPlayer.price)} · ${forecastedFiveGameweekXPts(activeSlotPlayer, gameweeks).toFixed(1)} xPts over five GWs`
                    : "Choose a player for this position."}
                </DialogDescription>
              </div>
              <span className="fpl-data pt-0.5 text-sm font-black text-forecast">
                GW{activeGameweek}
              </span>
            </div>
          </DialogHeader>
          <div className="border-b border-border p-3">
            <label className="relative block">
              <span className="sr-only">Search players</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players or teams"
                className="pl-9"
                autoFocus
              />
            </label>
          </div>
          <div className="grid grid-cols-[minmax(11rem,1fr)_3.5rem_repeat(5,4.5rem)_5rem] gap-x-2 border-b border-border bg-muted/35 px-4 py-2 text-[10px] font-black text-muted-foreground">
            <span>Player</span>
            <span className="text-right">£</span>
            {gameweeks.slice(0, 5).map((gameweek) => (
              <span key={gameweek} className="text-right">
                GW{gameweek}
              </span>
            ))}
            <span className="text-right">5 GW Δ</span>
          </div>
          <div className="max-h-[min(34rem,60vh)] divide-y divide-border overflow-y-auto">
            {candidates.map((player) => {
              const selectedPlayer = selectedIds.includes(
                player.seasonPlayerId,
              );
              const inActiveSlot =
                activeSlotPlayer?.seasonPlayerId === player.seasonPlayerId;
              const difference =
                activeSlotFiveGameweekXPts == null
                  ? null
                  : forecastedFiveGameweekXPts(player, gameweeks) -
                    activeSlotFiveGameweekXPts;
              return (
                <button
                  key={player.seasonPlayerId}
                  type="button"
                  disabled={selectedPlayer && !inActiveSlot}
                  onClick={() => choosePlayer(player)}
                  className="grid w-full grid-cols-[minmax(11rem,1fr)_3.5rem_repeat(5,4.5rem)_5rem] items-center gap-x-2 px-4 py-2.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamMark
                      shortName={player.team}
                      name={player.team}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">
                        {player.playerName}
                      </span>
                    </span>
                  </span>
                  <span className="fpl-data text-right font-bold">
                    {(player.price / 10).toFixed(1)}
                  </span>
                  {gameweeks.slice(0, 5).map((gameweek) => (
                    <span key={gameweek} className="text-right">
                      <span className="fpl-data block font-black text-forecast">
                        {forecastedXPts(player, gameweek).toFixed(1)}
                      </span>
                      <span className="block truncate text-[9px] font-bold text-muted-foreground">
                        {forecastedFixture(player, gameweek)}
                      </span>
                    </span>
                  ))}
                  <span
                    className={cn(
                      "fpl-data text-right font-black",
                      difference == null
                        ? "text-muted-foreground"
                        : difference > 0
                          ? "text-fresh"
                          : difference < 0
                            ? "text-risk"
                            : "text-muted-foreground",
                    )}
                  >
                    {difference == null ? "—" : formatSigned(difference)}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {saveError ? (
        <p className="mt-3 text-xs font-semibold text-risk" role="alert">
          {saveError}
        </p>
      ) : null}

      {activeDraft?.previewSnapshotId != null &&
      snapshot != null &&
      activeDraft.previewSnapshotId !== snapshot.id ? (
        <p className="mt-3 text-xs text-uncertainty">
          This draft was saved against an earlier preview and will be refreshed
          when you next change it.
        </p>
      ) : null}

      <div className="mt-5 grid gap-6 xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(60rem,1fr)_minmax(44rem,0.72fr)] xl:items-stretch">
        <div className="space-y-6 xl:min-h-0 xl:h-full">
          <section
            className="flex h-full flex-col border border-border bg-card"
            aria-label="Squad slots"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-3">
              <h2 className="font-black">Pitch</h2>
              <div
                className="flex flex-wrap items-center gap-1.5"
                role="tablist"
                aria-label="Gameweek"
              >
                {gameweeks.map((gameweek) => (
                  <Button
                    key={gameweek}
                    type="button"
                    variant={
                      gameweek === activeGameweek ? "default" : "outline"
                    }
                    size="sm"
                    className="h-7 min-w-12 px-2 text-[11px]"
                    onClick={() => selectGameweek(gameweek)}
                    role="tab"
                    aria-selected={gameweek === activeGameweek}
                  >
                    GW {gameweek}
                  </Button>
                ))}
                <span className="ml-2 text-[11px] font-semibold text-muted-foreground">
                  XI and captain optimise for selected GW
                </span>
              </div>
              <div className="text-right">
                <p className="fpl-data text-lg font-black">
                  {selected.length}/15
                </p>
                <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  slots filled
                </p>
              </div>
            </div>
            <div className="relative flex min-h-[39rem] flex-1 overflow-hidden bg-secondary/55 px-3 py-5 sm:px-6 sm:py-7">
              <div className="pointer-events-none absolute inset-3 border border-foreground/15" />
              <div className="pointer-events-none absolute top-1/2 right-3 left-3 border-t border-foreground/15" />
              <div className="pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/15" />
              <div className="pointer-events-none absolute top-3 left-1/2 h-12 w-28 -translate-x-1/2 border-x border-b border-foreground/15" />
              <div className="pointer-events-none absolute bottom-3 left-1/2 h-12 w-28 -translate-x-1/2 border-x border-t border-foreground/15" />
              <div className="relative z-10 flex flex-col items-start bg-transparent px-1 py-1 sm:absolute sm:top-7 sm:left-8">
                <div className="flex items-baseline gap-3 font-black text-foreground">
                  <span>Bank</span>
                  <span
                    className={cn(
                      "fpl-data text-3xl font-black 2xl:text-4xl",
                      bank < 0 && "text-risk",
                    )}
                  >
                    {formatPrice(bank)}
                  </span>
                </div>
                <span className="mt-1 text-xs font-bold text-muted-foreground 2xl:text-sm">
                  Spent{" "}
                  <strong className="fpl-data text-sm text-foreground 2xl:text-base">
                    {formatPrice(spent)}
                  </strong>{" "}
                  / £100.0
                </span>
              </div>
              <div className="relative flex h-full w-full flex-col justify-around gap-4">
                {(hasCompleteLineup ? starterSlots : PITCH_GROUPS).map(
                  (group) => {
                    const slots = hasCompleteLineup
                      ? (starterSlots.find(
                          (candidate) => candidate.position === group.position,
                        )?.slots ?? [])
                      : Array.from({ length: group.count }, (_, index) => ({
                          player: playerForSlot({
                            position: group.position,
                            index,
                          }),
                          index,
                        }));
                    return (
                      <div
                        key={group.position}
                        className="flex w-full justify-center gap-8"
                      >
                        {slots.map(({ player, index }) =>
                          renderSquadSlot(
                            { position: group.position, index },
                            player,
                          ),
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
            {hasCompleteLineup ? (
              <div className="border-t border-border bg-muted/35 px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-black tracking-[0.12em] uppercase">
                    Bench
                  </h3>
                  <span className="text-[10px] font-bold text-muted-foreground">
                    4 players
                  </span>
                </div>
                <div className="flex justify-center gap-8">
                  {benchSlots.map(({ player, index }) =>
                    renderSquadSlot(
                      { position: player.position, index },
                      player,
                    ),
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {false && assessment ? (
            <section
              className="border border-border bg-card"
              aria-label="Squad improvement suggestions"
            >
              <div className="flex items-start gap-3 border-b border-border p-4">
                <Sparkles className="mt-0.5 size-4 text-forecast" />
                <h2 className="font-black">Model ideas</h2>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-border border-b border-border sm:grid-cols-4 sm:divide-y-0">
                {POSITION_GROUPS.map((group) => {
                  const count =
                    recommendationGroups.find(
                      (item) => item.position === group.position,
                    )?.recommendations.length ?? 0;
                  return (
                    <div key={group.position} className="px-3 py-2">
                      <p className="text-[10px] font-black tracking-wide text-muted-foreground uppercase">
                        {group.shortLabel}
                      </p>
                      <p
                        className={cn(
                          "mt-1 text-[11px] font-bold",
                          count ? "text-fresh" : "text-muted-foreground",
                        )}
                      >
                        {count ? "1 model upgrade" : "No clear upgrade"}
                      </p>
                    </div>
                  );
                })}
              </div>
              {recommendations.length ? (
                <div className="grid divide-y divide-border">
                  {recommendations.map((recommendation) => {
                    const metrics = recommendation.metrics;
                    const isBestNextMove =
                      recommendation.outgoing != null &&
                      bestNextRecommendation?.incoming.seasonPlayerId ===
                        recommendation.incoming.seasonPlayerId &&
                      bestNextRecommendation.outgoing?.seasonPlayerId ===
                        recommendation.outgoing.seasonPlayerId;
                    const gains =
                      recommendation.outgoing && metrics
                        ? [
                            metrics.priceDelta < 0
                              ? `${formatPrice(Math.abs(metrics.priceDelta))} more bank`
                              : null,
                            metrics.expectedPointsDelta > 0
                              ? `${formatSigned(metrics.expectedPointsDelta)} GW${activeGameweek} xPts`
                              : null,
                            metrics.reliabilityDelta > 0
                              ? `${formatSigned(metrics.reliabilityDelta, 0)} reliability`
                              : null,
                            metrics.defconActionsDelta != null &&
                            metrics.defconActionsDelta > 0
                              ? `${formatSigned(metrics.defconActionsDelta)} DEFCON actions/90`
                              : null,
                            metrics.squadResilienceDelta > 0.05
                              ? `${formatSigned(metrics.squadResilienceDelta)} squad resilience`
                              : null,
                          ].filter((item): item is string => item != null)
                        : [];
                    const tradeOffs =
                      recommendation.outgoing && metrics
                        ? [
                            metrics.priceDelta > 0
                              ? `${formatPrice(Math.abs(metrics.priceDelta))} less bank`
                              : null,
                            metrics.expectedPointsDelta < 0
                              ? `${formatSigned(metrics.expectedPointsDelta)} GW${activeGameweek} xPts`
                              : null,
                            metrics.reliabilityDelta < 0
                              ? `${formatSigned(metrics.reliabilityDelta, 0)} reliability`
                              : null,
                            metrics.defconActionsDelta != null &&
                            metrics.defconActionsDelta < 0
                              ? `${formatSigned(metrics.defconActionsDelta)} DEFCON actions/90`
                              : null,
                            metrics.squadResilienceDelta < -0.05
                              ? `${formatSigned(metrics.squadResilienceDelta)} squad resilience`
                              : null,
                          ].filter((item): item is string => item != null)
                        : [];

                    return (
                      <button
                        key={`${recommendation.kind}-${recommendation.incoming.seasonPlayerId}-${recommendation.outgoing?.seasonPlayerId ?? "open"}`}
                        type="button"
                        onClick={() => {
                          const targetSlot = recommendation.outgoing
                            ? {
                                position: recommendation.outgoing.position,
                                index: selected
                                  .filter(
                                    (player) =>
                                      player.position ===
                                      recommendation.outgoing?.position,
                                  )
                                  .findIndex(
                                    (player) =>
                                      player.seasonPlayerId ===
                                      recommendation.outgoing?.seasonPlayerId,
                                  ),
                              }
                            : (() => {
                                const filled = selected.filter(
                                  (player) =>
                                    player.position ===
                                    recommendation.incoming.position,
                                ).length;
                                return {
                                  position: recommendation.incoming.position,
                                  index: filled,
                                };
                              })();
                          setActiveSlot(targetSlot);
                          choosePlayer(recommendation.incoming, targetSlot);
                        }}
                        className="w-full px-4 py-3 text-left transition-colors hover:bg-muted"
                      >
                        {recommendation.outgoing && metrics ? (
                          <span className="block">
                            {isBestNextMove ? (
                              <span className="mb-2 inline-flex rounded bg-forecast/10 px-2 py-1 text-[9px] font-black tracking-wider text-forecast uppercase">
                                Best next move · full-squad result
                              </span>
                            ) : null}
                            <span className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
                              <span className="rounded border border-risk/25 bg-risk/5 px-3 py-2">
                                <span className="block text-[9px] font-black tracking-wider text-risk uppercase">
                                  Out
                                </span>
                                <span className="mt-0.5 block truncate text-xs font-black">
                                  {recommendation.outgoing.playerName}
                                </span>
                                <span className="mt-1 block text-[10px] text-muted-foreground">
                                  {formatPrice(recommendation.outgoing.price)} ·{" "}
                                  {forecastedXPts(
                                    recommendation.outgoing,
                                    activeGameweek,
                                  ).toFixed(1)}{" "}
                                  xPts · R
                                  {recommendation.outgoing.reliability.score.toFixed(
                                    0,
                                  )}
                                </span>
                              </span>
                              <ArrowRight
                                className="mx-auto size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                              <span className="rounded border border-fresh/25 bg-fresh/5 px-3 py-2">
                                <span className="block text-[9px] font-black tracking-wider text-fresh uppercase">
                                  In
                                </span>
                                <span className="mt-0.5 block truncate text-xs font-black">
                                  {recommendation.incoming.playerName}
                                </span>
                                <span className="mt-1 block text-[10px] text-muted-foreground">
                                  {formatPrice(recommendation.incoming.price)} ·{" "}
                                  {forecastedXPts(
                                    recommendation.incoming,
                                    activeGameweek,
                                  ).toFixed(1)}{" "}
                                  xPts · R
                                  {recommendation.incoming.reliability.score.toFixed(
                                    0,
                                  )}
                                </span>
                              </span>
                            </span>
                            <span className="mt-3 grid gap-2 sm:grid-cols-2">
                              <span className="rounded border border-fresh/20 bg-fresh/5 px-3 py-2">
                                <span className="block text-[9px] font-black tracking-wider text-fresh uppercase">
                                  What you gain
                                </span>
                                <span className="mt-1 block text-[11px] leading-4 text-foreground">
                                  {gains.length
                                    ? gains.join(" · ")
                                    : "No material direct gain"}
                                </span>
                              </span>
                              <span className="rounded border border-risk/20 bg-risk/5 px-3 py-2">
                                <span className="block text-[9px] font-black tracking-wider text-risk uppercase">
                                  What you give up
                                </span>
                                <span className="mt-1 block text-[11px] leading-4 text-foreground">
                                  {tradeOffs.length
                                    ? tradeOffs.join(" · ")
                                    : "No material direct trade-off"}
                                </span>
                              </span>
                            </span>
                            <span className="mt-2 block rounded bg-muted px-3 py-2 text-[10px] leading-4 text-muted-foreground">
                              <span className="font-black text-foreground">
                                Whole-squad effect:
                              </span>{" "}
                              potential{" "}
                              {formatSigned(metrics.squadPotentialDelta)} · XI
                              reliability{" "}
                              {formatSigned(metrics.squadReliabilityDelta, 0)} ·
                              resilience{" "}
                              {formatSigned(metrics.squadResilienceDelta)}. The
                              comparison score changes by{" "}
                              {formatSigned(recommendation.ratingLift ?? 0)}; it
                              is not xPts.
                            </span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-3">
                            <span className="grid size-7 shrink-0 place-items-center border border-forecast/40 bg-forecast/8 text-[10px] font-black text-forecast">
                              {
                                POSITION_GROUPS.find(
                                  (group) =>
                                    group.position ===
                                    recommendation.incoming.position,
                                )?.shortLabel
                              }
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-black">
                                Add {recommendation.incoming.playerName}
                              </span>
                              <span className="block text-[10px] text-muted-foreground">
                                {recommendation.incoming.team} ·{" "}
                                {formatPrice(recommendation.incoming.price)} · R{" "}
                                {recommendation.incoming.reliability.score.toFixed(
                                  0,
                                )}
                              </span>
                            </span>
                            <span className="flex flex-wrap gap-1 text-[10px] font-semibold text-muted-foreground">
                              {recommendation.explanation.map((reason) => (
                                <span
                                  key={reason}
                                  className="rounded bg-muted px-1.5 py-0.5"
                                >
                                  {reason}
                                </span>
                              ))}
                            </span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  {selected.length === 15
                    ? "Complete a valid squad and starting XI to unlock model-rated swaps."
                    : "Fill a slot to see the strongest available fits for the remaining positions."}
                </p>
              )}
              <p className="border-t border-border px-4 py-2 text-[10px] leading-4 text-muted-foreground">
                Rating combines potential, XI reliability and resilience. It is
                a comparison aid, not a prediction of final rank.
              </p>
            </section>
          ) : null}
        </div>

        <aside
          className="xl:min-h-0 xl:h-full"
          aria-label="Player forecast table"
        >
          <section className="flex h-full min-h-0 flex-col overflow-hidden border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="font-black">
                  {isPlayerSelectionMode
                    ? `Choose a ${POSITION_GROUPS.find((group) => group.position === activeSlot.position)?.label.slice(0, -1)}`
                    : "Players"}
                </h2>
                <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">
                  {isPlayerSelectionMode
                    ? activeSlotPlayer
                      ? `Replace ${activeSlotPlayer.playerName}`
                      : "Choose a player for this slot"
                    : "Five-gameweek forecast"}
                </p>
              </div>
              {isPlayerSelectionMode ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setIsPlayerSelectionMode(false);
                    setQuery("");
                  }}
                  aria-label="Close player selection"
                  title="Close player selection"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <span className="fpl-data text-sm font-black text-forecast">
                  {forecastTablePlayers.length}
                </span>
              )}
            </div>
            <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_9rem_9rem] gap-2 border-b border-border p-3">
              <label className="relative min-w-0">
                <span className="sr-only">Search players</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search players"
                  className="w-full pl-9"
                />
              </label>
              {isPlayerSelectionMode ? (
                <div className="flex h-8 items-center border border-input px-2.5 text-xs font-bold">
                  {
                    POSITION_GROUPS.find(
                      (group) => group.position === activeSlot.position,
                    )?.label
                  }
                </div>
              ) : (
                <Select
                  value={positionFilter}
                  onValueChange={(value) =>
                    setPositionFilter(value as Position | "ALL")
                  }
                >
                  <SelectTrigger
                    aria-label="Filter by position"
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All positions</SelectItem>
                    {POSITION_GROUPS.map((group) => (
                      <SelectItem key={group.position} value={group.position}>
                        {group.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger aria-label="Filter by team" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All teams</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team} value={team}>
                      {team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid shrink-0 grid-cols-[minmax(10rem,1fr)_3.25rem_repeat(5,3.25rem)_4rem] gap-x-1 border-b border-border bg-muted/35 px-3 py-2 text-[10px] font-black text-muted-foreground">
              <span>Player</span>
              <span className="text-right">£</span>
              {displayedGameweeks.map((gameweek) => (
                <span key={gameweek} className="text-center">
                  GW{gameweek}
                </span>
              ))}
              <span className="text-center">
                {isPlayerSelectionMode ? "5 GW Δ" : "5 GW"}
              </span>
            </div>
            <div
              ref={forecastTableScrollRef}
              className="min-h-0 flex-1 overflow-auto"
            >
              <div
                className="relative min-w-[38rem]"
                style={{
                  height: `${forecastTableVirtualizer.getTotalSize()}px`,
                }}
              >
                {forecastTableVirtualizer
                  .getVirtualItems()
                  .map((virtualRow) => {
                    const player = forecastTablePlayers[virtualRow.index];
                    return (
                      <SquadForecastTableRow
                        key={player.seasonPlayerId}
                        player={player}
                        start={virtualRow.start}
                        displayedGameweeks={displayedGameweeks}
                        gameweeks={gameweeks}
                        ranges={forecastTableRanges}
                        activeSlotFiveGameweekXPts={activeSlotFiveGameweekXPts}
                        isPlayerSelectionMode={isPlayerSelectionMode}
                        selected={selectedIds.includes(player.seasonPlayerId)}
                        inActiveSlot={
                          activeSlotPlayer?.seasonPlayerId ===
                          player.seasonPlayerId
                        }
                        onChoosePlayer={choosePlayer}
                      />
                    );
                  })}
              </div>
            </div>
          </section>

          {false && (
            <section className="flex flex-col border border-border bg-card xl:h-full">
              <div className="border-b border-border p-4">
                <p className="text-[10px] font-black tracking-[0.16em] text-primary uppercase">
                  Slot {activeSlot.index + 1}
                </p>
                <h2 className="mt-1 font-black">
                  Choose a{" "}
                  {POSITION_GROUPS.find(
                    (group) => group.position === activeSlot.position,
                  )?.label.slice(0, -1)}
                </h2>
              </div>
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search player or team"
                    className="pl-9"
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Select
                    value={activeSlot.position}
                    onValueChange={(value) => selectPosition(value as Position)}
                  >
                    <SelectTrigger
                      aria-label="Filter by position"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITION_GROUPS.map((group) => (
                        <SelectItem key={group.position} value={group.position}>
                          {group.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={teamFilter} onValueChange={setTeamFilter}>
                    <SelectTrigger
                      aria-label="Filter by team"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All teams</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team} value={team}>
                          {team}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <label className="relative">
                    <span className="sr-only">Minimum price</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={minimumPrice}
                      onChange={(event) => setMinimumPrice(event.target.value)}
                      placeholder="Min £"
                    />
                  </label>
                  <label className="relative">
                    <span className="sr-only">Maximum price</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={maximumPrice}
                      onChange={(event) => setMaximumPrice(event.target.value)}
                      placeholder="Max £"
                    />
                  </label>
                </div>
              </div>
              <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {candidates.map((player) => {
                  const selectedPlayer = selectedIds.includes(
                    player.seasonPlayerId,
                  );
                  const inActiveSlot =
                    playerForSlot(activeSlot)?.seasonPlayerId ===
                    player.seasonPlayerId;
                  return (
                    <button
                      key={player.seasonPlayerId}
                      type="button"
                      disabled={selectedPlayer && !inActiveSlot}
                      onClick={() => choosePlayer(player)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="border border-border bg-muted px-1.5 py-0.5 text-[10px] font-black">
                            {player.position.slice(0, 3)}
                          </span>
                          <TeamMark
                            shortName={player.team}
                            name={player.team}
                            size="md"
                          />
                          <span className="truncate text-sm font-black">
                            {player.playerName}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="font-bold text-foreground">
                            {player.team}
                          </span>
                          <span>
                            {forecastedFixture(player, activeGameweek)}
                          </span>
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block fpl-data text-base font-black text-foreground">
                          {formatPrice(player.price)}
                        </span>
                        <span className="mt-0.5 block fpl-data text-sm font-black text-forecast">
                          {forecastedXPts(player, activeGameweek).toFixed(2)}
                        </span>
                        <span
                          className={cn(
                            "block text-[10px] font-bold",
                            reliabilityTone(player.reliability.score),
                          )}
                        >
                          R {player.reliability.score.toFixed(0)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {false && assessment ? (
            <section className="border border-border bg-card">
              <div className="flex items-start gap-3 border-b border-border p-4">
                <Crown className="mt-0.5 size-4 text-forecast" />
                <div>
                  <h2 className="font-black">Decision scorecard</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    XI and captaincy are recalculated when a complete squad
                    changes.
                  </p>
                </div>
              </div>
              {!assessment ? (
                <div className="p-4 text-sm text-muted-foreground">
                  Fill all 15 slots to inspect potential, reliability and
                  resilience.
                </div>
              ) : (
                <div>
                  <div className="grid grid-cols-3 border-b border-border">
                    {[
                      [
                        "Potential",
                        assessment!.potential.total.toFixed(2),
                        "text-forecast",
                      ],
                      [
                        "XI reliability",
                        assessment!.reliability.startingXI.toFixed(0),
                        reliabilityTone(assessment!.reliability.startingXI),
                      ],
                      [
                        "Resilience",
                        assessment!.resilience.score.toFixed(0),
                        reliabilityTone(assessment!.resilience.score),
                      ],
                    ].map(([label, value, tone]) => (
                      <div
                        key={label}
                        className="border-r border-border p-3 last:border-r-0"
                      >
                        <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                          {label}
                        </p>
                        <p
                          className={cn(
                            "fpl-data mt-1 text-xl font-black",
                            tone,
                          )}
                        >
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div
                    className={cn(
                      "border-t border-border px-4 py-3 text-xs font-bold",
                      assessment!.verdict === "VIABLE"
                        ? "bg-fresh/8 text-fresh"
                        : assessment!.verdict === "REVIEW"
                          ? "bg-uncertainty/10 text-uncertainty"
                          : "bg-risk/8 text-risk",
                    )}
                  >
                    {assessment!.verdict === "VIABLE" ? (
                      <Check className="mr-1.5 inline size-3.5" />
                    ) : (
                      <AlertTriangle className="mr-1.5 inline size-3.5" />
                    )}
                    {assessment!.verdict}:{" "}
                    {assessment!.concerns.length
                      ? assessment!.concerns.join(" · ")
                      : "structure passes the current preseason policy"}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {autoPickError ? (
            <div className="border border-risk/40 bg-risk/5 p-3 text-xs text-risk">
              {autoPickError}
            </div>
          ) : null}

          {autoPick && false ? (
            <section className="border border-forecast/30 bg-forecast/5">
              <div className="border-b border-forecast/20 px-4 py-3">
                <p className="text-[10px] font-black tracking-[0.14em] text-forecast uppercase">
                  Balanced auto-build
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  A whole-squad solution under the FPL budget and team limits,
                  not a list of individual stars.
                </p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-y divide-border text-xs">
                <div className="p-3">
                  <p className="text-muted-foreground">Spend / bank</p>
                  <p className="fpl-data mt-1 font-black">
                    {formatPrice(autoPick!.spent)} /{" "}
                    {formatPrice(autoPick!.bank)}
                  </p>
                </div>
                <div className="p-3">
                  <p className="text-muted-foreground">Captain bonus</p>
                  <p className="fpl-data mt-1 font-black text-forecast">
                    +{autoPick!.captainBonus.toFixed(2)} xPts
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                {autoPick!.rationale.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
