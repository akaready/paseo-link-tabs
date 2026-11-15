import { Platform } from "react-native";

/**
 * The one piece of the page the Links list touches: fading a row's text where the buttons that
 * appear on hover sit over it. A mask is what fades it without knowing the colour underneath,
 * which the plugin theme does not give us. `fade` is where the ramp begins and `clear` is where
 * the text is gone, both measured from the row's right edge. Native has no DOM and needs none of
 * this, because its buttons sit in the row instead of over it.
 */
interface MaskableStyle {
  setProperty(name: string, value: string): void;
  removeProperty(name: string): void;
}

export function fadeTextTail(node: unknown, fade: number, clear: number) {
  if (Platform.OS !== "web") return;
  const element = node as { style?: Partial<MaskableStyle> } | null;
  const style = element?.style;
  if (typeof style?.setProperty !== "function" || typeof style.removeProperty !== "function") {
    return;
  }
  if (fade <= 0) {
    style.removeProperty("mask-image");
    style.removeProperty("-webkit-mask-image");
    return;
  }
  const mask = `linear-gradient(to right, #000 calc(100% - ${fade}px), transparent calc(100% - ${clear}px))`;
  style.setProperty("mask-image", mask);
  style.setProperty("-webkit-mask-image", mask);
}

interface Styled {
  style?: Partial<MaskableStyle>;
  parentElement?: Styled | null;
}

/**
 * Fades a node from clear at its top to the surface behind the list at its bottom, so rows
 * scrolling under it melt into the background. The plugin theme does not say which surface the
 * popover is, so the colour is read off the nearest ancestor that paints one. Native has no DOM
 * and the footer there simply sits over the list.
 */
export function fadeToBackground(node: unknown) {
  if (Platform.OS !== "web") return;
  const element = node as Styled | null;
  const style = element?.style;
  if (typeof style?.setProperty !== "function") return;
  const computed = (globalThis as unknown as {
    getComputedStyle?: (element: unknown) => { backgroundColor: string };
  }).getComputedStyle;
  if (!computed) return;
  for (let at = element?.parentElement; at; at = at.parentElement) {
    const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(
      computed(at).backgroundColor,
    );
    if (!match || Number.parseFloat(match[4] ?? "1") === 0) continue;
    const [, r, g, b] = match;
    style.setProperty(
      "background-image",
      `linear-gradient(to bottom, rgba(${r}, ${g}, ${b}, 0), rgb(${r}, ${g}, ${b}) 70%)`,
    );
    return;
  }
}

/** Whether the modifier that redirects a link (⌘ on a Mac, Ctrl elsewhere) is held right now. */
let modifier = false;

interface ModifierEvent {
  metaKey?: boolean;
  ctrlKey?: boolean;
  key?: string;
  type?: string;
}

interface Listenable {
  addEventListener(name: string, listener: (event: ModifierEvent) => void, capture?: boolean): void;
  removeEventListener(name: string, listener: (event: ModifierEvent) => void, capture?: boolean): void;
}

/**
 * Tracks the modifier as the page is used. Pressable knows nothing of modifier keys, so the state
 * is read off the pointer and key events instead: a press carries it, and holding the key down
 * before a press does too. Nothing happens off the web, where there is no such key.
 */
export function trackModifier() {
  if (Platform.OS !== "web") return () => {};
  const target = globalThis as unknown as Listenable;
  const press = (event: ModifierEvent) => {
    modifier = Boolean(event.metaKey || event.ctrlKey);
  };
  const key = (event: ModifierEvent) => {
    if (event.key !== "Meta" && event.key !== "Control") return;
    modifier = event.type === "keydown";
  };
  const forget = () => {
    modifier = false;
  };
  // A click carries the keys that were held for it, and runs before the press handler reads this.
  target.addEventListener("click", press, true);
  target.addEventListener("keydown", key, true);
  target.addEventListener("keyup", key, true);
  target.addEventListener("blur", forget, true);
  return () => {
    target.removeEventListener("click", press, true);
    target.removeEventListener("keydown", key, true);
    target.removeEventListener("keyup", key, true);
    target.removeEventListener("blur", forget, true);
  };
}

/**
 * Reads Escape while a field is open, so the edit is cancelled rather than saved by the blur that
 * follows. Paseo still closes the popover on Escape; this only makes sure nothing half-typed
 * survives it. Capture on the window runs before the popover's handler, whatever that does.
 */
export function holdEscape(onEscape: () => void) {
  if (Platform.OS !== "web") return () => {};
  const target = globalThis as unknown as Listenable;
  const key = (event: ModifierEvent) => {
    if (event.key !== "Escape") return;
    (event as { stopPropagation?: () => void; preventDefault?: () => void }).stopPropagation?.();
    (event as { preventDefault?: () => void }).preventDefault?.();
    onEscape();
  };
  target.addEventListener("keydown", key, true);
  return () => target.removeEventListener("keydown", key, true);
}

/** Whether a click right now should take the modifier's route. */
export const modifierHeld = () => modifier;
