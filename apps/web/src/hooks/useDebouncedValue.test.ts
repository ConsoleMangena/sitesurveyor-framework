import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue.ts";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("updates after the delay", () => {
    let value = "hello";
    const { result, rerender } = renderHook(() =>
      useDebouncedValue(value, 300),
    );

    value = "world";
    rerender();

    expect(result.current).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("world");
  });

  it("resets the timer on rapid changes", () => {
    let value = "a";
    const { result, rerender } = renderHook(() =>
      useDebouncedValue(value, 300),
    );

    value = "b";
    rerender();
    act(() => {
      vi.advanceTimersByTime(200);
    });

    value = "c";
    rerender();
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current).toBe("c");
  });
});
