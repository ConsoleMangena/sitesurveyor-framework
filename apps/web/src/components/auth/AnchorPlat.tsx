/**
 * THESIS: the left half of the auth sheet is the run this product actually
 * performs — a file cut into chunks, each hashed, one Memo v3 sealing the
 * manifest into a block — drawn as a plat of record so signing in sits on the
 * same sheet as the work it protects.
 * OWN-WORLD: the drafting sheet is fixed: double neat line, coordinate grid,
 * ruled schedule, mono title block, benchmark mark, tie line to a known point.
 * Ink discipline is unchanged — 1px rules, one red for the primary action and
 * the one sealed block.
 * STORY: the surveyor is the signer. Nothing here runs itself: the agent has no
 * chain tools, so the plate shows the operation a wallet authorises, not a
 * bot performing it.
 * FIRST VIEWPORT: source object → split → the chunk schedule with its per-chunk
 * SHA-256 → manifest.json → one benchmarked block, slot and signature tied back
 * to the file. Rows ink as they are cut; the seal is the one authored moment.
 * FORM: real arithmetic and the product's own memo builder; the digests are a
 * specimen run and the cartouche says so.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 * finish review, the verdict, and DESIGN.md
 */
import { useEffect, useRef, type CSSProperties } from "react";
import {
  DEFAULT_FULL_FILE_CHUNK_SIZE,
  buildFullFileAnchorMemo,
} from "../../features/phantom/anchor/fullFileAnchor.ts";
import {
  SOLANA_CLUSTER,
  SOLANA_CLUSTER_LABEL,
} from "../../features/phantom/lib/config.ts";

/* ── The specimen run ─────────────────────────────────────── */

/** A 1.81 MiB GPR line: seven full chunks and one remainder, so the plate
 *  shows the real split rather than an even division. */
const FILE_SIZE = 1_900_000;
const FILE_NAME = "LINE-07_GPR.DZ4";
const ATTACHMENT_ID = "9c4f2b71-6d0a-4e58-8f3c-7a1b5d90e2a1";

const CHUNK_COUNT = Math.ceil(FILE_SIZE / DEFAULT_FULL_FILE_CHUNK_SIZE);

const CHUNK_SIZES = Array.from({ length: CHUNK_COUNT }, (_, index) =>
  Math.min(
    DEFAULT_FULL_FILE_CHUNK_SIZE,
    FILE_SIZE - index * DEFAULT_FULL_FILE_CHUNK_SIZE,
  ),
);

/** Invented digests over invented bytes. They are well-formed SHA-256 hex so
 *  the plate reads at the right density; the stamp says they are a specimen. */
const FILE_HASH =
  "3f2a9c417d0b5e28a1c6f904d3be72158e04c6af91d2b730f5a8e14602c9db73";
const MANIFEST_HASH =
  "b7d1e09342ac68f5de3017b9c5a4620e18ff734da09cb2e67531d8faecb46012";

const CHUNK_HASHES: readonly string[] = [
  "0c94fbee5a37612de2b8490cf713ad456d0e28c3b95a71f044c6de98a13b0f72",
  "91ea45d0f3c8207b6ba7e144d0953cfae4f180b6c72d53910af6e8c25b3d7419",
  "d630f81ae9b74c05a44e2c9d17f3b0e6ce5a81d90b26f4a3f81d7ec42a93506b",
  "5ce81b63d7a04f19f2b9e05446c31ad8a8d570e2fe04c39bc91a2b65d3f80417",
  "72af40c9be15d638c03875ea9d2c1fb4e5b60a7d3148ce90fca7d21605e9b38a",
  "ef9130d7b246a58c14c7ef30d802b6e1a3f9475d5c1be0c80d6af2e3f1749b20",
  "2b8e51d9c60af347e7d1b092fa3c546890de7b2c13fa8045e6c92db7f410a35c",
  "a4d70c82f39b156e07cd84ba62f913e5d40c8a7b96e153f02db8c4a70e6513fd",
];

const TX_SLOT = "412 883 106";
const TX_SIGNATURE = "5TqkF3vN7cHa2M9dR4pW8sK1bY6xL3jQ5uE9gA2mP7oC4iS6dR8bX";

/* ── The drawn sheet ──────────────────────────────────────── */

const SHEET = { w: 120, h: 150 } as const;
const TABLE = { left: 14, right: 106, headTop: 44, headH: 6, rowTop: 50, pitch: 6.5 } as const;
const COL_KEY = 43;
const COL_HASH = 80;
/** The schedule's foot follows from the file's arithmetic, not a drawn number. */
const TABLE_BOTTOM = TABLE.rowTop + CHUNK_COUNT * TABLE.pitch;
const SEAL = { x: 60, y: 128 } as const;

/** The tie line: from the sealed block up the left margin back to the file it
 *  verifies, the way a plat ties its recovered corner to a known monument. */
const TIE_PATH = `M${SEAL.x} ${SEAL.y} H11 V24.5 H38`;

/** The re-survey band travels the schedule on the table's own arithmetic: one
 *  pitch per chunk, head to foot — so a file with more chunks is swept longer,
 *  not swept faster. */
const SWEEP = {
  from: TABLE.rowTop,
  to: TABLE.rowTop + CHUNK_COUNT * TABLE.pitch,
} as const;

const MEMO = buildFullFileAnchorMemo(
  ATTACHMENT_ID,
  FILE_HASH,
  MANIFEST_HASH,
  CHUNK_COUNT,
);

/* ── Formatting ───────────────────────────────────────────── */

function groupHex(hash: string, groups: number) {
  return Array.from({ length: groups }, (_, i) =>
    hash.slice(i * 4, i * 4 + 4),
  ).join("\u2009");
}

function formatBytes(value: number) {
  return `${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u2009")} B`;
}

function truncateMiddle(value: string, edge: number) {
  return value.length <= edge * 2 ? value : `${value.slice(0, edge)}\u2026${value.slice(-edge)}`;
}

function truncateTail(value: string, edge: number) {
  return value.length <= edge ? value : `${value.slice(0, edge)}\u2026`;
}

/** The memo as it goes on chain, shortened for a plate. The segments and the
 *  `sha256:` marker keep their real order, so the string still reads as the
 *  product's own format. */
function displayMemo(memo: string) {
  const [version, attachmentId, algo, fileHash, manifestHash, count] =
    memo.split(":");
  return [
    version,
    truncateMiddle(attachmentId, 4),
    algo,
    truncateTail(fileHash, 10),
    truncateTail(manifestHash, 10),
    count,
  ].join(":");
}

const digestReadout = (tag: string, hash: string) =>
  `${tag} ${groupHex(hash, 4)}\u2026`;

export default function AnchorPlat() {
  const figureRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const readoutRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const figure = figureRef.current;
    const svg = svgRef.current;
    if (!figure || !svg) return;
    // The readout that would answer a hover is hidden on a touch pointer, so
    // there is nothing for the aim to do there.
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let queued = 0;

    const onMove = (event: PointerEvent) => {
      if (queued) return;
      const { clientX, clientY } = event;
      queued = requestAnimationFrame(() => {
        queued = 0;
        const box = figure.getBoundingClientRect();
        // The sheet is letterboxed inside the figure by `meet`, so the row
        // lookup happens on the drawn table, not on the figure.
        const scale = Math.min(box.width / SHEET.w, box.height / SHEET.h);
        const ux = (clientX - box.left - (box.width - SHEET.w * scale) / 2) / scale;
        const uy = (clientY - box.top - (box.height - SHEET.h * scale) / 2) / scale;

        const row = Math.floor((uy - TABLE.rowTop) / TABLE.pitch);
        const inside =
          row >= 0 &&
          row < CHUNK_COUNT &&
          ux >= TABLE.left &&
          ux <= TABLE.right;

        if (!inside) {
          figure.classList.remove("is-aimed");
          return;
        }

        svg.style.setProperty("--hl", `${TABLE.rowTop + row * TABLE.pitch}px`);
        if (readoutRef.current) {
          readoutRef.current.textContent = digestReadout(
            String(row).padStart(6, "0"),
            CHUNK_HASHES[row],
          );
        }
        figure.classList.add("is-aimed");
      });
    };

    const onHide = () => figure.classList.remove("is-aimed");

    figure.addEventListener("pointermove", onMove);
    figure.addEventListener("pointerleave", onHide);
    return () => {
      figure.removeEventListener("pointermove", onMove);
      figure.removeEventListener("pointerleave", onHide);
      if (queued) cancelAnimationFrame(queued);
    };
  }, []);

  // The plate loops quietly behind the form, so it must not loop when nobody
  // can see it: off screen, or behind another tab, the cycle holds its place.
  useEffect(() => {
    const figure = figureRef.current;
    if (!figure) return;

    let offscreen = false;
    const apply = () => figure.classList.toggle("is-idle", offscreen || document.hidden);

    const watcher = new IntersectionObserver(
      ([entry]) => {
        offscreen = !entry.isIntersecting;
        apply();
      },
      { threshold: 0.05 },
    );
    watcher.observe(figure);
    document.addEventListener("visibilitychange", apply);

    return () => {
      watcher.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return (
    <>
      <div
        className="auth-plat-figure"
        ref={figureRef}
        style={
          {
            "--auth-sweep-from": `${SWEEP.from}px`,
            "--auth-sweep-to": `${SWEEP.to}px`,
          } as CSSProperties
        }
      >
        <svg
          className="auth-plat-svg"
          ref={svgRef}
          viewBox="0 0 120 150"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="auth-plat-minor"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <path d="M6 0H0v6" fill="none" stroke="currentColor" strokeWidth="0.14" />
            </pattern>
            <pattern
              id="auth-plat-major"
              width="30"
              height="30"
              patternUnits="userSpaceOnUse"
            >
              <path d="M30 0H0v30" fill="none" stroke="currentColor" strokeWidth="0.3" />
            </pattern>
            <clipPath id="auth-plat-inner">
              <rect x="6" y="6" width="108" height="138" />
            </clipPath>
          </defs>

          {/* Neat line: the double rule every plat is drawn inside. */}
          <rect className="auth-plat-rule" x="3" y="3" width="114" height="144" />
          <rect
            className="auth-plat-rule auth-plat-rule--inner"
            x="6"
            y="6"
            width="108"
            height="138"
          />

          <g clipPath="url(#auth-plat-inner)">
            <rect
              className="auth-plat-grid-minor"
              x="6"
              y="6"
              width="108"
              height="138"
              fill="url(#auth-plat-minor)"
            />
            <rect
              className="auth-plat-grid-major"
              x="6"
              y="6"
              width="108"
              height="138"
              fill="url(#auth-plat-major)"
            />

            <g className="auth-plat-ink auth-plat-ink--sheet">
              <text className="auth-plat-cap" x="10" y="14">
                PLAN OF ANCHOR RUN
              </text>
              <text className="auth-plat-micro" x="110" y="14" textAnchor="end">
                SHEET 1 OF 1
              </text>
              <path className="auth-plat-line" d="M10 17H110" />
            </g>

            {/* The file the run starts from. */}
            <g className="auth-plat-ink auth-plat-ink--object">
              <rect
                className="auth-plat-fill auth-plat-fill--object"
                x="38"
                y="20"
                width="44"
                height="9"
              />
              <text className="auth-plat-micro" x="60" y="25.6" textAnchor="middle">
                SOURCE OBJECT
              </text>
              <text className="auth-plat-micro" x="60" y="33.4" textAnchor="middle">
                {`${FILE_NAME} · ${formatBytes(FILE_SIZE)}`}
              </text>
            </g>

            {/* The split, into the schedule below it. */}
            <g className="auth-plat-ink auth-plat-ink--split">
              <path className="auth-plat-line" d={`M60 35.5 V${TABLE.headTop}`} />
              <text className="auth-plat-micro" x="63" y="42">
                {`\u2264${formatBytes(DEFAULT_FULL_FILE_CHUNK_SIZE)}`}
              </text>
            </g>

            {/* The chunk schedule: a plat's schedule of monuments, with the
                real columns this run produces. */}
            <g className="auth-plat-ink auth-plat-ink--table">
              <path
                className="auth-plat-frame"
                d={`M${TABLE.left} ${TABLE.headTop}H${TABLE.right}V${TABLE_BOTTOM}H${TABLE.left}Z`}
              />
              <path
                className="auth-plat-frame"
                d={`M${TABLE.left} ${TABLE.headTop + TABLE.headH}H${TABLE.right}`}
              />
              <path
                className="auth-plat-frame"
                d={`M${COL_KEY} ${TABLE.headTop}V${TABLE_BOTTOM}M${COL_HASH} ${TABLE.headTop}V${TABLE_BOTTOM}`}
              />
              <text className="auth-plat-micro" x="16.4" y="48.4">
                CHUNK
              </text>
              <text className="auth-plat-micro" x={COL_KEY + 2.4} y="48.4">
                SHA-256 OF PLAINTEXT
              </text>
              <text className="auth-plat-micro" x={TABLE.right - 2.4} y="48.4" textAnchor="end">
                BYTES
              </text>
            </g>

            <rect className="auth-plat-hl" x={TABLE.left} y="0" width={TABLE.right - TABLE.left} height={TABLE.pitch} />

            {/* The same band, running unaimed: one pitch per chunk in file
                order, so the loop reads as a re-survey rather than a shimmer. */}
            <g className="auth-plat-sweep">
              <rect
                x={TABLE.left}
                y="0"
                width={TABLE.right - TABLE.left}
                height={TABLE.pitch}
              />
              <path className="auth-plat-line" d={`M${TABLE.left} 0H${TABLE.right}`} />
            </g>

            {CHUNK_SIZES.map((size, index) => (
              <g
                key={index}
                className="auth-plat-ink"
                style={{ animationDelay: `${0.62 + index * 0.08}s` }}
              >
                {index > 0 && (
                  <path
                    className="auth-plat-hair"
                    d={`M${TABLE.left} ${TABLE.rowTop + index * TABLE.pitch}H${TABLE.right}`}
                  />
                )}
                <text
                  className="auth-plat-label"
                  x="16.4"
                  y={TABLE.rowTop + index * TABLE.pitch + TABLE.pitch / 2 + 1.1}
                >
                  {`chunk-${String(index).padStart(6, "0")}`}
                </text>
                <text
                  className="auth-plat-label auth-plat-label--dim"
                  x={COL_KEY + 2.4}
                  y={TABLE.rowTop + index * TABLE.pitch + TABLE.pitch / 2 + 1.1}
                >
                  {`${CHUNK_HASHES[index].slice(0, 14)}\u2026`}
                </text>
                <text
                  className="auth-plat-label"
                  x={TABLE.right - 2.4}
                  y={TABLE.rowTop + index * TABLE.pitch + TABLE.pitch / 2 + 1.1}
                  textAnchor="end"
                >
                  {formatBytes(size)}
                </text>
              </g>
            ))}

            {/* The manifest every digest is packed into. */}
            <g className="auth-plat-ink auth-plat-ink--manifest">
              <path className="auth-plat-line" d={`M60 ${TABLE_BOTTOM}V108`} />
              <rect className="auth-plat-fill" x="42" y="108" width="36" height="9" />
              <text className="auth-plat-micro" x="60" y="113.6" textAnchor="middle">
                manifest.json
              </text>
              <path className="auth-plat-line" d={`M60 117V${SEAL.y - 3.4}`} />
            </g>

            {/* The tie line back to the file this block verifies. */}
            <path
              className="auth-plat-tie"
              d={TIE_PATH}
              pathLength={1}
              fill="none"
            />
            <path
              className="auth-plat-tie--trace"
              d={TIE_PATH}
              pathLength={1}
            />

            {/* The sealed block: the only red on this half of the sheet. */}
            <g className="auth-plat-seal">
              <circle className="auth-plat-ring" cx={SEAL.x} cy={SEAL.y} r="5.4" />
              <path
                className="auth-plat-mark"
                d={`M${SEAL.x - 2.8} ${SEAL.y - 2.8}h5.6v5.6h-5.6z`}
              />
              <path
                className="auth-plat-mark"
                d={`M${SEAL.x - 2.8} ${SEAL.y}h5.6M${SEAL.x} ${SEAL.y - 2.8}v5.6`}
              />
              <circle className="auth-plat-seal-dot" cx={SEAL.x} cy={SEAL.y} r="1.7" />
            </g>

            <g className="auth-plat-ink auth-plat-ink--read">
              <text className="auth-plat-label" x="68" y={SEAL.y - 1.6}>
                {`SLOT ${TX_SLOT}`}
              </text>
              <text className="auth-plat-micro" x="68" y={SEAL.y + 3.2}>
                {`SIG ${truncateMiddle(TX_SIGNATURE, 6)}`}
              </text>
              <text className="auth-plat-micro" x="10" y="141">
                {`TIED TO SOURCE \u00B7 ${SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER].toUpperCase()}`}
              </text>
            </g>
          </g>
        </svg>
      </div>

      <div className="auth-plat-block">
        <p className="auth-plat-stamp">
          Specimen run — records invented, mechanics real
        </p>
        <dl className="auth-plat-fields">
          <div className="auth-plat-field--version">
            <dt>Version</dt>
            <dd>ssv2</dd>
          </div>
          <div>
            <dt>Chunks</dt>
            <dd>
              {CHUNK_COUNT}
              {" \u00B7 "}
              {DEFAULT_FULL_FILE_CHUNK_SIZE / 1024} KiB
            </dd>
          </div>
          <div>
            <dt>Cluster</dt>
            <dd>{SOLANA_CLUSTER_LABEL[SOLANA_CLUSTER]}</dd>
          </div>
          <div className="auth-plat-field--readout">
            <dt>SHA-256</dt>
            <dd>
              <span ref={readoutRef}>{digestReadout("FILE", FILE_HASH)}</span>
            </dd>
          </div>
        </dl>
      </div>

      <p className="auth-plat-memo">
        <span className="auth-plat-memo-label">Memo v3</span>
        <span className="auth-plat-memo-text">{displayMemo(MEMO)}</span>
      </p>
    </>
  );
}
