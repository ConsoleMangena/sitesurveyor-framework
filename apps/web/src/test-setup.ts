import "@testing-library/jest-dom/vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Polyfill ResizeObserver for jsdom (required by Radix ScrollArea)
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
