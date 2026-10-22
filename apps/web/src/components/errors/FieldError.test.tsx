import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FieldError from "./FieldError.tsx";

describe("FieldError", () => {
  it("renders an associated inline alert", () => {
    render(<FieldError id="email-error">Email is required.</FieldError>);

    const error = screen.getByRole("alert");
    expect(error).toHaveAttribute("id", "email-error");
    expect(error).toHaveTextContent("Email is required.");
  });

  it("can opt out of live announcements", () => {
    render(<FieldError live={false}>Email is required.</FieldError>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Email is required.")).toBeInTheDocument();
  });
});
