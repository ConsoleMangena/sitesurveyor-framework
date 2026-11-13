import { describe, expect, it } from "vitest";

import { businessNavGroups } from "../business/navigation";
import { personalNavGroups } from "../personal/navigation";
import { isWorkspaceView } from "./types";

function navigationItems(groups: typeof personalNavGroups) {
  return groups.flatMap((group) => group.items);
}

describe("professional portfolio navigation", () => {
  it.each([
    ["personal", personalNavGroups],
    ["business", businessNavGroups],
  ])("adds a dedicated portfolio destination beside the %s dashboard", (_name, groups) => {
    const items = navigationItems(groups);
    const portfolio = items.find((item) => item.view === "portfolio");

    expect(portfolio).toMatchObject({
      view: "portfolio",
      label: "Professional Portfolio",
      icon: "person",
    });
    expect(items.indexOf(portfolio!)).toBe(items.findIndex((item) => item.view === "dashboard") + 1);
    expect(items.filter((item) => item.view === "portfolio")).toHaveLength(1);
  });

  it("accepts portfolio as a workspace deep link", () => {
    expect(isWorkspaceView("portfolio")).toBe(true);
  });
});
