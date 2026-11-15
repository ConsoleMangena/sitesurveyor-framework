import { Link } from "react-router-dom";
import {
  Blocks,
  Cpu,
  FileCheck2,
  FolderKanban,
  Languages,
  LayoutGrid,
  Leaf,
  Map as MapIcon,
  Scale,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { PublicHero } from "../../components/shared/PublicHero.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";
import { useAuthStore } from "../../lib/auth/auth-store.ts";

const APP_VERSION = "2.0";

/** The platform's pillars, straight from the product brief. */
const PILLARS = [
  {
    icon: FolderKanban,
    title: "One continuous record",
    note: "Plan the job, price the quote, dispatch the crew, collect the evidence, invoice the client — every record stays attached to the project it belongs to.",
  },
  {
    icon: FileCheck2,
    title: "Evidence you can prove",
    note: "A file manager with versions and soft delete, plus wallet-signed SHA-256 digests that show a document has not changed since it was anchored.",
  },
  {
    icon: Sparkles,
    title: "An assistant on your records",
    note: "SiteSurveyor AI reads and writes the same workspace data through an allowlisted tool set, so a question can turn into a verified action.",
  },
  {
    icon: Store,
    title: "The trade's own market",
    note: "Instruments, professionals, firms, jobs and training — with map discovery and on-chain payment — so demand and supply meet in one place.",
  },
];

/** What ships today, condensed from the project README. */
const CAPABILITIES = [
  {
    title: "Projects & teams",
    note: "Projects, jobs, clients, quotes, invoices, crew assignment, scheduling, time and expenses.",
  },
  {
    title: "Evidence",
    note: "File manager with versions and soft delete; hash-only or optional encrypted full-file anchoring on Solana.",
  },
  {
    title: "AI",
    note: "Streaming chat with conversation memory and allowlisted tools over workspace data, files and CAD records.",
  },
  {
    title: "Surveying tools",
    note: "Project CAD models (drawings, layers, entity metrics) and job-scoped Earth Observation reports from the Python engine.",
  },
  {
    title: "Market",
    note: "Instruments, professionals, firms, jobs, training and map discovery, with on-chain payment.",
  },
  {
    title: "Workspaces",
    note: "Personal and business workspaces with row-level security, plus platform administration views.",
  },
];

/** The Web3 stance, in plain words. */
const TRUST_LAYER = [
  {
    icon: ShieldCheck,
    title: "Off-chain by default",
    note: "Sensitive survey content and operational records stay in Supabase, not on a public ledger.",
  },
  {
    icon: Scale,
    title: "On-chain only where it counts",
    note: "Solana carries wallet sign-in, USDC settlement, and minimal SHA-256 anchor statements — proofs, never content.",
  },
];

/** How the repository is laid out. */
const LAYOUT = [
  { icon: LayoutGrid, name: "apps/web", note: "React 19 + TypeScript PWA — the shared frontend" },
  { icon: Cpu, name: "apps/desktop", note: "Tauri (Rust) desktop shell over the web app" },
  { icon: Leaf, name: "apps/mobile", note: "Placeholder for the Tauri mobile shell" },
  { icon: MapIcon, name: "apps/engine", note: "Python satellite survey engine (worker, MCP server, CLI)" },
  { icon: Languages, name: "ai-gateway", note: "Optional self-hosted AI host + SiteSurveyor MCP tools" },
  { icon: Blocks, name: "supabase/", note: "Postgres schema, RLS policies and Edge Functions" },
];

export default function AboutPage() {
  useDocumentTitle(`About — SiteSurveyor`);
  const user = useAuthStore((state) => state.user);

  return (
    <PublicPage section="About">
        <PublicHero
          id="about-heading"
          title="One workspace to manage and deliver the survey."
          description="Surveying work usually lives in a paper field book, a spreadsheet and three disconnected systems. SiteSurveyor keeps it in one continuous record instead — so a field professional can run a job end to end, from quote to settled invoice, without leaving the workspace."
          image="calibration"
        >
          <p className="text-xs leading-relaxed text-muted-foreground">
            Version {APP_VERSION} · A product of Eineva Incorporated · An open-source initiative for safer digital surveying
          </p>
        </PublicHero>

        {/* ── Pillars: the emphasis section ────────────────────────── */}
        <section
          aria-labelledby="pillars-heading"
          className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
        >
          <h2 id="pillars-heading" className="market-section-title text-balance text-foreground">
            What makes it one product
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            Each piece feeds the others: the marketplace lists what the workspace produces, the AI
            works on the same records the surveyor is editing, and the chain carries proofs and
            settlement rather than content.
          </p>
          <ul className="mt-10 max-w-[65ch]">
            {PILLARS.map(({ icon: Icon, title, note }) => (
              <li
                key={title}
                className="flex gap-4 border-t border-border/60 py-6 first:border-t-0 first:pt-0"
              >
                <span className="web3-stat-icon web3-stat-icon-cap" aria-hidden="true">
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[0.9375rem] font-semibold leading-snug text-foreground">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{note}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ── Capabilities: dense definition band ──────────────────── */}
        <section aria-labelledby="capabilities-heading" className="market-registry">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="capabilities-heading" className="market-section-title text-balance text-foreground">
              What is implemented today
            </h2>
            <ul className="mt-8 grid gap-x-12 gap-y-5 sm:grid-cols-2">
              {CAPABILITIES.map(({ title, note }) => (
                <li key={title} className="border-t border-border/60 pt-3">
                  <h3 className="text-sm font-semibold leading-snug text-foreground">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{note}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Trust: paired statements ─────────────────────────────── */}
        <section
          aria-labelledby="trust-heading"
          className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20"
        >
          <h2 id="trust-heading" className="market-section-title text-balance text-foreground">
            Hybrid by design
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 sm:gap-0">
            {TRUST_LAYER.map(({ icon: Icon, title, note }, index) => (
              <div
                key={title}
                className={
                  index === 0
                    ? "sm:pr-10"
                    : "border-t border-border/60 pt-8 sm:border-l sm:border-t-0 sm:pl-10 sm:pt-0"
                }
              >
                <h3 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold leading-snug text-foreground">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {title}
                </h3>
                <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
                  {note}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Parts: compact rows ──────────────────────────────────── */}
        <section aria-labelledby="layout-heading" className="border-t border-border/60 bg-card/50">
          <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="layout-heading" className="market-section-title text-balance text-foreground">
              How the project fits together
            </h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
              The web app is the shared frontend. Every other surface packages or powers it.
            </p>
            <ul className="mt-8 grid gap-x-12 gap-y-4 sm:grid-cols-2">
              {LAYOUT.map(({ icon: Icon, name, note }) => (
                <li key={name} className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="web3-mono truncate text-sm font-semibold text-foreground">{name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{note}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Closing ──────────────────────────────────────────────── */}
        <section
          aria-labelledby="closing-heading"
          className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-16"
        >
          <h2 id="closing-heading" className="market-section-title text-foreground">
            Safer digital surveying
          </h2>
          <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            SiteSurveyor is an Eineva Labs product and open-source initiative. Commit defaults are
            Solana devnet and PesePay sandbox — demonstration values, not production settlement.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              to={user ? "/workspace" : "/signup"}
              className="web3-btn web3-btn-primary px-5"
            >
              {user ? "Open your workspace" : "Create an account"}
            </Link>
            <Link to="/market" className="web3-btn px-5">
              Browse the market
            </Link>
          </div>
        </section>
    </PublicPage>
  );
}
