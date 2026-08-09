"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
}

interface PreviewResponse {
  season: { code: string };
  snapshot: { id: number; fetchedAt: string };
  preview: { methodology: string; projections: PreviewPlayer[] };
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

function asAssessment(player: PreviewPlayer): PreseasonPlayerAssessment {
  return {
    id: player.seasonPlayerId,
    team: player.team,
    position: player.position,
    price: player.price,
    projectedPoints: player.totalXPts,
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

const PITCH_GROUPS = [...POSITION_GROUPS].reverse();

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

function emptyDraftState(): SquadDraftState {
  return {
    playerIds: [],
    starterIds: [],
    captainId: null,
    viceCaptainId: null,
    bank: 0,
  };
}

function reliabilityTone(score: number) {
  if (score >= 75) return "text-fresh";
  if (score >= 60) return "text-uncertainty";
  return "text-risk";
}

function defaultStartingIds(players: PreseasonPlayerAssessment[]) {
  const byPosition = (position: Position) =>
    players
      .filter((player) => player.position === position)
      .sort(
        (left, right) =>
          right.projectedPoints +
          right.reliability.score / 100 -
          (left.projectedPoints + left.reliability.score / 100),
      );
  const locked = [
    ...byPosition("GOALKEEPER").slice(0, 1),
    ...byPosition("DEFENDER").slice(0, 3),
    ...byPosition("MIDFIELDER").slice(0, 4),
    ...byPosition("FORWARD").slice(0, 1),
  ];
  const lockedIds = new Set(locked.map((player) => player.id));
  return [
    ...locked,
    ...players
      .filter((player) => !lockedIds.has(player.id))
      .sort(
        (left, right) =>
          right.projectedPoints +
          right.reliability.score / 100 -
          (left.projectedPoints + left.reliability.score / 100),
      )
      .slice(0, 2),
  ].map((player) => player.id);
}

function defaultLineup(players: PreseasonPlayerAssessment[]) {
  const starterIds = defaultStartingIds(players);
  const benchIds = players
    .filter((player) => !starterIds.includes(player.id))
    .map((player) => player.id);
  const captaincy = starterIds
    .map((id) => players.find((player) => player.id === id))
    .filter((player): player is PreseasonPlayerAssessment => player != null)
    .sort((left, right) => right.projectedPoints - left.projectedPoints);

  return {
    starterIds,
    benchIds,
    captainId: captaincy[0]?.id ?? null,
    viceCaptainId: captaincy[1]?.id ?? null,
  };
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
  const [methodology, setMethodology] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("ALL");
  const [minimumPrice, setMinimumPrice] = useState("");
  const [maximumPrice, setMaximumPrice] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [starterIds, setStarterIds] = useState<number[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null);
  const [bank, setBank] = useState(0);
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
  const [activeSlot, setActiveSlot] = useState<Slot>({
    position: "GOALKEEPER",
    index: 0,
  });
  const draftState = useMemo<SquadDraftState>(
    () => ({
      playerIds: selectedIds,
      starterIds,
      captainId,
      viceCaptainId,
      bank,
    }),
    [bank, captainId, selectedIds, starterIds, viceCaptainId],
  );
  const restoreDraft = useCallback(
    (draft: SquadDraft, playerPool: PreviewPlayer[]) => {
      const availableIds = new Set(
        playerPool.map((player) => player.seasonPlayerId),
      );
      const playerIds = draft.state.playerIds.filter((id) =>
        availableIds.has(id),
      );
      const selectedSet = new Set(playerIds);
      const nextStarterIds = draft.state.starterIds.filter((id) =>
        selectedSet.has(id),
      );
      setSelectedIds(playerIds);
      setStarterIds(nextStarterIds);
      setCaptainId(
        draft.state.captainId != null &&
          nextStarterIds.includes(draft.state.captainId)
          ? draft.state.captainId
          : null,
      );
      setViceCaptainId(
        draft.state.viceCaptainId != null &&
          nextStarterIds.includes(draft.state.viceCaptainId)
          ? draft.state.viceCaptainId
          : null,
      );
      setBank(draft.state.bank);
      setAutoPick(null);
      setAutoPickError(null);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    async function loadPreview() {
      try {
        const [previewResponse, draftsResponse] = await Promise.all([
          fetch("/api/preseason-squad?season=2026/27"),
          fetch("/api/preseason-squad-drafts?season=2026/27"),
        ]);
        const payload = (await previewResponse.json()) as
          | PreviewResponse
          | { error: string };
        const draftsPayload = (await draftsResponse.json()) as
          | DraftsResponse
          | { error: string };
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
              name: "GW1 draft",
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
        if (!active) return;
        setPlayers(payload.preview.projections);
        setSnapshot(payload.snapshot);
        setMethodology(payload.preview.methodology);
        setDrafts(loadedDrafts);
        setActiveDraftId(loadedDrafts[0].id);
        restoreDraft(loadedDrafts[0], payload.preview.projections);
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
  const assessments = useMemo(() => selected.map(asAssessment), [selected]);
  const benchIds = useMemo(
    () => selectedIds.filter((id) => !starterIds.includes(id)),
    [selectedIds, starterIds],
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
            bank,
          }
        : null,
    [
      assessments,
      bank,
      benchIds,
      captainId,
      selected.length,
      starterIds,
      viceCaptainId,
    ],
  );
  const assessment = useMemo(
    () => (squadInput ? assessPreseasonSquad(squadInput) : null),
    [squadInput],
  );
  const activeDraft = useMemo(
    () => drafts.find((draft) => draft.id === activeDraftId) ?? null,
    [activeDraftId, drafts],
  );
  const spent = selected.reduce((sum, player) => sum + player.price, 0);
  const remaining = 1000 - spent - bank;

  const playerForSlot = (slot: Slot) =>
    selected.filter((player) => player.position === slot.position)[slot.index];

  const candidates = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const minimum = Number(minimumPrice);
    const maximum = Number(maximumPrice);
    return players
      .filter(
        (player) =>
          player.position === activeSlot.position &&
          (teamFilter === "ALL" || player.team === teamFilter) &&
          (!minimumPrice || player.price >= minimum * 10) &&
          (!maximumPrice || player.price <= maximum * 10) &&
          (!normalized ||
            player.playerName.toLocaleLowerCase().includes(normalized) ||
            player.team.toLocaleLowerCase().includes(normalized)),
      )
      .sort(
        (left, right) =>
          right.totalXPts - left.totalXPts ||
          right.reliability.score - left.reliability.score,
      )
      .slice(0, 80);
  }, [
    activeSlot.position,
    maximumPrice,
    minimumPrice,
    players,
    query,
    teamFilter,
  ]);

  const teams = useMemo(
    () => Array.from(new Set(players.map((player) => player.team))).sort(),
    [players],
  );

  function selectPosition(position: Position) {
    const group = POSITION_GROUPS.find((item) => item.position === position);
    if (!group) return;
    const used = selected.filter(
      (player) => player.position === position,
    ).length;
    setActiveSlot({ position, index: Math.min(used, group.count - 1) });
  }

  function applySelection(nextIds: number[]) {
    setSelectedIds(nextIds);
    if (nextIds.length !== 15) {
      setStarterIds([]);
      setCaptainId(null);
      setViceCaptainId(null);
      return;
    }
    const nextPlayers = nextIds
      .map((id) => players.find((player) => player.seasonPlayerId === id))
      .filter((player): player is PreviewPlayer => player != null)
      .map(asAssessment);
    const lineup = defaultLineup(nextPlayers);
    setStarterIds(lineup.starterIds);
    setCaptainId(lineup.captainId);
    setViceCaptainId(lineup.viceCaptainId);
  }

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
    const draft = await createDraft("GW1 draft", emptyDraftState());
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

  function choosePlayer(player: PreviewPlayer, slot = activeSlot) {
    setAutoPick(null);
    setAutoPickError(null);
    const current = playerForSlot(slot);
    const withoutCurrent = current
      ? selectedIds.filter((id) => id !== current.seasonPlayerId)
      : selectedIds;
    const nextIds = withoutCurrent.includes(player.seasonPlayerId)
      ? withoutCurrent
      : [...withoutCurrent, player.seasonPlayerId];
    applySelection(nextIds);
  }

  function applyBalancedAutoPick() {
    try {
      const result = buildBalancedPreseasonSquad(players.map(asAssessment));
      setSelectedIds(result.squad.players.map((player) => player.id));
      setStarterIds(result.squad.starterIds);
      setCaptainId(result.squad.captainId);
      setViceCaptainId(result.squad.viceCaptainId);
      setBank(result.bank);
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
              right.totalXPts +
              right.reliability.score / 100 -
              (left.totalXPts + left.reliability.score / 100),
          )[0];
        return {
          position: group.position,
          recommendations: incoming
            ? [
                {
                  kind: "PICK",
                  incoming,
                  explanation: [
                    `${incoming.totalXPts.toFixed(2)} GW1 xPts`,
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
    const currentLineup = defaultLineup(assessments);
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
      ...currentLineup,
      bank,
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
            .map(asAssessment);
          const replacementLineup = defaultLineup(replacementPlayers);
          if (
            replacementLineup.captainId == null ||
            replacementLineup.viceCaptainId == null
          ) {
            continue;
          }
          const replacementInput: SquadInput = {
            players: replacementPlayers,
            ...replacementLineup,
            bank: bank + outgoing.price - incoming.price,
          };
          const replacement = assessPreseasonSquad(replacementInput);
          const ratingLift = decisionRating(replacement) - currentRating;
          if (replacement.validation.valid && ratingLift > 0.15) {
            const playerMetrics = swapMetrics(outgoing, incoming);
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
    assessment,
    assessments,
    bank,
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
          <p className="mt-3 text-sm font-bold">Preparing GW1 decision space</p>
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
            <p className="font-black">GW1 Builder unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[110rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black tracking-[0.16em] text-primary uppercase">
              GW1 squad builder · Pre-season research
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              Build a team you can explain.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              Fill each squad slot, then use the model&apos;s improvement ideas
              to challenge the draft. This does not submit or change an FPL
              team.
            </p>
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
                    activeDraft ? `${activeDraft.name} variant` : "GW1 variant",
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
            <Button onClick={applyBalancedAutoPick} disabled={!players.length}>
              <Sparkles aria-hidden="true" />
              Auto-build balanced squad
            </Button>
            <Badge variant="outline" className="gap-1.5 rounded-none py-1.5">
              <ShieldCheck className="size-3.5 text-fresh" />
              Internal preview · snapshot {snapshot?.id}
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
                Keep this version while you compare another GW1 idea.
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

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.55fr)]">
        <div className="space-y-6">
          <section
            className="border border-border bg-card"
            aria-label="Squad slots"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-4">
              <div>
                <h2 className="font-black">Squad board</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  15 fixed FPL slots. Select one, then choose a player from the
                  matching position.
                </p>
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
            <div className="relative overflow-hidden bg-secondary/55 px-3 py-5 sm:px-6 sm:py-7">
              <div className="pointer-events-none absolute inset-3 border border-foreground/15" />
              <div className="pointer-events-none absolute top-1/2 right-3 left-3 border-t border-foreground/15" />
              <div className="pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/15" />
              <div className="pointer-events-none absolute top-3 left-1/2 h-12 w-28 -translate-x-1/2 border-x border-b border-foreground/15" />
              <div className="pointer-events-none absolute bottom-3 left-1/2 h-12 w-28 -translate-x-1/2 border-x border-t border-foreground/15" />
              <div className="relative flex min-h-[31rem] flex-col justify-around gap-4">
                {PITCH_GROUPS.map((group) => (
                  <div key={group.position} className="contents">
                    <div className="sr-only">
                      <h3 className="text-xs font-black tracking-wide uppercase">
                        {group.label}
                      </h3>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {
                          selected.filter(
                            (player) => player.position === group.position,
                          ).length
                        }
                        /{group.count}
                      </span>
                    </div>
                    <div className="flex w-full justify-center gap-8">
                      {Array.from({ length: group.count }, (_, index) => {
                        const slot = { position: group.position, index };
                        const player = playerForSlot(slot);
                        const selectedSlot =
                          slotId(activeSlot) === slotId(slot);
                        return (
                          <button
                            key={slotId(slot)}
                            type="button"
                            onClick={() => setActiveSlot(slot)}
                            className={cn(
                              "flex h-19 w-17 shrink-0 flex-col items-center justify-center border px-1 text-center transition-colors",
                              selectedSlot
                                ? "border-primary bg-primary/12 shadow-[0_0_0_1px_var(--primary)]"
                                : "border-foreground/20 bg-card/90 hover:bg-card",
                            )}
                            aria-label={
                              player
                                ? `${player.playerName}, ${player.team}, ${formatPrice(player.price)}`
                                : `Add ${group.label.slice(0, -1)} slot ${index + 1}`
                            }
                            aria-pressed={selectedSlot}
                          >
                            <span className="sr-only">{group.shortLabel}</span>
                            {player ? (
                              <span className="min-w-0">
                                <span
                                  className="mx-auto grid h-8 w-10 place-items-center border border-white/45 text-[10px] font-black text-white shadow-sm"
                                  style={{
                                    backgroundColor: kitTone(player.team),
                                    clipPath:
                                      "polygon(19% 0, 34% 0, 41% 14%, 59% 14%, 66% 0, 81% 0, 100% 28%, 82% 43%, 78% 100%, 22% 100%, 18% 43%, 0 28%)",
                                  }}
                                >
                                  {player.team.slice(0, 1)}
                                </span>
                                <span className="mt-1 block truncate text-[10px] font-black sm:text-xs">
                                  {player.playerName}
                                </span>
                                <span className="block text-[9px] text-muted-foreground">
                                  {player.team} · {formatPrice(player.price)} ·
                                  R {player.reliability.score.toFixed(0)}
                                </span>
                              </span>
                            ) : (
                              <span className="sr-only">
                                Add {group.shortLabel}
                              </span>
                            )}
                            {player ? (
                              <span className="sr-only">Change</span>
                            ) : (
                              <Plus className="size-5 text-muted-foreground" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3 text-xs">
              <span>Spend {formatPrice(spent)}</span>
              <label
                className="flex items-center gap-2 font-bold"
                htmlFor="bank"
              >
                Bank £
                <Input
                  id="bank"
                  type="number"
                  min="0"
                  step="0.1"
                  value={(bank / 10).toFixed(1)}
                  onChange={(event) =>
                    setBank(
                      Math.max(
                        0,
                        Math.round(Number(event.target.value || 0) * 10),
                      ),
                    )
                  }
                  className="h-7 w-20 text-right"
                />
              </label>
              <span
                className={
                  remaining < 0
                    ? "font-bold text-risk"
                    : "text-muted-foreground"
                }
              >
                Remaining {formatPrice(Math.max(0, remaining))}
              </span>
            </div>
          </section>

          <section
            className="border border-border bg-card"
            aria-label="Squad improvement suggestions"
          >
            <div className="flex items-start gap-3 border-b border-border p-4">
              <Sparkles className="mt-0.5 size-4 text-forecast" />
              <div>
                <h2 className="font-black">Improve this draft</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {selected.length < 15
                    ? "Best available fits for positions you still need."
                    : "Every legal same-position swap is re-scored against the full current squad, bank and team limits. The best next move is marked."}
                </p>
              </div>
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
                            ? `${formatSigned(metrics.expectedPointsDelta)} GW1 xPts`
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
                            ? `${formatSigned(metrics.expectedPointsDelta)} GW1 xPts`
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
                                {recommendation.outgoing.totalXPts.toFixed(1)}{" "}
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
                                {recommendation.incoming.totalXPts.toFixed(1)}{" "}
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
              Rating combines potential, XI reliability and resilience. It is a
              comparison aid, not a prediction of final rank.
            </p>
          </section>
        </div>

        <aside className="space-y-4" aria-label="Player picker and scorecard">
          <section className="border border-border bg-card">
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
              <p className="mt-1 text-xs text-muted-foreground">
                Only matching players are shown for the selected slot.
              </p>
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
            <div className="max-h-[38rem] divide-y divide-border overflow-y-auto">
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
                          {player.fixtures[0]
                            ? `${player.fixtures[0].isHome ? "H" : "A"} ${player.fixtures[0].opponent}`
                            : "—"}
                        </span>
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block fpl-data text-base font-black text-foreground">
                        {formatPrice(player.price)}
                      </span>
                      <span className="mt-0.5 block fpl-data text-sm font-black text-forecast">
                        {player.totalXPts.toFixed(2)}
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
                    <div
                      key={label}
                      className="border-r border-border p-3 last:border-r-0"
                    >
                      <p className="text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                        {label}
                      </p>
                      <p
                        className={cn("fpl-data mt-1 text-xl font-black", tone)}
                      >
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
                <div
                  className={cn(
                    "border-t border-border px-4 py-3 text-xs font-bold",
                    assessment.verdict === "VIABLE"
                      ? "bg-fresh/8 text-fresh"
                      : assessment.verdict === "REVIEW"
                        ? "bg-uncertainty/10 text-uncertainty"
                        : "bg-risk/8 text-risk",
                  )}
                >
                  {assessment.verdict === "VIABLE" ? (
                    <Check className="mr-1.5 inline size-3.5" />
                  ) : (
                    <AlertTriangle className="mr-1.5 inline size-3.5" />
                  )}
                  {assessment.verdict}:{" "}
                  {assessment.concerns.length
                    ? assessment.concerns.join(" · ")
                    : "structure passes the current preseason policy"}
                </div>
              </div>
            )}
          </section>

          {autoPickError ? (
            <div className="border border-risk/40 bg-risk/5 p-3 text-xs text-risk">
              {autoPickError}
            </div>
          ) : null}

          {autoPick ? (
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
                    {formatPrice(autoPick.spent)} / {formatPrice(autoPick.bank)}
                  </p>
                </div>
                <div className="p-3">
                  <p className="text-muted-foreground">Captain bonus</p>
                  <p className="fpl-data mt-1 font-black text-forecast">
                    +{autoPick.captainBonus.toFixed(2)} xPts
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                {autoPick.rationale.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="border-l-2 border-uncertainty bg-uncertainty/5 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
            {methodology}
          </p>
        </aside>
      </div>
    </div>
  );
}
