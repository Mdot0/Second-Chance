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

  if (context.toCount >= 7) {
    delay += 6;
    reasons.push(`sending to ${context.toCount} people`);
  } else if (context.toCount >= 4) {
    delay += 4;
    reasons.push(`sending to ${context.toCount} people`);
  } else if (context.toCount >= 2) {
    delay += 2;
    reasons.push(`sending to ${context.toCount} people`);
  }

  if (context.hasAttachment) {
    delay += 5;
    reasons.push("attachment included");
  }

  const lowerHaystack = `${context.subject} ${context.bodyText}`.toLowerCase();
  const matchedKeyword = settings.keywords.find(
    (keyword) => keyword.length > 0 && lowerHaystack.includes(keyword.toLowerCase())
  );
  if (matchedKeyword) {
    delay += 5;
    reasons.push(`keyword "${matchedKeyword}" detected`);
  }

  return { delaySeconds: clampDelay(delay), reasons };
}

export function computeDelay(context: ComposeContext, settings: PauseSettings): number {
  return computePauseDecision(context, settings).delaySeconds;
}
