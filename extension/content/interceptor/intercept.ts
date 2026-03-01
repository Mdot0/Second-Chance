import { findComposeRootFromNode } from "./composeContext";
import { findSendButton, findSendButtonFromTarget, isBypassSend, isSendShortcut } from "./sendTrigger";

type AttemptTrigger = "click" | "shortcut";

export type SendAttempt = {
  composeRoot: HTMLElement;
  sendButton: HTMLElement;
  trigger: AttemptTrigger;
  event: Event;
};

type InterceptHandler = (attempt: SendAttempt) => void | Promise<void>;

const DEDUPE_MS = 120;

function blockSendEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function shouldIgnoreFromOverlayTarget(target: EventTarget | null): boolean {
  if (target instanceof Element) {
    return Boolean(target.closest("#micro-pause-overlay"));
  }
  if (target instanceof Node) {
    return Boolean(target.parentElement?.closest("#micro-pause-overlay"));
  }
  return false;
}

export function startSendInterception(onAttempt: InterceptHandler): () => void {
  const lastAttemptByCompose = new WeakMap<HTMLElement, number>();

  const dispatchAttempt = (
    composeRoot: HTMLElement,
    sendButton: HTMLElement,
    trigger: AttemptTrigger,
    event: Event
  ): void => {
    const now = Date.now();
    const lastAttempt = lastAttemptByCompose.get(composeRoot) ?? 0;
    if (now - lastAttempt < DEDUPE_MS) {
      return;
    }
    lastAttemptByCompose.set(composeRoot, now);
    void Promise.resolve(onAttempt({ composeRoot, sendButton, trigger, event })).catch((error) => {
      console.error("Second-Chance send interception callback failed.", error);
    });
  };

  const onClick = (event: MouseEvent): void => {
    if (shouldIgnoreFromOverlayTarget(event.target)) {
      return;
    }

    const sendButton = findSendButtonFromTarget(event.target);
    if (!sendButton || isBypassSend(sendButton)) {
      return;
    }

    const composeRoot = findComposeRootFromNode(sendButton);
    if (!composeRoot) {
      return;
    }

    blockSendEvent(event);
    dispatchAttempt(composeRoot, sendButton, "click", event);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (shouldIgnoreFromOverlayTarget(event.target)) {
      return;
    }

    const sendButton = findSendButtonFromTarget(event.target);
    if (!sendButton || isBypassSend(sendButton)) {
      return;
    }

    const composeRoot = findComposeRootFromNode(sendButton);
    if (!composeRoot) {
      return;
    }

    blockSendEvent(event);
    dispatchAttempt(composeRoot, sendButton, "click", event);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (shouldIgnoreFromOverlayTarget(event.target) || !isSendShortcut(event)) {
      return;
    }

    const composeRoot = findComposeRootFromNode(event.target as Node | null);
    if (!composeRoot) {
      return;
    }

    const sendButton = findSendButton(composeRoot);
    if (!sendButton || isBypassSend(sendButton)) {
      return;
    }

    blockSendEvent(event);
    dispatchAttempt(composeRoot, sendButton, "shortcut", event);
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
