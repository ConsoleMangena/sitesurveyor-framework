import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDialogState } from "./useDialogState.ts";

describe("useDialogState", () => {
  it("starts closed and toggles", () => {
    const { result } = renderHook(() => useDialogState());
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });
});