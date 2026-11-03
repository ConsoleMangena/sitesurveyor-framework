import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AuthShell, { AuthTerms } from "./AuthShell";

function renderShell(
  props: Partial<React.ComponentProps<typeof AuthShell>> = {},
) {
  return render(
    <MemoryRouter>
      <AuthShell {...props}>Card body</AuthShell>
    </MemoryRouter>,
  );
}

describe("AuthShell", () => {
  it("renders the brand block, page heading, children and footer", () => {
    renderShell({
      title: "Welcome back to the field.",
      description: "Sign in to your SiteSurveyor account.",
      footer: <AuthTerms />,
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "SiteSurveyor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Welcome back to the field." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sign in to your SiteSurveyor account."),
    ).toBeInTheDocument();
    expect(screen.getByText("Card body")).toBeInTheDocument();
    expect(
      screen.getByText(/By continuing you agree to SiteSurveyor's terms/i),
    ).toBeInTheDocument();
  });

  it("keeps the public-market escape hatch and theme toggle", () => {
    renderShell();

    const marketLink = screen.getByRole("link", { name: /public market|home/i });
    expect(marketLink).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("button", { name: /switch to (light|dark) theme/i }),
    ).toBeInTheDocument();
  });

  it("hides the brand wordmark when showBrand is false but keeps title and description", () => {
    renderShell({
      showBrand: false,
      title: "Continue with wallet.",
      description: "Pick a wallet to continue.",
    });

    expect(
      screen.queryByRole("heading", { level: 1, name: "SiteSurveyor" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Continue with wallet." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pick a wallet to continue.")).toBeInTheDocument();
    expect(screen.getByText("Card body")).toBeInTheDocument();
  });

  it("omits the footer when none is supplied", () => {
    renderShell();
    expect(screen.queryByText(/terms and privacy policy/i)).not.toBeInTheDocument();
  });

  it("renders terms copy as a standalone element", () => {
    render(
      <MemoryRouter>
        <AuthTerms />
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "By continuing you agree to SiteSurveyor's terms and privacy policy.",
      ),
    ).toBeInTheDocument();
  });
});
