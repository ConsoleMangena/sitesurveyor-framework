import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  ClipboardCheck,
  Compass,
  FileCheck2,
  Map as MapIcon,
  Satellite,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import { PublicNavLinks } from "../../components/shared/PublicNavLinks.tsx";
import { PublicFooter } from "../../components/shared/PublicFooter.tsx";
import { ThemeToggle } from "../../components/theme/ThemeToggle.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

/** The job record's spine, as the workspace actually orders it. */
const WORKFLOW_STAGES = [
  { label: "Quote", note: "Line items, contacts" },
  { label: "Dispatch", note: "Jobs, crews, schedule" },
  { label: "Evidence", note: "Files, versions, digests" },
  { label: "Invoice", note: "Drawn from the record" },
  { label: "Settle", note: "USDC or prepaid card" },
];

const CAPABILITIES = [
  {
    icon: FileCheck2,
    title: "Evidence you can prove",
    note: "Versioned files in private storage, with wallet-signed SHA-256 anchors that show a document has not changed since it was written to Solana. Originals never leave the workspace.",
  },
  {
    icon: Compass,
    title: "AI that reads real records",
    note: "The assistant calls allowlisted tools against your workspace — summarise open quotes, flag missing assignments, prepare a quote and read back the record it saved.",
  },
  {
    icon: Satellite,
    title: "Earth observation, priced per AOI",
    note: "Enter a target coordinate and observation extent, pick the survey type, and get classified imagery draped over the basemap — priced by credit quote before launch.",
  },
  {
    icon: Store,
    title: "A market for the trade",
    note: "Hire instruments, find people, post jobs and training. Orders are wallet-signed, verified on chain, and only then completed and paid to the seller.",
  },
  {
    icon: Truck,
    title: "Transport that carries the work",
    note: "Runs and routes that move what you hire or buy, listed alongside the market so logistics are part of the job record rather than a phone call.",
  },
  {
    icon: Banknote,
    title: "Settlement, kept honest",
    note: "Solana USDC on the cluster you choose, or a prepaid card and mobile money rail. A pending payment is never shown as settled — the chain confirms it, not the UI.",
  },
];

/**
 * The signed-out landing page. It sells the mechanism, not a promise: one
 * viewport names the product's spine (quote → cash on one record), the
 * workflow band shows it as the workspace runs it, and the capability
 * sections carry only claims the product can demonstrate. No pricing (that is
 * undecided), no testimonials, no invented metrics.
 */
export default function LandingPage() {
  useDocumentTitle(`SiteSurveyor — the operating system for survey work`);
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
        {/* First viewport: the mechanism, in one measure. */}
        <section
          aria-labelledby="landing-heading"
          className="border-b border-border/70 bg-card"
        >
          <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
            <h1
              id="landing-heading"
              className="market-hero-title max-w-3xl text-balance text-foreground sm:text-4xl"
            >
              Run the whole survey job on one record
            </h1>
            <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
              SiteSurveyor is the operating system for survey work: quote, dispatch, evidence,
              invoice and settlement stay attached to the job they belong to — with file digests
              anchored on Solana so what you issue can be proven later.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="web3-btn web3-btn-primary min-h-11 px-4 text-sm"
              >
                Create an account
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/market"
                className="web3-btn min-h-11 px-4 text-sm"
              >
                Browse the market
              </Link>
              <span className="web3-mono text-xs text-muted-foreground max-sm:hidden">
                wallet · email · Google · GitHub
              </span>
            </div>
          </div>
        </section>

        {/* The workflow band: the product's own spine, drawn as a chain. */}
        <section
          aria-labelledby="workflow-heading"
          className="border-b border-border/70"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 id="workflow-heading" className="market-section-title text-foreground">
              From quote to cash, on one record
            </h2>
            <ol className="mt-7 grid gap-px overflow-hidden rounded-lg border border-border/60 sm:grid-cols-5">
              {WORKFLOW_STAGES.map((stage, index) => (
                <li
                  key={stage.label}
                  className="border-border/60 bg-card p-4 not-last:border-b max-sm:not-last:border-b sm:not-last:border-r"
                >
                  <p className="web3-mono text-[0.6875rem] text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold tracking-[-0.01em] text-foreground">
                    {stage.label}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {stage.note}
                  </p>
                </li>
              ))}
            </ol>
            <p className="mt-5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
              Time and expenses log against the project while the crew is still on site, files keep
              their versions, and the invoice is assembled from records instead of recollection.
            </p>
          </div>
        </section>

        {/* Capabilities: every claim demonstrable in the shipped product. */}
        <section
          aria-labelledby="capabilities-heading"
          className="border-b border-border/70 bg-card"
        >
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="capabilities-heading" className="market-section-title text-foreground">
              What the workspace does
            </h2>
            <div className="mt-9 grid gap-x-10 gap-y-10 sm:grid-cols-2">
              {CAPABILITIES.map(({ icon: Icon, title, note }) => (
                <div key={title} className="max-w-[52ch]">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-background"
                      aria-hidden="true"
                    >
                      <Icon className="size-4 text-foreground" />
                    </span>
                    <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust strip: the three things a cautious surveyor needs to know. */}
        <section aria-labelledby="trust-heading" className="border-b border-border/70">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <h2 id="trust-heading" className="market-section-title text-foreground">
              Private by default, honest about the chain
            </h2>
            <div className="mt-7 grid gap-8 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "Confidential off-chain",
                  note: "Original files and survey content stay in private workspace storage. Blockchain writes are explicit, minimal and yours.",
                },
                {
                  icon: BadgeCheck,
                  title: "Anchors prove integrity",
                  note: "A signed digest proves bytes have not changed — not authorship or accuracy. The product says so wherever an anchor appears.",
                },
                {
                  icon: ClipboardCheck,
                  title: "Networks are labelled",
                  note: "Devnet and sandbox are shown plainly in the app and in your wallet, and nothing is presented as settled before it is confirmed.",
                },
              ].map(({ icon: Icon, title, note }) => (
                <div key={title} className="max-w-[44ch]">
                  <div className="flex items-center gap-2.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                      {title}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{note}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Closing band: two doors, the same two CTAs, no invented urgency. */}
        <section aria-labelledby="start-heading">
          <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-[52ch]">
                <h2 id="start-heading" className="market-section-title text-foreground">
                  Start with the job, not the paperwork
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  Read the{" "}
                  <Link to="/help" className="font-medium text-foreground underline-offset-4 hover:underline">
                    help page
                  </Link>{" "}
                  to see how the workspace behaves, or the{" "}
                  <Link to="/journal" className="font-medium text-foreground underline-offset-4 hover:underline">
                    journal
                  </Link>{" "}
                  for why it is built this way.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link to="/login" className="web3-btn web3-btn-primary min-h-11 px-4 text-sm">
                  Create an account
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link to="/about" className="web3-btn min-h-11 px-4 text-sm">
                  <MapIcon className="size-4" aria-hidden="true" />
                  About the project
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
