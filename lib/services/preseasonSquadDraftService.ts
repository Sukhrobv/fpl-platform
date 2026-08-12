import { z } from "zod";

export const DEFAULT_PRESEASON_DRAFT_NAME = "GW1 draft";

const playerIdSchema = z.number().int().positive();

function unique(ids: number[]) {
  return new Set(ids).size === ids.length;
}

export const preseasonSquadDraftStateSchema = z
  .object({
    playerIds: z.array(playerIdSchema).max(15),
    starterIds: z.array(playerIdSchema).max(11),
    captainId: playerIdSchema.nullable(),
    viceCaptainId: playerIdSchema.nullable(),
    bank: z.number().int().min(-2000).max(1000),
  })
  .superRefine((state, context) => {
    if (!unique(state.playerIds)) {
      context.addIssue({
        code: "custom",
        path: ["playerIds"],
        message: "Players must be unique",
      });
    }
    if (!unique(state.starterIds)) {
      context.addIssue({
        code: "custom",
        path: ["starterIds"],
        message: "Starters must be unique",
      });
    }
    const selected = new Set(state.playerIds);
    if (state.starterIds.some((id) => !selected.has(id))) {
      context.addIssue({
        code: "custom",
        path: ["starterIds"],
        message: "Starters must be selected players",
      });
    }
    if (
      state.captainId != null &&
      !state.starterIds.includes(state.captainId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["captainId"],
        message: "Captain must be in the starting XI",
      });
    }
    if (
      state.viceCaptainId != null &&
      !state.starterIds.includes(state.viceCaptainId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["viceCaptainId"],
        message: "Vice-captain must be in the starting XI",
      });
    }
    if (state.captainId != null && state.captainId === state.viceCaptainId) {
      context.addIssue({
        code: "custom",
        path: ["viceCaptainId"],
        message: "Captain and vice-captain must differ",
      });
    }
  });

export type PreseasonSquadDraftState = z.infer<
  typeof preseasonSquadDraftStateSchema
>;

export const preseasonSquadDraftCreateSchema = z.object({
  season: z.string().regex(/^\d{4}\/\d{2}$/),
  name: z.string().trim().min(1).max(80),
  state: preseasonSquadDraftStateSchema,
});

export const preseasonSquadDraftUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    state: preseasonSquadDraftStateSchema.optional(),
  })
  .refine((value) => value.name != null || value.state != null, {
    message: "A draft name or state is required",
  });

export function emptyPreseasonSquadDraftState(): PreseasonSquadDraftState {
  return {
    playerIds: [],
    starterIds: [],
    captainId: null,
    viceCaptainId: null,
    bank: 0,
  };
}
