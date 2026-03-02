// Offscreen document: hosts the WebLLM engine.
// Receives LLM_RUN messages from the background service worker,
// runs inference, and replies with AnalysisIssue[].

import { CreateMLCEngine, type MLCEngine } from "@mlc-ai/web-llm";

// Two-model strategy:
//   FAST_MODEL  — SmolLM2-360M (~580 MB). Binary hostile-tone check in ~1-2 s.
//   DEEP_MODEL  — Llama 3.2 1B (~879 MB). Nuanced tone analysis in ~4 s.
// Both run in parallel; fast result is returned as soon as it's ready.
// If the deep model finishes first it wins; otherwise fast result is used.
const FAST_MODEL = "SmolLM2-360M-Instruct-q4f32_1-MLC";
const DEEP_MODEL = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

// Shorter timeout for the fast model; deep model gets the full window.
const FAST_TIMEOUT_MS = 4000;
const INFERENCE_TIMEOUT_MS = 10000;

type IssueCategory = "tone" | "context" | "grammar";
type IssueSeverity = "low" | "medium" | "high";
type IssueLocation = "subject" | "body";

type LLMIssue = {
  category: IssueCategory;
  severity: IssueSeverity;
  message: string;
  location: IssueLocation;
};

type LLMJsonResponse = { issues: unknown[] };

// SmolLM2 prompt — highly templated so the tiny model picks one of two fixed outputs.
const FAST_PROMPT = `You are an email tone classifier. Respond with JSON only.

If the email contains angry, hostile, rude, threatening, or passive-aggressive language directed at the recipient, output EXACTLY:
{"issues":[{"category":"tone","severity":"high","message":"Aggressive or hostile tone detected. Consider revising before sending.","location":"body"}]}

Otherwise output EXACTLY:
{"issues":[]}`;

// Llama 1B prompt — more nuanced; catches sarcasm, ultimatums, demanding language.
const DEEP_PROMPT = `You are an email tone checker. Return ONLY valid JSON. No explanation.

Output: {"issues":[{"category":"tone","severity":"high"|"medium","message":"one sentence","location":"body"}]}

Flag ONLY if the email contains angry, hostile, rude, demanding, or passive-aggressive language toward the recipient. Examples: threats, insults, sarcasm used as criticism, ultimatums.

Return {"issues":[]} for polite, neutral, or professional emails. JSON only.`;

let fastEnginePromise: Promise<MLCEngine> | null = null;
let deepEnginePromise: Promise<MLCEngine> | null = null;

function getFastEngine(): Promise<MLCEngine> {
  if (!fastEnginePromise) {
    fastEnginePromise = CreateMLCEngine(FAST_MODEL, {
      initProgressCallback: (p) => console.log(`[Second-Chance] Fast LLM: ${p.text}`)
    }).catch((err: unknown) => {
      fastEnginePromise = null;
      throw err;
    });
  }
  return fastEnginePromise;
}

function getDeepEngine(): Promise<MLCEngine> {
  if (!deepEnginePromise) {
    deepEnginePromise = CreateMLCEngine(DEEP_MODEL, {
      initProgressCallback: (p) => console.log(`[Second-Chance] Deep LLM: ${p.text}`)
    }).catch((err: unknown) => {
      deepEnginePromise = null;
      throw err;
    });
  }
  return deepEnginePromise;
}

function isValidIssue(raw: unknown): raw is LLMIssue {
  if (typeof raw !== "object" || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return (
    (obj.category === "tone" || obj.category === "context" || obj.category === "grammar") &&
    (obj.severity === "low" || obj.severity === "medium" || obj.severity === "high") &&
    typeof obj.message === "string" &&
    (obj.location === undefined || obj.location === null || obj.location === "subject" || obj.location === "body")
  );
}

function parseIssues(raw: string): LLMIssue[] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as LLMJsonResponse;
    if (!Array.isArray(parsed.issues)) return [];
    return parsed.issues.filter(isValidIssue).slice(0, 5);
  } catch {
    return [];
  }
}

// Tries to detect a complete parseable result from a partial stream.
// Returns the issues array if parseable, null if we need more tokens.
function tryParseEarly(text: string): LLMIssue[] | null {
  // Detect the empty case as soon as the closing brace arrives — most
  // emails are fine, so this fires quickly and exits the stream early.
  if (/\{"issues"\s*:\s*\[\s*\]\s*\}/.test(text)) return [];
  // Try to parse a full JSON object for the positive (flagged) case.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as LLMJsonResponse;
    if (!Array.isArray(parsed.issues)) return null;
    return parsed.issues.filter(isValidIssue).slice(0, 5);
  } catch {
    return null; // Incomplete JSON — keep reading.
  }
}

type LLMMode = "fast" | "both" | "deep";

// Cache the last inference result — repeated sends of the same draft are instant.
let inferenceCache: { subject: string; body: string; llmMode: LLMMode; issues: LLMIssue[] } | null = null;

async function runFastInference(subject: string, body: string): Promise<LLMIssue[]> {
  const engine = await getFastEngine();
  // Shorter body for the binary classifier — it doesn't need full context.
  const userContent = `Subject: ${subject}\nBody: ${body.slice(0, 150)}`;

  const stream = await engine.chat.completions.create({
    messages: [
      { role: "system", content: FAST_PROMPT },
      { role: "user", content: userContent }
    ],
    temperature: 0.1,
    max_tokens: 45,
    stream: true as const
  });

  let accumulated = "";
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) accumulated += delta;
    // Return as soon as we can parse a complete result — no need to wait
    // for all 45 tokens if the answer is clear from the first few.
    const earlyResult = tryParseEarly(accumulated);
    if (earlyResult !== null) return earlyResult;
  }

  return parseIssues(accumulated);
}

async function runDeepInference(subject: string, body: string): Promise<LLMIssue[]> {
  const engine = await getDeepEngine();
  const userContent = `Subject: ${subject}\nBody: ${body}`;
  const completion = await engine.chat.completions.create({
    messages: [
      { role: "system", content: DEEP_PROMPT },
      { role: "user", content: userContent }
    ],
    temperature: 0.1,
    max_tokens: 120
  });
  return parseIssues(completion.choices[0]?.message?.content ?? "");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ]);
}

async function runInference(subject: string, body: string, llmMode: LLMMode): Promise<LLMIssue[]> {
  // Slice inputs once for both models.
  const sub = subject.slice(0, 150);
  const bod = body.slice(0, 400);

  if (inferenceCache && inferenceCache.subject === sub && inferenceCache.body === bod && inferenceCache.llmMode === llmMode) {
    console.log("[Second-Chance] Using cached result.");
    return inferenceCache.issues;
  }

  let issues: LLMIssue[];

  if (llmMode === "fast") {
    const result = await withTimeout(runFastInference(sub, bod), FAST_TIMEOUT_MS);
    console.log(`[Second-Chance] Result source: fast (SmolLM2-360M)`);
    issues = result ?? [];
  } else if (llmMode === "deep") {
    const result = await withTimeout(runDeepInference(sub, bod), INFERENCE_TIMEOUT_MS);
    console.log(`[Second-Chance] Result source: deep (Llama 1B)`);
    issues = result ?? [];
  } else {
    // "both" — run in parallel, prefer deep result, fall back to fast.
    const [fast, deep] = await Promise.all([
      withTimeout(runFastInference(sub, bod), FAST_TIMEOUT_MS),
      withTimeout(runDeepInference(sub, bod), INFERENCE_TIMEOUT_MS)
    ]);
    const source = deep !== null ? "deep (Llama 1B)" : fast !== null ? "fast (SmolLM2-360M)" : "none (both timed out)";
    console.log(`[Second-Chance] Result source: ${source}`);
    issues = deep ?? fast ?? [];
  }

  inferenceCache = { subject: sub, body: bod, llmMode, issues };
  return issues;
}

type RunMessage = {
  type: "LLM_RUN";
  target: "offscreen";
  subject: string;
  body: string;
  llmMode: LLMMode;
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as RunMessage;
  if (msg?.type !== "LLM_RUN" || msg?.target !== "offscreen") return false;

  let settled = false;

  const timeout = setTimeout(() => {
    if (!settled) {
      settled = true;
      sendResponse({ issues: [] });
    }
  }, INFERENCE_TIMEOUT_MS + 1000);

  runInference(msg.subject, msg.body, msg.llmMode ?? "both")
    .then((issues) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        sendResponse({ issues });
      }
    })
    .catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        sendResponse({ issues: [] });
      }
    });

  return true; // keep message channel open for async response
});

// Pre-warm both models immediately so they're ready when the user sends.
void getFastEngine().catch(() => {
  console.warn("[Second-Chance] Fast LLM failed to preload — will retry on first send.");
});
void getDeepEngine().catch(() => {
  console.warn("[Second-Chance] Deep LLM failed to preload — will retry on first send.");
});
