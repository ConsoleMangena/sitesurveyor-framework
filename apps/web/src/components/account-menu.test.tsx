import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CreditCard } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import {
  AccountMenu,
  AccountMenuAvatar,
  AccountMenuItem,
} from "./account-menu";
import { initialsOf } from "@/lib/initials";
import { Button } from "@/components/ui/button";
import type { UiUser } from "@/features/workspace/types";

vi.mock("@/lib/hooks/useMyAvatar", () => ({ useMyAvatar: () => null }));

const user: UiUser = {
  id: "user-1",
  workspaceId: "ws-1",
  name: "Tapiwa Mangwenya",
  email: "tapiwa@feldsurvey.co.zw",
  company: "Feld Survey",
  accountType: "business",
  signupAccountType: null,
  isPlatformAdmin: false,
};

function renderMenu(overrides: Partial<UiUser> = {}) {
  return render(
    <MemoryRouter>
      <AccountMenu
        user={{ ...user, ...overrides }}
        onLogout={() => {}}
        trigger={
          <Button variant="ghost" size="icon" aria-label="User account menu">
            <AccountMenuAvatar user={{ ...user, ...overrides }} />
          </Button>
        }
      >
        <AccountMenuItem icon={CreditCard} label="Billing" onClick={() => {}} />
        <AccountMenuItem icon={CreditCard} label="Public market" to="/market" />
      </AccountMenu>
    </MemoryRouter>,
  );
}

/** Radix opens a dropdown menu on pointerdown, not click. */
function openMenu() {
  fireEvent.pointerDown(screen.getByRole("button", { name: "User account menu" }), {
    button: 0,
    ctrlKey: false,
  });
}

describe("initialsOf", () => {
  it("takes at most two letters and ignores extra whitespace", () => {
    expect(initialsOf("Tapiwa Mangwenya")).toBe("TM");
    expect(initialsOf("Nkosazina Dube Moyo")).toBe("ND");
    expect(initialsOf("Tapiwa")).toBe("T");
    expect(initialsOf("   ")).toBe("U");
  });
});

describe("AccountMenu", () => {
  it("stays out of the DOM until the trigger is opened", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();

    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("shows identity and account type in the header", async () => {
    renderMenu();
    openMenu();

    expect(await screen.findByText("Tapiwa Mangwenya")).toBeTruthy();
    expect(screen.getByText("tapiwa@feldsurvey.co.zw")).toBeTruthy();
    expect(screen.getByText("Business account")).toBeTruthy();
  });

  it("falls back to a no-email line when the account has none", async () => {
    renderMenu({ email: "" });
    openMenu();

    expect(await screen.findByText("No email")).toBeTruthy();
  });

  it("sizes row icons from the menu primitive and confirms sign out is destructive", async () => {
    renderMenu();
    openMenu();

    const billing = await screen.findByRole("menuitem", { name: "Billing" });
    expect(billing.className).toContain("[&_svg:not([class*='size-'])]:size-4");
    const iconClass = billing.querySelector("svg")?.getAttribute("class") ?? "";
    expect(iconClass).not.toMatch(/(?:size-|me-|mr-)/);

    const signOut = screen.getByRole("menuitem", { name: "Sign out" });
    expect(signOut.getAttribute("data-variant")).toBe("destructive");

    fireEvent.click(signOut);
    expect(
      await screen.findByText(/reconnect your wallet/i),
    ).toBeTruthy();
  });
});
