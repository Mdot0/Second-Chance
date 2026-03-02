// Service worker: manages the offscreen document lifetime and forwards
// LLM_ANALYSE requests from content scripts to the offscreen document.

type LLMMode = "fast" | "both" | "deep";

type LLMAnalyseMessage = {
  type: "LLM_ANALYSE";
  subject: string;
  body: string;
  llmMode?: LLMMode;
};

type LLMRunMessage = {
  type: "LLM_RUN";
  target: "offscreen";
  subject: string;
  body: string;
  llmMode: LLMMode;
};

type LLMResult = { issues: unknown[] };

let creating: Promise<void> | null = null;

async function ensureOffscreenDocument(): Promise<void> {
  if (creating) {
    await creating;
    return;
  }
  creating = chrome.offscreen
    .createDocument({
      url: chrome.runtime.getURL("offscreen/offscreen.html"),
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Run local LLM inference for email tone and context analysis"
    })
    .catch(() => {
      // Swallow "document already exists" errors on service worker restart.
    });
  await creating;
  creating = null;
}

// Keep the service worker alive so the first send after a period of
// inactivity doesn't pay a cold-start penalty (~200-400ms).
chrome.alarms.create("keepalive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "keepalive") return;
  // Touching storage is enough to reset the inactivity timer.
  void chrome.storage.local.get(null);
});

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const msg = message as LLMAnalyseMessage;

    // Content script signals readiness on page load — pre-create the offscreen
    // document so the model starts warming up while the user composes.
    if ((msg as { type: string })?.type === "WARMUP") {
      void ensureOffscreenDocument();
      return false;
    }

    if (msg?.type !== "LLM_ANALYSE") return false;

    const forward: LLMRunMessage = {
      type: "LLM_RUN",
      target: "offscreen",
      subject: msg.subject,
      body: msg.body,
      llmMode: msg.llmMode ?? "both"
    };

    ensureOffscreenDocument()
      .then(() => chrome.runtime.sendMessage(forward))
      .then((result: unknown) => {
        sendResponse((result as LLMResult | undefined) ?? { issues: [] });
      })
      .catch(() => {
        sendResponse({ issues: [] });
      });

    return true; // keep message channel open for async response
  }
);
