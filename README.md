# Second-Chance

Chrome extension baseline for "Micro-Pause": intercept Gmail sends, show a timed confirmation modal, and persist settings in extension storage.

## Baseline Architecture

```text
extension/
  manifest.json
  content/
    content.entry.ts
    interceptor/
      intercept.ts
      composeContext.ts
      sendTrigger.ts
    ui/
      modal.ts
      focusTrap.ts
      styles.css
    settings/
      defaults.ts
      storage.ts
      smartPause.ts
  popup/
    popup.html
    popup.ts
    popup.css
  assets/
    icons/
```

## Module Responsibilities

- `content.entry.ts`: bootstraps content script, coordinates interception + settings + modal + final send.
- `interceptor/intercept.ts`: captures send attempts (click and Ctrl/Cmd+Enter).
- `interceptor/composeContext.ts`: extracts recipients, subject, body, attachment signal.
- `interceptor/sendTrigger.ts`: finds Gmail send button and triggers native send with bypass marker.
- `settings/defaults.ts`: shared settings types/defaults.
- `settings/storage.ts`: `chrome.storage.local` read/write and settings normalization.
- `settings/smartPause.ts`: smart delay decision logic and reasons.
- `ui/modal.ts`: countdown modal (confirm/cancel).
- `ui/focusTrap.ts`: keyboard focus trapping and Escape behavior.
- `popup/*`: settings editor UI.

## Shared Interfaces (Do Not Break Without Team Sync)

- `PauseSettings`:
  - `enabled: boolean`
  - `delaySeconds: number`
  - `smartPause: boolean`
  - `keywords: string[]`
- `storage.ts`:
  - `getSettings(): Promise<PauseSettings>`
  - `setSettings(patch: Partial<PauseSettings>): Promise<PauseSettings>`
  - `onSettingsChange(cb): (() => void) | undefined`
- `smartPause.ts`:
  - `computePauseDecision(context, settings): { delaySeconds: number; reasons: string[] }`
- `composeContext.ts`:
  - `buildComposeContext(composeRoot): ComposeContext`
  - `findComposeRootFromNode(node): HTMLElement | null`

## Team Assignment

### Matthew (Core Integration - Largest Task)

Own files:
- `extension/content/content.entry.ts`
- `extension/content/interceptor/intercept.ts`
- `extension/content/interceptor/composeContext.ts`
- `extension/content/interceptor/sendTrigger.ts`
- `extension/content/ui/modal.ts`
- `extension/content/ui/focusTrap.ts`

Deliverables:
- Reliable Gmail send interception.
- Pause modal trigger path (including confirm/cancel behavior).
- Final integration of settings + smart delay + send handoff.

### Kevin (Popup + Storage)

Own files:
- `extension/popup/popup.html`
- `extension/popup/popup.ts`
- `extension/popup/popup.css`
- `extension/content/settings/defaults.ts`
- `extension/content/settings/storage.ts`

Deliverables:
- Settings form for enable/delay/smart-pause/keywords.
- Persist/read from `chrome.storage.local`.
- Validation + normalization compatible with shared interfaces.

### Vinci (Smart Rules + UI Polish)

Own files:
- `extension/content/settings/smartPause.ts`
- `extension/content/ui/styles.css`

Deliverables:
- Delay rules and reasons logic.
- Modal appearance polish and accessibility improvements.

## Branch Workflow (Parallel, Low Conflict)

1. Start:
   - `git checkout main`
   - `git pull`
   - `git checkout <your-branch>`
2. Install:
   - `pnpm install --frozen-lockfile`
3. Work only in owned files.
4. Validate before push:
   - `pnpm build`
   - `pnpm lint`
5. Keep branch current:
   - `git fetch origin`
   - `git rebase origin/main`
6. Open Draft PR early; keep PR focused to assigned module.
7. Merge order:
   - `kevin` -> `vinci` -> `matthew`

## Dev/Test Workflow

1. Build:
   - `pnpm build`
2. Load extension:
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Load unpacked -> `dist/`
3. Iterate:
   - Run watch build: `pnpm dev`
   - Click extension "Reload" in `chrome://extensions`
   - Refresh Gmail tab
4. Baseline smoke test:
   - Popup saves settings.
   - Gmail send shows countdown modal.
   - Confirm sends; cancel keeps draft.
