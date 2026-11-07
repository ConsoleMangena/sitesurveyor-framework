import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea)
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom implements no IntersectionObserver, and the plat's loop gate observes
// one on mount. Never reporting an entry leaves the plate treated as visible,
// which is the state a mounted component is under in a test.
class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

globalThis.IntersectionObserver =
  IntersectionObserverMock as unknown as typeof IntersectionObserver;

// jsdom exposes no SubtleCrypto; file hashing and anchor manifests need it.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto as unknown as Crypto,
    configurable: true,
  });
}

// jsdom exposes no matchMedia, and media-gated effects (the plat's hover row
// aim, Radix's responsive parts) call it on mount. Report "no fine pointer" so
// hover-only behaviour stays inert under test. Guarded because suites that opt
// into `@vitest-environment node` run this setup without a DOM.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((media: string) => ({
    media,
    matches: false,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
