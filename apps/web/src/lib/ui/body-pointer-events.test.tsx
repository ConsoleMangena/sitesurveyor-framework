import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { installBodyPointerEventsGuard } from "./body-pointer-events.ts";

/**
 * A row menu and a dialog are separate copies of the dismissable layer, each
 * with its own captured <body> pointer events. Opening the dialog while the
 * menu is still mounted makes the dialog capture "none", and closing it last
 * restores "none" for good — the page stops accepting clicks.
 */
function StackedModals() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setMenuOpen(true)}>
        open menu
      </button>
      {menuOpen ? (
        <DismissableLayer disableOutsidePointerEvents>
          <div>menu layer</div>
        </DismissableLayer>
      ) : null}

      <button type="button" onClick={() => setDialogOpen(true)}>
        open dialog
      </button>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogTitle>Anchor on Solana</DialogTitle>
        </DialogContent>
      </Dialog>

      <button type="button" onClick={() => setMenuOpen(false)}>
        close menu
      </button>
      <button type="button" onClick={() => setDialogOpen(false)}>
        close dialog
      </button>
    </div>
  );
}

const click = (label: string) => {
  const node = Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent === label,
  );
  if (!node) throw new Error(`No button labelled "${label}"`);
  fireEvent.click(node);
};

/** Let Radix's effects and the guard's observer run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

afterEach(() => {
  document.body.style.pointerEvents = "";
});

describe("body pointer events guard", () => {
  it("gives the pointer events back when the last modal closes", async () => {
    const cleanup = installBodyPointerEventsGuard();
    render(<StackedModals />);

    click("open menu");
    await settle();
    expect(document.body.style.pointerEvents).toBe("none");

    // The dialog opens while the menu still holds the pointer events.
    click("open dialog");
    await settle();
    click("close menu");
    await settle();
    click("close dialog");
    await settle();

    expect(document.body.style.pointerEvents).not.toBe("none");
    cleanup();
  });

  it("keeps the pointer events disabled while a modal is open", async () => {
    const cleanup = installBodyPointerEventsGuard();
    render(<StackedModals />);

    click("open dialog");
    await settle();
    expect(document.body.style.pointerEvents).toBe("none");

    click("close dialog");
    await settle();
    expect(document.body.style.pointerEvents).not.toBe("none");
    cleanup();
  });

  it("restores pointer events that were left disabled", async () => {
    const cleanup = installBodyPointerEventsGuard();

    document.body.style.pointerEvents = "none";
    await settle();

    expect(document.body.style.pointerEvents).toBe("");
    cleanup();
  });
});
