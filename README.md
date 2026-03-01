# Second Chance

> **Everyone Gets Second Chances.**

A Manifest V3 Chrome extension that intercepts email sends on **Gmail** and **Outlook**, pauses with a countdown modal, and surfaces grammar issues, formatting problems, profanity, and context warnings before the message leaves your outbox.

---

## Features

### Countdown Pause Modal

Every time you hit Send (click or Ctrl/Cmd+Enter), Second Chance intercepts the action and shows a modal with a live countdown timer. The email only sends when the timer reaches zero or you actively click **Send Now**. Click **Keep Editing** or press Escape at any point to go back to your draft.

- Default base delay: **20 seconds** (configurable 0–60 s)
- Keyboard accessible: Enter to confirm send, Escape to cancel, full focus trap
- Timer urgency changes colour as it counts down (low → medium → high)

### Intelligent Delay Scaling

The countdown timer grows dynamically based on what was found in the email:

| Issue severity | Weight added to delay |
|---|---|
| High | +3 s per issue |
| Medium | +2 s per issue |
| Low | +1 s per issue |

Selecting **Strict** mode applies a ×1.35 multiplier on top of the weighted delay. The total is always clamped between 0 and 60 seconds.

### Grammar Checking (LanguageTool)

When grammar checking is enabled, the extension sends the subject and body to the [LanguageTool public API](https://languagetool.org/) and maps matches back to issues shown in the modal. False positives at line breaks (e.g. "missing space after comma" where the comma is followed by a newline) are filtered out automatically. Words in the custom dictionary are ignored.

- Up to 12 issues surfaced per email section
- Timeout: 5 seconds — the modal still works if the API is slow or unreachable
- Categories mapped: grammar, formatting, tone

### Formatting Checks

Run locally with no API calls:

- Mixed tab and space indentation
- Large blank gaps (4+ consecutive empty lines)
- Mixed bullet styles (dashes/asterisks alongside numbered lists)
- Trailing whitespace on any line
- Inconsistent indentation depth across body blocks

### Profanity & Tone Detection

Two-layer detection, both running locally:

1. **Manual list** — severity-mapped words (`high` / `medium`) checked against raw and leet-normalized text (e.g. `@` → `a`, `3` → `e`, `0` → `o`)
2. **leo-profanity extended list** — broad coverage for words not in the manual list, checked on normalized text only

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

While LanguageTool fetches in the background, the modal shows a skeleton loading state ("Analysing email…"). Results are swapped in as soon as the API responds — the countdown keeps running either way.

Each detected category shows a collapsible **View details** row listing every individual issue with its location (Subject / Body) and severity colour-coded. If nothing is found, the modal shows "Looks good! No major issues found."

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
| Base delay | 20 s | Starting countdown length (0–60 s slider) |
| Strictness | Balanced | Strict applies a ×1.35 multiplier to the weighted delay |

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
│   │   └── toneRules.ts        # Profanity word list
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
  computePauseAnalysis()  ← async; fires LanguageTool + local checks in parallel
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

Vite bundles the popup (`extension/popup/popup.html` → `dist/popup/`). The two content scripts (`content.entry.ts`, `outlook.entry.ts`) are compiled separately by **esbuild** as **IIFEs** — Chrome content scripts must be classic scripts with no ESM `import`/`export`. The esbuild step runs inside Vite's `closeBundle` hook alongside static asset copying.

**Output layout in `dist/`:**

```
dist/
├── manifest.json
├── popup/
│   └── popup.js
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
type PauseSettings = {
  enabled: boolean;
  delaySeconds: number;        // 0–60, default 20
  checkGrammar: boolean;
  checkFormatting: boolean;
  strictness: "balanced" | "strict";
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
| Bundler | Vite (popup) + esbuild (content scripts) |
| Package manager | pnpm |
| Grammar API | LanguageTool public API |
| Profanity library | leo-profanity |
| Extension API | Chrome Manifest V3, `chrome.storage.local` |
