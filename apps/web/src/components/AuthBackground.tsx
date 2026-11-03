/**
 * AuthBackground
 *
 * The drafting board behind the auth sheet. Decorative only, fixed to the
 * viewport, and animated through `transform` alone so low-end devices never
 * relayout while the backdrop breathes.
 */
export default function AuthBackground() {
  return (
    <div className="auth-background" aria-hidden="true">
      <div className="auth-bg-grid" />
      <div className="auth-bg-scale" />
      <svg
        className="auth-bg-contours"
        viewBox="0 0 1200 800"
        preserveAspectRatio="none"
      >
        <path d="M-40 130C160 74 330 186 520 148 700 112 860 30 1240 96" />
        <path d="M-40 248C180 190 340 300 540 262 740 224 900 150 1240 214" />
        <path d="M-40 392C200 330 360 440 580 398 780 360 960 288 1240 344" />
        <path d="M-40 536C220 470 400 588 600 540 800 494 980 430 1240 486" />
        <path d="M-40 690C240 618 420 742 640 688 840 640 1020 574 1240 630" />
      </svg>
      <span className="auth-bg-tick auth-bg-tick--tl" />
      <span className="auth-bg-tick auth-bg-tick--tr" />
      <span className="auth-bg-tick auth-bg-tick--bl" />
      <span className="auth-bg-tick auth-bg-tick--br" />
      <div className="auth-bg-vignette" />
    </div>
  );
}
