import { BasicMatchStat, RoleFeatures } from "./types";
import { safePer90 } from "../utils";

const START_THRESHOLD = 60;

export function buildRoleFeatures(matches: BasicMatchStat[]): RoleFeatures {
  const starts = matches.filter((m) => (m.minutes || 0) >= START_THRESHOLD);
  const subs = matches.filter((m) => (m.minutes || 0) > 0 && (m.minutes || 0) < START_THRESHOLD);

  const startMinutes = starts.reduce((acc, m) => acc + (m.minutes || 0), 0);
  const subMinutes = subs.reduce((acc, m) => acc + (m.minutes || 0), 0);

  const startXG = starts.reduce((acc, m) => acc + (m.xG || 0), 0);
  const subXG = subs.reduce((acc, m) => acc + (m.xG || 0), 0);
  const startXA = starts.reduce((acc, m) => acc + (m.xA || 0), 0);
  const subXA = subs.reduce((acc, m) => acc + (m.xA || 0), 0);

  return {
    perStart_xG: safePer90(startXG, startMinutes),
    perSub_xG: safePer90(subXG, subMinutes),
    perStart_xA: safePer90(startXA, startMinutes),
    perSub_xA: safePer90(subXA, subMinutes),
  };
}
