import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "./alert-dialog.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./dialog.tsx";

describe("dialog primitive", () => {
  it("renders a square-cornered panel and shows the close button by default", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hello</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const panel = screen.getByRole("dialog");
    expect(panel.className).toContain("rounded-none");
    expect(panel.querySelector("button")).not.toBeNull();
  });

  it("hides the close button when showCloseButton is false", () => {
    render(
      <Dialog open>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>No close</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").querySelector("button")).toBeNull();
  });
});

describe("alert dialog primitive", () => {
  it("renders title, description and action buttons in a square panel", async () => {
    render(
      <AlertDialog open onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>The data will go.</AlertDialogDescription>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole("alertdialog").className).toContain("rounded-none");
    expect(screen.getByText("Delete?")).toBeTruthy();
    expect(screen.getByText("The data will go.")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
  });
});