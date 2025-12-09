import { Position } from "@prisma/client";

export function calculateSmartBonus(opts: {
  position: Position;
  xG_hat: number;
  xA_hat: number;
  prob_cs: number;
  win_prob: number;
  isKeyPlayer: boolean;
}): number {
  const { position, xG_hat, xA_hat, prob_cs, win_prob, isKeyPlayer } = opts;

  let prob_3 = 0;
  let prob_2 = 0;
  let prob_1 = 0;

  if (position === "FORWARD" || position === "MIDFIELDER") {
    const p_goal = 1 - Math.exp(-xG_hat);
    const p_brace = 1 - Math.exp(-xG_hat) * (1 + xG_hat);

    prob_3 = p_brace * 0.85;
    prob_2 = (p_goal - p_brace) * 0.4;
    prob_1 = (p_goal - p_brace) * 0.3;

    if (xA_hat > 0.4) prob_1 += 0.2;
  } else {
    const p_return = 1 - Math.exp(-(xG_hat + xA_hat));
    prob_3 = prob_cs * p_return * 0.9;
    prob_2 = prob_cs * (1 - p_return) * 0.4;
    prob_1 = prob_cs * (1 - p_return) * 0.4;
  }

  let expected_bonus = 3 * prob_3 + 2 * prob_2 + prob_1;
  expected_bonus *= 1 + win_prob * 0.2;
  if (isKeyPlayer) expected_bonus += 0.15;

  return Math.min(3, expected_bonus);
}
