import { buildComposeContext } from "./interceptor/composeContext";
import { startSendInterception } from "./interceptor/intercept";
import { triggerNativeSend } from "./interceptor/sendTrigger";
import { getSettings } from "./settings/storage";
import { computePauseAnalysis } from "./settings/smartPause";
import { openPauseModal } from "./ui/modal";

type WindowWithFlag = Window & { __MICRO_PAUSE_BOOTED__?: boolean };
const w = window as WindowWithFlag;
const RELEASE_LOCK_DELAY_MS = 180;
const CONTENT_BUILD_TAG = "2026-03-01-comma-newline-filter-v2";

function attemptNativeSend(composeRoot: HTMLElement, source: string): void {
  const sent = triggerNativeSend(composeRoot);
  if (!sent) {
    console.warn(`[Second-Chance] Could not trigger native send (${source}).`);
  }
}

function attemptNativeSendWithButton(
  composeRoot: HTMLElement,
  sendButton: HTMLElement | null | undefined,
  source: string
): void {
  const sent = triggerNativeSend(composeRoot, sendButton);
  if (!sent) {
    console.warn(`[Second-Chance] Could not trigger native send (${source}).`);
  }
}

if (!w.__MICRO_PAUSE_BOOTED__) {
  w.__MICRO_PAUSE_BOOTED__ = true;
  const activeComposeLocks = new WeakSet<HTMLElement>();

  startSendInterception(async ({ composeRoot, sendButton, trigger }) => {
    if (activeComposeLocks.has(composeRoot)) {
      return;
    }
    activeComposeLocks.add(composeRoot);

    try {
      const settings = await getSettings();

      if (!settings.enabled) {
        attemptNativeSendWithButton(composeRoot, sendButton, "disabled");
        return;
      }

      const context = buildComposeContext(composeRoot);
      const analysisPromise = computePauseAnalysis(context, settings);

      const result = await openPauseModal({
        delaySeconds: Math.max(1, settings.delaySeconds),
        analysisPromise
      });

      if (result === "confirm") {
        attemptNativeSendWithButton(composeRoot, sendButton, `confirmed-${trigger}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Extension context invalidated")) {
        attemptNativeSend(composeRoot, "context-invalidated");
        return;
      }
      console.error("[Second-Chance] Core flow failed.", error);
      const fallbackConfirm = window.confirm(
        "Second-Chance hit an error. Do you want to send this email anyway?"
      );
      if (fallbackConfirm) {
        attemptNativeSend(composeRoot, "error-fallback-confirmed");
      }
    } finally {
      window.setTimeout(() => activeComposeLocks.delete(composeRoot), RELEASE_LOCK_DELAY_MS);
    }
  });

  console.log(`[Second-Chance] content script loaded (${CONTENT_BUILD_TAG})`);
}
