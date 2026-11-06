import type { WorkspaceNavItem, WorkspaceNavGroup } from "../workspace/types.ts";
import type { ExtensionEntry } from "./types.ts";

/**
 * Nav groups built from the extensions a workspace has switched on.
 *
 * This is where an extension earns its place in the sidebar: nothing is
 * injected unless the extension declares a view and is installed and enabled,
 * so a disabled extension leaves no dead entry behind. The command palette and
 * the jump-to search read the same groups, so they stay in step.
 */
export function extensionNavGroups(entries: ExtensionEntry[]): WorkspaceNavGroup[] {
  const groups = new Map<string, WorkspaceNavItem[]>();

  for (const entry of entries) {
    const contributes = entry.manifest.contributes;
    if (!contributes) continue;
    if (!entry.state.installed || !entry.state.enabled) continue;
    const items = groups.get(contributes.group) ?? [];
    items.push({
      view: contributes.view,
      label: contributes.label,
      icon: contributes.icon,
    });
    groups.set(contributes.group, items);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}
