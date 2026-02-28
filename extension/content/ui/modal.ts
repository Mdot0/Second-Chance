import { createFocusTrap } from "./focusTrap";

export type PauseModalOptions = {
  delaySeconds: number;
  reasons: string[];
};

export type PauseModalResult = "confirm" | "cancel";

type ActiveModalController = {
  settle: (result: PauseModalResult) => void;
};

let activeModal: ActiveModalController | null = null;

function formatReasons(reasons: string[]): string {
  if (reasons.length === 0) {
    return "Using your default pause.";
  }
  return `Smart pause active: ${reasons.join(", ")}.`;
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

    const description = document.createElement("p");
    description.className = "micro-pause-description";
    description.textContent = formatReasons(options.reasons);

    const countdown = document.createElement("div");
    countdown.className = "micro-pause-countdown";
    countdown.textContent = `Sending in ${remaining}s`;

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
    modal.append(title, description, countdown, actions);
    overlay.append(modal);
    document.body.append(overlay);

    const trap = createFocusTrap(modal, () => settle("cancel"));
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        settle("confirm");
      } else {
        countdown.textContent = `Sending in ${remaining}s`;
      }
    }, 1000);

    function settle(result: PauseModalResult): void {
      if (settled) {
        return;
      }
      settled = true;
      window.clearInterval(timer);
      trap.deactivate();
      overlay.remove();
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
