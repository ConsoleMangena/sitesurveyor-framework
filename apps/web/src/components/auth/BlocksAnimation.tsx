import blocksSvg from "./blocks.svg?raw";

// Injected inline, not as an <img>, so the stylesheet can animate the SVG's groups by id.
export default function BlocksAnimation() {
  return (
    <div
      className="auth-blocks"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: blocksSvg }}
    />
  );
}