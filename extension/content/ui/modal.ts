import type { AnalysisIssue, IssueSeverity, PauseAnalysis } from "../settings/smartPause";
import { createFocusTrap } from "./focusTrap";

export type PauseModalOptions = {
  delaySeconds: number;
  analysisPromise: Promise<PauseAnalysis>;
};

export type PauseModalResult = "confirm" | "cancel";

type ActiveModalController = {
  settle: (result: PauseModalResult) => void;
};

let activeModal: ActiveModalController | null = null;

function labelForCount(count: number): string {
  return count === 1 ? "1 issue" : `${count} issues`;
}

function issueLine(issue: AnalysisIssue): string {
  const prefix = issue.location ? `[${issue.location === "subject" ? "Subject" : "Body"}] ` : "";
  return `${prefix}${issue.message}`;
}

function worstSeverity(issues: AnalysisIssue[]): IssueSeverity | null {
  if (issues.some((i) => i.severity === "high")) return "high";
  if (issues.some((i) => i.severity === "medium")) return "medium";
  if (issues.length > 0) return "low";
  return null;
}

function createSummaryRow(headline: string, issues: AnalysisIssue[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "micro-pause-summary-row";

  const severity = worstSeverity(issues);
  if (severity) {
    row.dataset.severity = severity;
  }

  const heading = document.createElement("div");
  heading.className = "micro-pause-summary-headline";
  heading.textContent = headline;

  const count = document.createElement("span");
  count.className = "micro-pause-summary-count";
  count.textContent = labelForCount(issues.length);

  const headerLine = document.createElement("div");
  headerLine.className = "micro-pause-summary-header";
  headerLine.append(heading, count);

  row.append(headerLine);

  if (issues.length > 0) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "micro-pause-details-toggle";
    toggle.textContent = "View details";
    toggle.setAttribute("aria-expanded", "false");

    const details = document.createElement("ul");
    details.className = "micro-pause-details-list";

    issues.forEach((issue) => {
      const item = document.createElement("li");
      item.textContent = issueLine(issue);
      item.dataset.severity = issue.severity;
      details.append(item);
    });

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      toggle.textContent = expanded ? "View details" : "Hide details";
      details.classList.toggle("micro-pause-details-list--open", !expanded);
    });

    row.append(toggle, details);
  }

  return row;
}

function buildSkeletonSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "micro-pause-context micro-pause-context--loading";

  const heading = document.createElement("h3");
  heading.className = "micro-pause-context-title";
  heading.textContent = "Analysing email\u2026";
  section.append(heading);

  for (let i = 0; i < 3; i++) {
    const line = document.createElement("div");
    line.className = "micro-pause-skeleton-line";
    section.append(line);
  }

  return section;
}

function buildContextSection(analysis: PauseAnalysis): HTMLElement {
  const section = document.createElement("section");
  section.className = "micro-pause-context";

  const heading = document.createElement("h3");
  heading.className = "micro-pause-context-title";
  heading.textContent = "Generalized context";
  section.append(heading);

  if (analysis.summaries.length === 0) {
    section.classList.add("micro-pause-context--clear");
    const empty = document.createElement("p");
    empty.className = "micro-pause-context-empty";
    empty.textContent = "Looks good! No major issues found.";
    section.append(empty);
    return section;
  }

  analysis.summaries.forEach((summary) => {
    section.append(createSummaryRow(summary.headline, analysis.issuesByCategory[summary.category]));
  });

  return section;
}

function buildErrorSection(): HTMLElement {
  const section = document.createElement("section");
  section.className = "micro-pause-context";

  const heading = document.createElement("h3");
  heading.className = "micro-pause-context-title";
  heading.textContent = "Generalized context";
  section.append(heading);

  const msg = document.createElement("p");
  msg.className = "micro-pause-context-empty";
  msg.textContent = "Analysis unavailable. Take a moment to review before sending.";
  section.append(msg);

  return section;
}

export function openPauseModal(options: PauseModalOptions): Promise<PauseModalResult> {
  if (options.delaySeconds <= 0) {
    return Promise.resolve("confirm");
  }

  activeModal?.settle("cancel");

  return new Promise<PauseModalResult>((resolve) => {
    let remaining = Math.max(1, Math.round(options.delaySeconds));
    let settled = false;

    const overlay = document.createElement("div");
    overlay.id = "micro-pause-overlay";
    overlay.className = "micro-pause-overlay";

    const modal = document.createElement("div");
    modal.className = "micro-pause-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "micro-pause-title");

    const title = document.createElement("h2");
    title.id = "micro-pause-title";
    title.className = "micro-pause-title";
    title.textContent = "Pause before sending?";

    const subtitle = document.createElement("p");
    subtitle.className = "micro-pause-description";
    subtitle.textContent = "Review the flags below before deciding to send.";

    const countdown = document.createElement("div");
    countdown.className = "micro-pause-countdown";
    countdown.textContent = `Sending in ${remaining}s`;
    countdown.dataset.urgency = remaining <= 3 ? "high" : remaining <= 6 ? "medium" : "low";

    const skeletonSection = buildSkeletonSection();

    const actions = document.createElement("div");
    actions.className = "micro-pause-actions";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "micro-pause-btn micro-pause-btn-cancel";
    cancelButton.textContent = "Keep Editing";

    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "micro-pause-btn micro-pause-btn-confirm";
    confirmButton.textContent = "Send Now";

    actions.append(cancelButton, confirmButton);
    modal.append(title, subtitle, skeletonSection, countdown, actions);
    overlay.append(modal);
    document.body.append(overlay);

    options.analysisPromise
      .then((analysis) => {
        if (!settled) {
          const contextSection = buildContextSection(analysis);
          contextSection.classList.add("micro-pause-context--entering");
          skeletonSection.replaceWith(contextSection);
        }
      })
      .catch(() => {
        if (!settled) {
          const errorSection = buildErrorSection();
          errorSection.classList.add("micro-pause-context--entering");
          skeletonSection.replaceWith(errorSection);
        }
      });

    const trap = createFocusTrap(modal, () => settle("cancel"));
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        settle("confirm");
      } else {
        countdown.textContent = `Sending in ${remaining}s`;
        countdown.dataset.urgency = remaining <= 3 ? "high" : remaining <= 6 ? "medium" : "low";
      }
    }, 1000);

    function settle(result: PauseModalResult): void {
      if (settled) {
        return;
      }
      settled = true;
      window.clearInterval(timer);
      trap.deactivate();
      overlay.classList.add("micro-pause-overlay--closing");
      window.setTimeout(() => overlay.remove(), 190);
      if (activeModal?.settle === settle) {
        activeModal = null;
      }
      resolve(result);
    }

    modal.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        settle("confirm");
      }
    });
    cancelButton.addEventListener("click", () => settle("cancel"));
    confirmButton.addEventListener("click", () => settle("confirm"));

    activeModal = { settle };
  });
}
