export const SEND_BYPASS_ATTR = "data-micro-pause-bypass";
const SEND_CLICK_SUPPRESS_MS = 250;

const SEND_BUTTON_SELECTORS = [
  "div[role='button'][data-tooltip='Send']",
  "div[role='button'][data-tooltip^='Send ']",
  "div[role='button'][data-tooltip*='Ctrl-Enter']",
  "div[role='button'][aria-label^='Send']",
  "div[role='button'][aria-label*='Send ']",
  "div[role='button'][aria-label*='Ctrl-Enter']"
];

const SEND_SELECTOR_LIST = SEND_BUTTON_SELECTORS.join(",");

export function isSendShortcut(event: KeyboardEvent): boolean {
  if (event.key !== "Enter") {
    return false;
  }
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;
}

export function findSendButton(composeRoot: HTMLElement): HTMLElement | null {
  for (const selector of SEND_BUTTON_SELECTORS) {
    const button = composeRoot.querySelector<HTMLElement>(selector);
    if (button) {
      return button;
    }
  }
  return null;
}

export function findSendButtonFromTarget(target: EventTarget | null): HTMLElement | null {
  let element: Element | null = null;

  if (target instanceof Element) {
    element = target;
  } else if (target instanceof Node) {
    element = target.parentElement;
  }

  if (!element) {
    return null;
  }
  return element.closest<HTMLElement>(SEND_SELECTOR_LIST);
}

export function isBypassSend(button: HTMLElement): boolean {
  return button.getAttribute(SEND_BYPASS_ATTR) === "true";
}

export function triggerNativeSend(composeRoot: HTMLElement, preferredButton?: HTMLElement | null): boolean {
  const button =
    preferredButton && preferredButton.isConnected
      ? preferredButton
      : findSendButton(composeRoot);
  if (!button) {
    return false;
  }

  button.setAttribute(SEND_BYPASS_ATTR, "true");
  button.click();
  window.setTimeout(() => button.removeAttribute(SEND_BYPASS_ATTR), SEND_CLICK_SUPPRESS_MS);
  return true;
}
