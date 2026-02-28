export type FocusTrapController = {
  deactivate: () => void;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.tabIndex >= 0
  );
}

export function createFocusTrap(container: HTMLElement, onEscape: () => void): FocusTrapController {
  const previousActive = document.activeElement as HTMLElement | null;
  let active = true;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!active) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const current = document.activeElement as HTMLElement | null;
    const currentIndex = current ? focusable.indexOf(current) : -1;
    const movingBack = event.shiftKey;

    let nextIndex: number;
    if (movingBack) {
      nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === -1 || currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1;
    }

    event.preventDefault();
    focusable[nextIndex].focus();
  };

  document.addEventListener("keydown", onKeyDown, true);
  getFocusable(container)[0]?.focus();

  return {
    deactivate: () => {
      if (!active) {
        return;
      }
      active = false;
      document.removeEventListener("keydown", onKeyDown, true);
      if (previousActive && document.contains(previousActive)) {
        previousActive.focus();
      }
    }
  };
}
