import { buildComposeContext } from "./interceptor/composeContext";
import { startSendInterception } from "./interceptor/intercept";
import { triggerNativeSend } from "./interceptor/sendTrigger";
import { getSettings } from "./settings/storage";
import { computePauseAnalysis } from "./settings/smartPause";
import { openPauseModal } from "./ui/modal";

type WindowWithFlag = Window & { __MICRO_PAUSE_BOOTED__?: boolean };
const w = window as WindowWithFlag;
const RELEASE_LOCK_DELAY_MS = 180;

function attemptNativeSend(composeRoot: HTMLElement, source: string): void {
  const sent = triggerNativeSend(composeRoot);
  if (!sent) {
    console.warn(`[Micro-Pause] Could not trigger native send (${source}).`);
  }
}

if (!w.__MICRO_PAUSE_BOOTED__) {
  w.__MICRO_PAUSE_BOOTED__ = true;
  const activeComposeLocks = new WeakSet<HTMLElement>();

  startSendInterception(async ({ composeRoot, trigger }) => {
    if (activeComposeLocks.has(composeRoot)) {
      return;
    }
    activeComposeLocks.add(composeRoot);

    try {
      const settings = await getSettings();

      if (!settings.enabled) {
        attemptNativeSend(composeRoot, "disabled");
        return;
      }

      const context = buildComposeContext(composeRoot);
      const analysis = await computePauseAnalysis(context, settings);
      const delaySeconds = Math.max(1, analysis.delaySeconds || 0);

      const result = await openPauseModal({
        delaySeconds,
        analysis
      });

      if (result === "confirm") {
        attemptNativeSend(composeRoot, `confirmed-${trigger}`);
      }
    } catch (error) {
      console.error("[Micro-Pause] Core flow failed.", error);
      const fallbackConfirm = window.confirm(
        "Micro-Pause hit an error. Do you want to send this email anyway?"
      );
      if (fallbackConfirm) {
        attemptNativeSend(composeRoot, "error-fallback-confirmed");
      }
    } finally {
      window.setTimeout(() => activeComposeLocks.delete(composeRoot), RELEASE_LOCK_DELAY_MS);
    }
  });

  console.log("Micro-Pause content script loaded");
}
