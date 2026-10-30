import { useCallback, useState } from "react";

export function useDialogState(defaultOpen = false) {
  const [open, setOpenState] = useState(defaultOpen);
  const toggle = useCallback(() => setOpenState((prev) => !prev), []);
  const setOpen = useCallback((value: boolean) => setOpenState(value), []);
  return { open, toggle, setOpen };
}