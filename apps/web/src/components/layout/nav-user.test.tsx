import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LayoutProvider } from "@/context/layout-provider";
import { FontProvider } from "@/context/font-provider";
import * as useMobileHook from "@/hooks/use-mobile";
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
    vi.spyOn(useMobileHook, "useIsMobile").mockReturnValue(false);
    const onProfile = vi.fn();
    const onLogout = vi.fn();

    render(
      <MemoryRouter>
        <FontProvider>
          <LayoutProvider>
            <SidebarProvider defaultOpen>
              <NavUser user={user} onProfile={onProfile} onLogout={onLogout} />
            </SidebarProvider>
          </LayoutProvider>
        </FontProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: /Tapiwa Mangwenya/i });
    expect(button).toBeTruthy();

    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
    const profileItem = await screen.findByRole("menuitem", { name: /Edit profile/i });
    expect(profileItem).toBeTruthy();
  });

  it("renders on mobile, opens inline dropup with appearance controls, and handles clicks cleanly", async () => {
    vi.spyOn(useMobileHook, "useIsMobile").mockReturnValue(true);
    const onProfile = vi.fn();
    const onLogout = vi.fn();

    render(
      <MemoryRouter>
        <FontProvider>
          <LayoutProvider>
            <Sheet open={true}>
              <SheetContent side="left">
                <SidebarProvider defaultOpen>
                  <NavUser user={user} onProfile={onProfile} onLogout={onLogout} />
                </SidebarProvider>
              </SheetContent>
            </Sheet>
          </LayoutProvider>
        </FontProvider>
      </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: /Tapiwa Mangwenya/i });
    expect(button).toBeTruthy();

    // In mobile mode, tapping the button directly toggles the inline dropup
    fireEvent.click(button);

    // Verify dropup is mounted inside sheet DOM
    expect(screen.getByTestId("mobile-user-dropup")).toBeTruthy();
    expect(screen.getByText("Appearance")).toBeTruthy();

    // Verify Edit profile button is clickable and triggers handler
    const profileButton = screen.getByRole("button", { name: /Edit profile/i });
    expect(profileButton).toBeTruthy();
    fireEvent.click(profileButton);
    expect(onProfile).toHaveBeenCalled();
  });
});
