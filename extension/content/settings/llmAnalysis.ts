// Content-script side of LLM analysis.
// Sends the compose context to the background service worker, which
// forwards it to the offscreen document running WebLLM.

import type { LLMMode } from "./defaults";
import type { AnalysisIssue } from "./smartPause";
import type { ComposeContext } from "../interceptor/composeContext";

const LLM_TIMEOUT_MS = 10000;
const MAX_SUBJECT_CHARS = 200;
const MAX_BODY_CHARS = 800;

type LLMResponse = { issues?: AnalysisIssue[] };

export async function fetchLLMIssues(context: ComposeContext, llmMode: LLMMode): Promise<AnalysisIssue[]> {
  return new Promise<AnalysisIssue[]>((resolve) => {
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve([]);
      }
    }, LLM_TIMEOUT_MS);

    chrome.runtime
      .sendMessage({
        type: "LLM_ANALYSE",
        subject: context.subject.slice(0, MAX_SUBJECT_CHARS),
        body: context.bodyRaw.slice(0, MAX_BODY_CHARS),
        llmMode
      })
      .then((response: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        const issues = (response as LLMResponse | undefined)?.issues;
        resolve(Array.isArray(issues) ? issues : []);
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve([]);
      });
  });
}
