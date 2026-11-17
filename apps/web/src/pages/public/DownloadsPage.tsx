import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Apple, Download, HardDriveDownload, Monitor, Terminal } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { PublicHero } from "../../components/shared/PublicHero.tsx";
import { usePublicMeta } from "../../hooks/usePublicMeta.ts";
import {
  RELEASES_PAGE_URL,
  useLatestRelease,
  type ReleaseAsset,
} from "../../hooks/useLatestRelease.ts";
import { breadcrumbJsonLd } from "../../lib/seo/meta.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

const MB = 1024 * 1024;

function formatSize(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The NSIS setup wizard is the one most users want; the MSI suits managed fleets. */
function findAsset(assets: ReleaseAsset[], suffix: string): ReleaseAsset | undefined {
  return assets.find((asset) => asset.name.toLowerCase().endsWith(suffix));
}

/** Honest per-platform copy: only Windows ships an installer today. */
const PLATFORMS: Array<{
  icon: LucideIcon;
  name: string;
  requires: string;
}> = [
  {
    icon: Monitor,
    name: "Windows",
    requires: "Windows 10 or later, 64-bit. The installer fetches any missing system component.",
  },
  {
    icon: Apple,
    name: "macOS",
    requires: "No packaged installer yet. Run the same shell from source until one ships.",
  },
  {
    icon: Terminal,
    name: "Linux",
    requires: "No packaged installer yet. Run the same shell from source until one ships.",
  },
];

function DownloadButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="web3-btn web3-btn-primary inline-flex items-center gap-2 px-4 text-sm"
    >
      <Download className="size-4" aria-hidden="true" />
      {children}
    </a>
  );
}

export default function DownloadsPage() {
  usePublicMeta("/downloads", {
    jsonLd: (origin) =>
      breadcrumbJsonLd(origin, [
        { name: "Home", path: "/" },
        { name: "Downloads", path: "/downloads" },
      ]),
  });
  const user = useAuthStore((state) => state.user);
  const latest = useLatestRelease();

  const release = latest.state === "ready" ? latest.release : null;
  const setup = release ? findAsset(release.assets, "-setup.exe") : undefined;
  const msi = release ? findAsset(release.assets, ".msi") : undefined;

  return (
    <PublicPage section="Desktop">
        <PublicHero
          id="downloads-heading"
          title="SiteSurveyor for your desktop"
          description="The same workspace as a native window: project workflows, file evidence, AI chat, the market and Solana payments, without a browser tab."
          image="scanning"
        >
          <ul className="grid gap-4 sm:grid-cols-3">
            {PLATFORMS.map(({ icon: Icon, name, requires }) => (
              <li key={name} className="web3-panel">
                <div className="web3-panel-header">
                  <span className="web3-stat-icon web3-stat-icon-cap" aria-hidden="true"><Icon className="size-4" /></span>
                  <h2 className="web3-panel-title">{name}</h2>
                </div>
                <div className="web3-panel-body">
                  <p className="web3-tile-note leading-relaxed">{requires}</p>
                  {name === "Windows" ? (
                    <div className="mt-3 flex flex-col items-start gap-2">
                      {setup && msi ? (
                        <>
                          <DownloadButton href={setup.url}>
                            Download installer (.exe) · {formatSize(setup.size)}
                          </DownloadButton>
                          <a
                            href={msi.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="web3-mono text-xs text-foreground underline underline-offset-4 hover:no-underline"
                          >
                            MSI for managed fleets ({formatSize(msi.size)})
                          </a>
                        </>
                      ) : latest.state === "loading" ? (
                        <button
                          type="button"
                          disabled
                          className="web3-btn web3-btn-primary inline-flex items-center gap-2 px-4 text-sm"
                        >
                          <HardDriveDownload className="size-4" aria-hidden="true" />
                          Checking the latest release…
                        </button>
                      ) : (
                        <DownloadButton href={RELEASES_PAGE_URL}>
                          Download from the releases page
                        </DownloadButton>
                      )}
                    </div>
                  ) : (
                    <a
                      href="#build-heading"
                      className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary underline underline-offset-4 hover:no-underline"
                    >
                      Build it from source
                    </a>
                  )}
                </div>
                <div className="web3-panel-foot">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    {name === "Windows"
                      ? "Signed installers from GitHub Releases"
                      : "Same account as the web app"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="web3-status-inline">
              <span className="web3-live-dot" aria-hidden="true" />
              {release
                ? `Latest release ${release.tag} · ${formatDate(release.publishedAt)} · every installer and the web bundle on the releases page`
                : latest.state === "loading"
                  ? "Checking the latest release…"
                  : "Installers live on the GitHub releases page"}
            </span>
            {release ? (
              <a
                href={release.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:no-underline"
              >
                View the release
              </a>
            ) : (
              <a
                href={RELEASES_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:no-underline"
              >
                View all releases
              </a>
            )}
          </p>
        </PublicHero>

        {/* ── Build from source ─────────────────────────────────────── */}
        <section
          aria-labelledby="build-heading"
          className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16"
        >
          <h2 id="build-heading" className="market-section-title text-balance text-foreground">
            Build it yourself
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            Two commands from the repository root produce installers for the machine you are on,
            including the macOS and Linux bundles that are not packaged for download yet.
            Prerequisites and the full platform matrix are in{" "}
            <span className="web3-mono text-foreground">apps/desktop/README.md</span>.
          </p>
          <pre className="web3-mono mt-5 max-w-[65ch] overflow-x-auto rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-foreground">
            <code>{`npm --prefix apps/web install
npm --prefix apps/desktop install && npm --prefix apps/desktop run build`}</code>
          </pre>
          <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
            Installers land in the bundle output under{" "}
            <span className="web3-mono text-foreground">apps/desktop</span>
            ; the README lists the exact path for each platform.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={user ? "/workspace" : "/signup"} className="web3-btn web3-btn-primary px-5">
              {user ? "Open your workspace" : "Create an account"}
            </Link>
            <Link to="/market" className="web3-btn px-5">
              Use it on the web
            </Link>
          </div>
        </section>
    </PublicPage>
  );
}
