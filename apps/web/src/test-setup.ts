import "@testing-library/jest-dom/vitest";
import { webcrypto } from "node:crypto";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea)
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// jsdom exposes no SubtleCrypto; file hashing and anchor manifests need it.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: webcrypto as unknown as Crypto,
    configurable: true,
  });
}
