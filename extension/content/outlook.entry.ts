import { buildOutlookComposeContext } from "./interceptor/outlookContext";
import { startOutlookSendInterception } from "./interceptor/outlookIntercept";
import { triggerOutlookNativeSend } from "./interceptor/outlookSendTrigger";
import { getSettings } from "./settings/storage";
import { computePauseAnalysis } from "./settings/smartPause";
import { openPauseModal } from "./ui/modal";

type WindowWithFlag = Window & { __MICRO_PAUSE_OUTLOOK_BOOTED__?: boolean };
const w = window as WindowWithFlag;
const RELEASE_LOCK_DELAY_MS = 180;

function attemptNativeSend(composeRoot: HTMLElement, source: string): void {
  const sent = triggerOutlookNativeSend(composeRoot);
  if (!sent) {
    console.warn(`[Second-Chance] Could not trigger Outlook native send (${source}).`);
  }
}

function attemptNativeSendWithButton(
  composeRoot: HTMLElement,
  sendButton: HTMLElement | null | undefined,
  source: string
): void {
  const sent = triggerOutlookNativeSend(composeRoot, sendButton);
  if (!sent) {
    console.warn(`[Second-Chance] Could not trigger Outlook native send (${source}).`);
  }
}

if (!w.__MICRO_PAUSE_OUTLOOK_BOOTED__) {
  w.__MICRO_PAUSE_OUTLOOK_BOOTED__ = true;
  const activeComposeLocks = new WeakSet<HTMLElement>();

  startOutlookSendInterception(async ({ composeRoot, sendButton, trigger }) => {
    if (activeComposeLocks.has(composeRoot)) return;
    activeComposeLocks.add(composeRoot);

    try {
      const settings = await getSettings();

      if (!settings.enabled) {
        attemptNativeSendWithButton(composeRoot, sendButton, "disabled");
        return;
      }

      const context = buildOutlookComposeContext(composeRoot);
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
      console.error("[Second-Chance] Outlook core flow failed.", error);
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

  console.log("[Second-Chance] Outlook content script loaded");
}
