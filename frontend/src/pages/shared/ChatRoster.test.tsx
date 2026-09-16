import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatRoster } from "./ChatRoster.tsx";

const members = [
  { user_id: "a", full_name: "Alice", role: "manager", email: "a@test.com" },
  { user_id: "b", full_name: "Bob", role: "member", email: "b@test.com" },
] as any[];

const messages = [
  { id: "m1", user_id: "a", content: "Hello team", created_at: "2026-09-16T10:00:00Z" },
] as any[];

function roster(props: Partial<React.ComponentProps<typeof ChatRoster>> = {}) {
  return (
    <ChatRoster
      members={members}
      messages={messages}
      onJump={vi.fn()}
      search=""
      onSearchChange={vi.fn()}
      highlightedId={null}
      {...props}
    />
  );
}

describe("ChatRoster", () => {
  it("renders member names and search input", () => {
    render(roster());
    expect(screen.getByPlaceholderText("Search team...")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("filters members when search is set", () => {
    render(roster({ search: "bob" }));
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("calls onJump with message id when entry clicked", async () => {
    const onJump = vi.fn();
    render(roster({ onJump }));
    await userEvent.click(screen.getByRole("button", { name: /Alice/i }));
    expect(onJump).toHaveBeenCalledWith("m1");
  });

  it("shows 'No messages yet' for members without messages", () => {
    render(roster());
    expect(screen.getByText("No messages yet")).toBeInTheDocument();
  });
});
