import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuthStore } from "../lib/auth/auth-store";
import type { UiUser } from "../features/workspace/types";

function fakeUser(): UiUser {
  return {
    id: "user-1",
    workspaceId: "ws-1",
    name: "Sam Ranger",
    email: "sam@example.com",
    company: "Independent Surveyor",
    accountType: "personal",
    signupAccountType: "personal",
    isPlatformAdmin: false,
  } as unknown as UiUser;
}

function renderRoutes() {
  return render(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route element={<ProtectedRoute allowPendingOnboarding />}>
          <Route path="/onboarding" element={<div>Onboarding outlet</div>} />
        </Route>
        <Route path="/login" element={<div>Sign in screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isLoading: false,
      pendingOnboarding: false,
    });
  });

  it("bounces an anonymous visitor to the sign-in page", () => {
    renderRoutes();
    expect(screen.getByText("Sign in screen")).toBeInTheDocument();
    expect(screen.queryByText("Onboarding outlet")).toBeNull();
  });

  it("admits a provider signup that still owes the onboarding survey", () => {
    useAuthStore.setState({ pendingOnboarding: true });
    renderRoutes();
    expect(screen.getByText("Onboarding outlet")).toBeInTheDocument();
  });

  it("still admits a fully mapped user", () => {
    useAuthStore.setState({ user: fakeUser() });
    renderRoutes();
    expect(screen.getByText("Onboarding outlet")).toBeInTheDocument();
  });

  it("shows nothing while the initial session check is running", () => {
    useAuthStore.setState({ isLoading: true });
    const { container } = renderRoutes();
    expect(container).toBeEmptyDOMElement();
  });
});
