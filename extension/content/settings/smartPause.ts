import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, type PauseSettings } from "./defaults";
import type { ComposeContext } from "../interceptor/composeContext";

export type PauseDecision = {
  delaySeconds: number;
  reasons: string[];
};

function clampDelay(seconds: number): number {
  return Math.max(MIN_DELAY_SECONDS, Math.min(MAX_DELAY_SECONDS, Math.round(seconds)));
}

export function computePauseDecision(
  context: ComposeContext,
  settings: PauseSettings
): PauseDecision {
  let delay = settings.delaySeconds;
  const reasons: string[] = [];

  if (!settings.smartPause) {
    return { delaySeconds: clampDelay(delay), reasons };
  }

  if (context.toCount >= 3) {
    delay += 3;
    reasons.push("multiple recipients");
  }

  if (context.hasAttachment) {
    delay += 4;
    reasons.push("attachment detected");
  }

  const haystack = `${context.subject} ${context.bodyText}`.toLowerCase();
  const matchesKeyword = settings.keywords.some(
    (keyword) => keyword.length > 0 && haystack.includes(keyword.toLowerCase())
  );
  if (matchesKeyword) {
    delay += 4;
    reasons.push("sensitive keyword");
  }

  return { delaySeconds: clampDelay(delay), reasons };
}

export function computeDelay(context: ComposeContext, settings: PauseSettings): number {
  return computePauseDecision(context, settings).delaySeconds;
}
