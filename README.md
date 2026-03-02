# Second Chance

> **Everyone Gets Second Chances.**

A Manifest V3 Chrome extension that intercepts email sends on **Gmail** and **Outlook**, pauses with a countdown modal, and surfaces grammar issues, formatting problems, profanity, vague language, and AI-detected tone problems before the message leaves your outbox.

---

## Why?

Have you ever hit Send and immediately noticed a typo in the subject line? Accidentally left a placeholder in the body? Forgotten to attach the file you mentioned? Sent a reply-all to the entire company when you meant to reply only to one person?

We've all been there. Email is permanent — once it's sent, it's gone. Second Chance gives you a short window after every send to catch those mistakes before they reach anyone's inbox. It's not about slowing you down; it's about giving yourself the few seconds you never knew you needed.

---

## Features

### Countdown Pause Modal

Every time you hit Send (click or Ctrl/Cmd+Enter), Second Chance intercepts the action and shows a modal with a live countdown timer. The email only sends when the timer reaches zero or you actively click **Send Now**. Click **Keep Editing** or press Escape at any point to go back to your draft.

- Default base delay: **20 seconds** (configurable 0–60 s)
- Keyboard accessible: Enter to confirm send, Escape to cancel, full focus trap
- Timer urgency changes colour as it counts down (low → medium → high)

### Intelligent Delay Scaling

Issues found during analysis add weighted seconds on top of the base delay (high = +3 s, medium = +2 s, low = +1 s). When the **Accurate** AI model is selected, a ×1.35 multiplier is applied on top of the weighted delay. The total is always clamped between 0 and 60 seconds.

### AI Tone Analysis (on-device, private)

When AI analysis is enabled, the extension runs a local language model inside a Chrome offscreen document using [WebLLM](https://webllm.mlc.ai/). No data leaves your device.

Three model modes are available:

| Mode | Model | Typical latency | Behaviour |
|---|---|---|---|
| **Fast** | SmolLM2-360M | ~1-2 s | Binary hostile/neutral classifier; streams tokens and exits as soon as the response is parseable |
| **Balanced** *(default)* | Both in parallel | best of fast/deep | Fast result is used as fallback; deep result replaces it if it finishes within 10 s |
| **Accurate** | Llama 3.2 1B | ~4-5 s | Nuanced detection — catches sarcasm, ultimatums, demanding language, passive-aggression |

Both models are pre-warmed the moment Gmail or Outlook loads, so they are ready (or closer to ready) by the time the user clicks Send.

### Grammar Checking (LanguageTool)

When grammar checking is enabled, the extension sends the subject and body to the [LanguageTool public API](https://languagetool.org/) and maps matches back to issues shown in the modal. False positives at line breaks (e.g. "missing space after comma" where the comma is followed by a newline) are filtered out automatically. Words in the custom dictionary are ignored.

- Up to 12 issues surfaced per email section
- Timeout: 5 seconds — the modal still works if the API is slow or unreachable

### Formatting Checks

Run locally with no API calls:

- Mixed tab and space indentation
- Large blank gaps (4+ consecutive empty lines)
- Mixed bullet styles (dashes/asterisks alongside numbered lists)
- Trailing whitespace on any line
- Inconsistent indentation depth across body blocks

### Profanity & Vague Language Detection

Two-layer profanity detection, both running locally:

1. **Manual list** — severity-mapped words (`high` / `medium`) checked against raw and leet-normalized text (e.g. `@` → `a`, `3` → `e`, `0` → `o`)
2. **leo-profanity extended list** — broad coverage for words not in the manual list, checked on normalized text only

Additionally, **vague language detection** fires when 2 or more uncommitted phrases are found in the body (e.g. "maybe", "I guess", "sort of", "kind of", "no pressure"). This is rule-based and runs instantly.

### Context Warnings

Checks that require no API:

| Situation | Severity |
|---|---|
| 2–3 recipients | Low |
| 4–6 recipients | Medium |
| 7+ recipients | High |
| Attachment present | Medium |
| Attachment mentioned in text but no file attached | **High** |

### Analysis Modal UI

While analysis runs in the background, the modal shows a skeleton loading state ("Analysing email…"). Results are swapped in as soon as analysis completes — the countdown keeps running either way.

Each detected category shows:
- A bold **headline** (e.g. "Tone or language issues detected") with a severity colour
- A non-bold subtitle explaining why the category matters
- A collapsible **View details** toggle listing every individual issue

If nothing is found, the modal shows "Looks good! No major issues found."

---

## Supported Platforms

| Platform | URL patterns |
|---|---|
| Gmail | `https://mail.google.com/*` |
| Outlook (personal) | `https://outlook.live.com/*` |
| Outlook (work) | `https://outlook.office.com/*` |
| Outlook 365 | `https://outlook.office365.com/*` |
| Outlook (Microsoft Cloud) | `https://outlook.cloud.microsoft/*` |

---

## Settings

Open the extension popup from the browser toolbar to configure:

| Setting | Default | Description |
|---|---|---|
| Enable pause before send | On | Master toggle |
| Grammar quality | On | Calls LanguageTool API on send |
| Formatting & indentation | On | Local formatting checks |
| AI analysis | On | Runs a local LLM (on-device, private) |
| AI model | Balanced | Fast (~1-2 s), Balanced (best of both), or Accurate (~4-5 s) |
| Base delay | 20 s | Starting countdown length (0–60 s slider) |

---

## Installation (Development)

```bash
pnpm install --frozen-lockfile
pnpm build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder
4. Open Gmail or Outlook and compose an email

After any source change, run `pnpm build`, then click the reload icon next to the extension on `chrome://extensions` and refresh the email tab.

For watch mode during development:

```bash
pnpm dev
```

---

## Architecture

### Extension layout

```
extension/
├── manifest.json
├── background/
│   └── background.ts           # Service worker: manages offscreen doc, forwards LLM messages
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.ts            # WebLLM host: SmolLM2 + Llama 3.2 1B inference
├── content/
│   ├── content.entry.ts        # Gmail bootstrap
│   ├── outlook.entry.ts        # Outlook bootstrap
│   ├── interceptor/
│   │   ├── intercept.ts              # Gmail click + keyboard listener
│   │   ├── outlookIntercept.ts       # Outlook click + pointerdown + keyboard listener
│   │   ├── composeContext.ts         # Extract Gmail ComposeContext from DOM
│   │   ├── outlookContext.ts         # Extract Outlook ComposeContext from DOM
│   │   ├── sendTrigger.ts            # Gmail send button + bypass marker
│   │   └── outlookSendTrigger.ts     # Outlook send button + bypass marker
│   ├── settings/
│   │   ├── defaults.ts         # PauseSettings type + DEFAULT_SETTINGS
│   │   ├── storage.ts          # chrome.storage.local helpers
│   │   ├── smartPause.ts       # computePauseAnalysis — orchestrates all checks
│   │   ├── languageTool.ts     # LanguageTool API client
│   │   ├── llmAnalysis.ts      # Content-script side: sends LLM_ANALYSE to background
│   │   ├── spellcheck.ts       # Local spell/grammar analysis
│   │   ├── spellDictionary.ts  # Word list data
│   │   └── toneRules.ts        # PROFANITY word list + VAGUE_SIGNALS phrases
│   └── ui/
│       ├── modal.ts            # Countdown modal DOM + timer logic
│       ├── focusTrap.ts        # Keyboard focus trap
│       └── styles.css          # All modal CSS (micro-pause-* BEM classes)
└── popup/
    ├── popup.html
    ├── popup.ts                # Settings form logic
    └── popup.css
```

### Send interception flow

```
User clicks Send / presses Ctrl+Enter
          │
          ▼
  Listener fires at capture phase
  (prevents default immediately)
          │
          ▼
  WeakSet lock acquired for compose window
  (prevents re-entrant interception)
          │
          ▼
  getSettings()  ──── extension disabled? ──▶  trigger native send, exit
          │
          ▼
  buildComposeContext()   ← reads DOM (recipients, subject, body, attachments)
          │
          ▼
  computePauseAnalysis()  ← fires in parallel:
     ├── LanguageTool API (if grammar enabled)
     ├── LLM via offscreen document (if AI enabled)
     │     └── background SW → offscreen → SmolLM2 / Llama 3.2 1B
     ├── Local formatting checks
     ├── Profanity & vague language checks (rule-based)
     └── Context checks (recipients, attachments)
          │
          ▼
  openPauseModal()   ← shows skeleton while analysis resolves
     │         │
     │    analysis resolves ──▶ swap skeleton → issue summaries
     │
  User action / timer expiry
     │
     ├── "Keep Editing" / Escape ──▶ modal closes, no send
     │
     └── "Send Now" / timer = 0 ──▶ SEND_BYPASS_ATTR set on send button
                                     ──▶ button.click() fires
                                     ──▶ interceptor sees bypass marker, ignores
                                     ──▶ Gmail/Outlook processes native send
```

### Build system

Vite bundles the popup (`extension/popup/popup.html` → `dist/popup/`). The content scripts, background service worker, and offscreen document are compiled separately by **esbuild** as **IIFEs** — Chrome content scripts must be classic scripts with no ESM `import`/`export`. The esbuild step runs inside Vite's `closeBundle` hook alongside static asset copying.

**Output layout in `dist/`:**

```
dist/
├── manifest.json
├── popup/
│   └── popup.js
├── background/
│   └── background.js
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── content/
│   ├── content.entry.js     ← Gmail IIFE
│   ├── outlook.entry.js     ← Outlook IIFE
│   └── ui/
│       └── styles.css
└── assets/
    └── icons/
```

### Key types

```typescript
// defaults.ts
type LLMMode = "fast" | "both" | "deep";

type PauseSettings = {
  enabled: boolean;
  delaySeconds: number;        // 0–60, default 20
  checkGrammar: boolean;
  checkFormatting: boolean;
  llmEnabled: boolean;
  llmMode: LLMMode;            // "fast" | "both" | "deep", default "both"
  customDictionary: string[];
};

// smartPause.ts
type PauseAnalysis = {
  delaySeconds: number;
  summaries: AnalysisSummary[];
  issuesByCategory: Record<"grammar" | "formatting" | "tone" | "context", AnalysisIssue[]>;
};

// composeContext.ts / outlookContext.ts
type ComposeContext = {
  toCount: number;
  hasAttachment: boolean;
  subject: string;
  bodyText: string;
  bodyRaw: string;
  bodyBlocks: BodyBlock[];
};
```

---

## Tech Stack

| | |
|---|---|
| Language | TypeScript (strict, ES2022, Chrome 114+) |
| Bundler | Vite (popup) + esbuild (content scripts, background, offscreen) |
| Package manager | pnpm |
| Local AI | WebLLM (`@mlc-ai/web-llm`) — SmolLM2-360M + Llama 3.2 1B, runs fully on-device via WebGPU |
| Grammar API | LanguageTool public API |
| Profanity library | leo-profanity |
| Extension API | Chrome Manifest V3, `chrome.storage.local`, `chrome.offscreen`, `chrome.alarms` |
