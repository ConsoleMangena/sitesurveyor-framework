import MobileProjectsPlaceholder from "./MobileProjectsPlaceholder.tsx";

/**
 * Stub replacement for the heavy CadWorkspace.
 *
 * Used by the build step when CAD is disabled for a target platform. It keeps the
 * project workspace usable while omitting the Three.js / WASM CAD chunk from
 * the bundle.
 */
export default function CadWorkspaceStub() {
  return <MobileProjectsPlaceholder />;
}
