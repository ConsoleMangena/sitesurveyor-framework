/**
 * Radix's dismissable layer turns off pointer events on <body> while a modal
 * is open and puts back the value it captured when the layer closes. The app
 * ships two copies of that package — 1.1.15 behind the menus and selects,
 * 1.1.19 behind the dialogs and popovers — and each copy keeps its own
 * captured value. A dialog opened from a row menu therefore captures "none"
 * (the menu is holding it at that moment) and restores "none" when it closes,
 * which leaves the whole page unclickable until it is reloaded.
 *
 * Watch <body> and hand the pointer events back as soon as the disabled state
 * has no live layer holding it.
 */

/** Radix marks a live layer node and its overlay with an inline "auto". */
const LIVE_LAYER_SELECTOR = "[style*='pointer-events']";

/**
 * A layer that is closing stays in the DOM until its exit animation ends, and
 * Radix marks it "closed" while it does. Only a layer that is still open may
 * hold the page.
 */
function hasLiveLayer(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLElement>(LIVE_LAYER_SELECTOR),
  ).some(
    (el) =>
      el.style.pointerEvents === "auto" && el.dataset.state !== "closed",
  );
}

/**
 * Restore pointer events on <body> whenever they were disabled without a live
 * layer to justify it. Returns a function that stops watching.
 */
export function installBodyPointerEventsGuard(): () => void {
  const body = document.body;
  if (!body) return () => {};

  const repair = () => {
    if (body.style.pointerEvents !== "none") return;
    if (hasLiveLayer()) return;
    body.style.pointerEvents = "";
  };

  const observer = new MutationObserver(repair);
  observer.observe(body, { attributes: true, attributeFilter: ["style"] });

  return () => observer.disconnect();
}
