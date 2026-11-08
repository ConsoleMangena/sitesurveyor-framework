import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useDocumentTitle } from "./useDocumentTitle.ts";

function Harness({ title }: { title: string }) {
  useDocumentTitle(title);
  return null;
}

afterEach(() => {
  cleanup();
  document.title = "SiteSurveyor";
});

describe("useDocumentTitle", () => {
  it("sets the tab title while mounted and restores the previous one after", () => {
    document.title = "SiteSurveyor";
    const view = render(<Harness title="Surveyor's Market | SiteSurveyor" />);
    expect(document.title).toBe("Surveyor's Market | SiteSurveyor");

    view.unmount();
    expect(document.title).toBe("SiteSurveyor");
  });

  it("follows the title when the route content changes", () => {
    const view = render(<Harness title="Invoice INV-0001 | SiteSurveyor" />);
    expect(document.title).toBe("Invoice INV-0001 | SiteSurveyor");

    view.rerender(<Harness title="Quote Q-0042 | SiteSurveyor" />);
    expect(document.title).toBe("Quote Q-0042 | SiteSurveyor");
  });
});
