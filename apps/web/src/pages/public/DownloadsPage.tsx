import type { LucideIcon } from "lucide-react";
import { Command, Download, Monitor, Terminal } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicNavLinks } from "../../components/shared/PublicNavLinks.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

const DESKTOP_VERSION = "0.1.0";

/** Installer formats produced by `tauri build` (bundle.targets is "all"). */
const PLATFORMS: Array<{
  icon: LucideIcon;
  name: string;
  formats: string[];
  requires: string;
}> = [
  {
    icon: Monitor,
    name: "Windows",
    formats: [".exe (NSIS setup)", ".msi (installer)"],
    requires: "Windows 10 or later. WebView2 ships with Windows 11; the installer fetches it otherwise.",
  },
  {
    icon: Command,
    name: "macOS",
    formats: [".dmg (disk image)", ".app (bundle)"],
    requires: "Open the disk image and drag SiteSurveyor into Applications.",
  },
  {
    icon: Terminal,
    name: "Linux",
    formats: [".deb · .rpm · .AppImage"],
    requires: "Needs webkit2gtk, libayatana-appindicator and librsvg.",
  },
];

export default function DownloadsPage() {
  useDocumentTitle("Desktop downloads — SiteSurveyor");
  const user = useAuthStore((state) => state.user);

  return (
    <div className="web3-surface">
      <header className="web3-header">
        <div className="web3-header-inner">
          <span className="flex min-w-0 items-baseline gap-2">
            <Link to="/" aria-label="SiteSurveyor home" className="web3-brand">
              <img src="/logo.svg" alt="" className="web3-brand-logo" aria-hidden="true" />
              <span className="web3-brand-name">SiteSurveyor</span>
            </Link>
            <span className="web3-brand-sub hidden truncate sm:inline">/ Desktop</span>
          </span>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <PublicNavLinks />
            <ThemeToggle />
            <Link
              to={user ? "/" : "/login"}
              className="web3-btn web3-btn-primary shrink-0 whitespace-nowrap px-3 text-xs"
            >
              {user ? "Open workspace" : "Sign in"}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero + installers ────────────────────────────────────── */}
        <section aria-labelledby="downloads-heading" className="border-b border-border/70 bg-card">
          <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
            <h1
              id="downloads-heading"
              className="market-hero-title max-w-3xl text-balance text-foreground"
            >
              SiteSurveyor for your desktop
            </h1>
            <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              The same workspace as a native window — project workflows, file evidence, AI chat, the
              market and Solana payments, without a browser tab. Built with Tauri (Rust).
            </p>

            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {PLATFORMS.map(({ icon: Icon, name, formats, requires }) => (
                <li key={name} className="web3-panel">
                  <div className="web3-panel-header">
                    <span className="web3-stat-icon web3-stat-icon-cap" aria-hidden="true">
                      <Icon className="size-4" />
                    </span>
                    <h2 className="web3-panel-title">{name}</h2>
                  </div>
                  <div className="web3-panel-body">
                    {formats.map((format) => (
                      <p key={format} className="web3-mono text-xs text-foreground">
                        {format}
                      </p>
                    ))}
                    <p className="web3-tile-note mt-2 leading-relaxed">{requires}</p>
                  </div>
                  <div className="web3-panel-foot">
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                      <Download className="size-3.5" aria-hidden="true" />
                      Coming soon
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
              <span className="web3-status-inline">
                <span className="web3-live-dot" aria-hidden="true" />
                Version {DESKTOP_VERSION} · installers being packaged
              </span>
            </p>
          </div>
        </section>

        {/* ── Build from source ─────────────────────────────────────── */}
        <section
          aria-labelledby="build-heading"
          className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16"
        >
          <h2 id="build-heading" className="market-section-title text-balance text-foreground">
            Build it yourself today
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            Two commands from the repository root produce installers for the machine you are on.
            Requires Node 22.18+, Rust stable and the platform's build tooling — see{" "}
            <span className="web3-mono text-foreground">apps/desktop/README.md</span> for the full
            matrix.
          </p>
          <pre className="web3-mono mt-5 max-w-[65ch] overflow-x-auto rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-foreground">
            <code>{`npm --prefix apps/web install
npm --prefix apps/desktop install && npm --prefix apps/desktop run build`}</code>
          </pre>
          <p className="mt-3 max-w-[65ch] text-xs leading-relaxed text-muted-foreground">
            Output lands in{" "}
            <span className="web3-mono text-foreground">
              apps/desktop/src-tauri/target/release/bundle/
            </span>
            .
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={user ? "/" : "/signup"} className="web3-btn web3-btn-primary px-5">
              {user ? "Open your workspace" : "Create an account"}
            </Link>
            <Link to="/market" className="web3-btn px-5">
              Use it on the web
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-muted-foreground sm:px-6">
          <p>
            A product of <strong className="text-foreground">Eineva Incorporated</strong> · Desktop
            version {DESKTOP_VERSION}
          </p>
          <nav aria-label="Site links" className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/market" className="hover:text-foreground">
              Marketplace
            </Link>
            <Link to="/transport" className="hover:text-foreground">
              Transport
            </Link>
            <Link to="/downloads" className="hover:text-foreground" aria-current="page">
              Desktop
            </Link>
            <Link to="/journal" className="hover:text-foreground">
              Journal
            </Link>
            <Link to="/help" className="hover:text-foreground">
              Help
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
