export type FocusTrapController = {
  deactivate: () => void;
};

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}

export function createFocusTrap(
  container: HTMLElement,
  onEscape: () => void
): FocusTrapController {
  const previousActive = document.activeElement as HTMLElement | null;

  const onKeyDown = (event: KeyboardEvent): void => {
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

    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const movingBack = event.shiftKey;
    let nextIndex = currentIndex;

    if (movingBack) {
      nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
    } else {
      nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
    }

    event.preventDefault();
    focusable[nextIndex].focus();
  };

  document.addEventListener("keydown", onKeyDown, true);
  const first = getFocusable(container)[0];
  first?.focus();

  return {
    deactivate: () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previousActive?.focus();
    }
  };
}
