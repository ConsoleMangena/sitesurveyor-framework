/**
 * AuthBackground
 *
 * Lightweight, mobile-friendly animated background for the auth screens.
 * Uses only transform / background-position animations and keeps the base
 * layer solid so low-end devices don't repaint the entire viewport.
 */
export default function AuthBackground() {
  return (
    <div className="auth-background" aria-hidden="true">
      <div className="auth-bg-network-lines" />
      <div className="auth-bg-grid-dots" />
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />
      <div className="auth-bg-vignette" />
    </div>
  );
}
