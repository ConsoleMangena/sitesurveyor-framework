import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";
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

describe("NavUser", () => {
  it("renders inside standard desktop sidebar and opens dropup menu", async () => {
    const onProfile = vi.fn();
    const onLogout = vi.fn();

    render(
      <MemoryRouter>
        <SidebarProvider defaultOpen>
          <NavUser user={user} onProfile={onProfile} onLogout={onLogout} />
        </SidebarProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: /Tapiwa Mangwenya/i });
    expect(button).toBeTruthy();

    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    const profileItem = await screen.findByRole("menuitem", { name: /Edit profile/i });
    expect(profileItem).toBeTruthy();
  });

  it("renders inside a mobile Sheet and menu items can be clicked", async () => {
    const onProfile = vi.fn();
    const onLogout = vi.fn();

    render(
      <MemoryRouter>
        <Sheet open={true}>
          <SheetContent side="left">
            <SidebarProvider defaultOpen>
              <NavUser user={user} onProfile={onProfile} onLogout={onLogout} />
            </SidebarProvider>
          </SheetContent>
        </Sheet>
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: /Tapiwa Mangwenya/i });
    expect(button).toBeTruthy();

    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    const profileItem = await screen.findByRole("menuitem", { name: /Edit profile/i });
    expect(profileItem).toBeTruthy();

    fireEvent.click(profileItem);
    expect(onProfile).toHaveBeenCalled();
  });
});
