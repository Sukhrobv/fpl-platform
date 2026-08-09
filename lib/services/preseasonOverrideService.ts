import type { PreseasonOverride, PreseasonOverrideKind } from "@prisma/client";

export interface PreseasonOverrideInput {
  kind: PreseasonOverrideKind;
  availabilityCap: number | null;
  startProbabilityCap: number | null;
  expectedMinutesCap: number | null;
  appliesThroughGameweek: number;
  note: string;
  sourceUrl: string | null;
}

export interface AppliedPreseasonOverride {
  id: number;
  kind: PreseasonOverrideKind;
  availabilityCap: number | null;
  startProbabilityCap: number | null;
  expectedMinutesCap: number | null;
  appliesThroughGameweek: number;
  note: string;
  sourceUrl: string | null;
}

export function isActiveForGameweek(
  override: Pick<PreseasonOverride, "active" | "appliesThroughGameweek">,
  gameweek: number,
) {
  return override.active && gameweek <= override.appliesThroughGameweek;
}

/**
 * Manual preseason evidence may only cap uncertain availability, starts or
 * minutes. CONFIRMED_STARTER is stored and shown as provenance, but deliberately
 * cannot manufacture a positive xPts increase over the historical prior.
 */
export function normalizePreseasonOverride(
  input: PreseasonOverrideInput,
): PreseasonOverrideInput {
  const availabilityCap =
    input.kind === "UNAVAILABLE" ? 0 : input.availabilityCap;
  return {
    ...input,
    availabilityCap,
    note: input.note.trim(),
    sourceUrl: input.sourceUrl?.trim() || null,
  };
}

export function toAppliedPreseasonOverride(
  override: PreseasonOverride,
): AppliedPreseasonOverride {
  return {
    id: override.id,
    kind: override.kind,
    availabilityCap: override.availabilityCap,
    startProbabilityCap: override.startProbabilityCap,
    expectedMinutesCap: override.expectedMinutesCap,
    appliesThroughGameweek: override.appliesThroughGameweek,
    note: override.note,
    sourceUrl: override.sourceUrl,
  };
}
