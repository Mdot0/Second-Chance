import { buildComposeContext } from "./interceptor/composeContext";
import { startSendInterception } from "./interceptor/intercept";
import { triggerNativeSend } from "./interceptor/sendTrigger";
import { getSettings } from "./settings/storage";
import { computePauseDecision } from "./settings/smartPause";
import { openPauseModal } from "./ui/modal";

type WindowWithFlag = Window & { __MICRO_PAUSE_BOOTED__?: boolean };
const w = window as WindowWithFlag;

if (!w.__MICRO_PAUSE_BOOTED__) {
  w.__MICRO_PAUSE_BOOTED__ = true;
  const activeComposeLocks = new WeakSet<HTMLElement>();

  startSendInterception(async ({ composeRoot }) => {
    if (activeComposeLocks.has(composeRoot)) {
      return;
    }
    activeComposeLocks.add(composeRoot);

    try {
      const settings = await getSettings();
      if (!settings.enabled) {
        triggerNativeSend(composeRoot);
        return;
      }

      const context = buildComposeContext(composeRoot);
      const decision = computePauseDecision(context, settings);

      if (decision.delaySeconds <= 0) {
        triggerNativeSend(composeRoot);
        return;
      }

      const result = await openPauseModal({
        delaySeconds: decision.delaySeconds,
        reasons: decision.reasons
      });

      if (result === "confirm") {
        triggerNativeSend(composeRoot);
      }
    } catch (error) {
      console.error("Micro-Pause failed; allowing send.", error);
      triggerNativeSend(composeRoot);
    } finally {
      activeComposeLocks.delete(composeRoot);
    }
  });

  console.log("Micro-Pause content script loaded");
}
