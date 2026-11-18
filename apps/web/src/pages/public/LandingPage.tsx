import { Link } from "react-router-dom";
import {
  ArrowRight,
  Blocks,
  Check,
  ClipboardCheck,
  CloudOff,
  Download,
  FileText,
  FolderKanban,
  Scale,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { useAuthStore } from "../../lib/auth/auth-store";
import { SurveyPhoto } from "../../components/shared/SurveyPhoto.tsx";
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  websiteJsonLd,
} from "../../lib/seo/meta.ts";

const CAPABILITIES = [
  {
    icon: FolderKanban,
    title: "One continuous record",
    copy: "Keep the quote, project, field work, evidence, invoice and payment connected instead of rebuilding the story across separate tools.",
    href: "/journal/one-record-from-quote-to-cash",
    rows: [["Quote", "Scope and price"], ["Project", "Crew and site files"], ["Invoice", "Deliver and settle"]],
  },
  {
    icon: ClipboardCheck,
    title: "Evidence that stays with the job",
    copy: "Upload site files, keep field evidence attached to the work, and create hash anchors without confusing a file hash with proof of authorship.",
    href: "/journal/hash-anchors-explained",
    rows: [["Site files", "Attached"], ["Evidence", "Organised"], ["Hash anchor", "Verifiable bytes"]],
  },
  {
    icon: CloudOff,
    title: "Work beyond the connection",
    copy: "The native desktop app supports offline field work. Keep working on site, then synchronize when a connection is available.",
    href: "/help#offline",
    rows: [["Desktop", "Native workspace"], ["Field work", "Offline capable"], ["Connection", "Sync when available"]],
  },
  {
    icon: WalletCards,
    title: "Flexible identity and settlement",
    copy: "Use email, Google or GitHub, or connect a Solana wallet. Wallet-first access and payment rails sit alongside familiar account options.",
    href: "/help#accounts",
    rows: [["Account", "Email or social"], ["Identity", "Solana wallet"], ["Network", "Chosen deliberately"]],
  },
  {
    icon: Blocks,
    title: "A market around the work",
    copy: "Find instruments, people, jobs and training, then arrange transport for what you hire or buy without leaving the public marketplace.",
    href: "/market",
    rows: [["Marketplace", "Equipment and people"], ["Transport", "Runs and routes"], ["Training", "Build capability"]],
  },
  {
    icon: ShieldCheck,
    title: "Private by default, open by design",
    copy: "An open-source workspace with bring-your-own infrastructure. Inspect the mechanism and choose the services that fit your operation.",
    href: "/privacy",
    rows: [["Source", "Open"], ["Infrastructure", "Your choice"], ["Privacy", "Built into the workspace"]],
  },
];

const WORKFLOW = [
  { title: "Quote", copy: "Define the scope and price before the job begins." },
  { title: "Project", copy: "Plan the work, assign the crew and gather site files." },
  { title: "Evidence", copy: "Keep field records attached and anchor file bytes." },
  { title: "Invoice", copy: "Turn the completed record into a clear invoice." },
  { title: "Payment", copy: "Settle the job and preserve the complete history." },
];

const QUICK_START = [
  "Create an account with email, Google, GitHub or a Solana wallet.",
  "Plan a project: quote it, assign a crew and upload the site files.",
  "Deliver and settle: anchor evidence, send the invoice and collect payment.",
];

/** The public home. The authenticated workspace lives at `/workspace`. */
export default function LandingPage() {
  usePublicMeta("/", {
    jsonLd: (origin) => [
      organizationJsonLd(origin),
      websiteJsonLd(origin),
      breadcrumbJsonLd(origin, [{ name: "Home", path: "/" }]),
    ],
  });
  const user = useAuthStore((state) => state.user);
  const workspacePath = user ? "/workspace" : "/signup";

  return (
    <PublicPage>
      <section className="public-home-hero" aria-labelledby="landing-heading">
        <div className="public-home-container">
          <div className="public-home-hero-grid">
            <h1 id="landing-heading" className="public-home-title">
              Plan the work.<br />Prove the survey.
            </h1>
            <div>
              <p className="public-home-intro">
                One open workspace that runs a survey job from quote to cash, with the crew, site files and evidence connected throughout.
              </p>
              <div className="public-home-hero-actions">
                <Link to={workspacePath} className="public-home-primary">
                  {user ? "Open workspace" : "Get started"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
                <Link to="/downloads" className="public-home-secondary">
                  <Download className="size-4" aria-hidden="true" />
                  Download desktop
                </Link>
              </div>
            </div>
          </div>

          <div className="public-product-preview" aria-label="Screenshot of the SiteSurveyor workspace dashboard with sample data">
            <div className="public-product-window">
              <div className="public-product-toolbar">
                <div className="public-product-dots" aria-hidden="true"><span /><span /><span /></div>
                <span>SiteSurveyor / Workspace</span>
                <span>v2 · Open source</span>
              </div>
              <div className="public-product-body">
                <img
                  className="public-product-shot"
                  src="/images/workspace-preview.png"
                  alt="SiteSurveyor workspace dashboard: today's schedule, equipment calibration state, project and invoice roll-ups and the storage meter, shown with sample data."
                  width={1680}
                  height={1048}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
                <p className="public-product-note">Sample workspace data · Your records and results come from your own workspace.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="public-home-section" aria-labelledby="capabilities-heading">
        <div className="public-home-container">
          <h2 id="capabilities-heading" className="public-home-section-heading">
            Everything your survey job needs.<br />Nothing lost between tools.
          </h2>
          <p className="public-home-section-copy">
            From the first scope to final settlement, SiteSurveyor keeps each stage connected to the work that came before it.
          </p>
          <div className="public-feature-grid mt-12">
            {CAPABILITIES.map(({ icon: Icon, title, copy, href, rows }) => (
              <article key={title} className="public-feature">
                <div className="public-feature-content">
                  <Icon className="mb-5 size-5 text-primary" aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <Link to={href}>Explore the workflow <ArrowRight className="size-3.5" aria-hidden="true" /></Link>
                </div>
                <div className="public-feature-visual" aria-hidden="true">
                  {rows.map(([label, value]) => (
                    <div className="public-feature-line" key={label}><strong>{label}</strong><span>{value}</span></div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="public-home-container public-photo-feature public-photo-feature-grid" aria-labelledby="field-heading">
        <SurveyPhoto image="field-surveyor" />
        <div className="public-photo-feature-copy">
          <h2 id="field-heading">Built around the day’s work, not another data silo.</h2>
          <p>The observation, the crew and the client all belong to the same story. Keep site evidence attached to the work, then carry that context into delivery and settlement.</p>
          <Link to="/help#workspaces" className="public-home-secondary">See how the workspace works <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="public-home-workflow public-home-section" aria-labelledby="workflow-heading">
        <div className="public-home-container">
          <h2 id="workflow-heading" className="public-home-section-heading">One job. One clear way forward.</h2>
          <p className="public-home-section-copy">Every handoff keeps its context, so the final invoice still carries the story of the original quote.</p>
          <ol className="public-workflow-list">
            {WORKFLOW.map(({ title, copy }, index) => (
              <li className="public-workflow-step" key={title}>
                <span className="web3-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <strong className="mt-3">{title}</strong>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="public-home-section" aria-labelledby="start-heading">
        <div className="public-home-container public-home-split">
          <div>
            <h2 id="start-heading" className="public-home-section-heading">From account to settled job.</h2>
            <p className="public-home-section-copy">Set up your workspace and follow the same record through delivery.</p>
            <ol className="mt-8 space-y-5">
              {QUICK_START.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden="true" /></span>
                  <span><strong className="mr-1 font-semibold text-foreground">{index + 1}.</strong>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="public-home-section-heading">Know what the system proves.</h2>
            <dl className="public-home-facts mt-8">
              <div className="public-home-fact"><dt><FileText className="mr-2 inline size-4 text-primary" aria-hidden="true" />Integrity, not authority</dt><dd>Hash anchors prove file bytes, not authorship or ownership.</dd></div>
              <div className="public-home-fact"><dt><Scale className="mr-2 inline size-4 text-primary" aria-hidden="true" />Networks chosen deliberately</dt><dd>Devnet is not mainnet. Warnings are intentional; switch networks deliberately.</dd></div>
              <div className="public-home-fact"><dt><CloudOff className="mr-2 inline size-4 text-primary" aria-hidden="true" />Infrastructure under your control</dt><dd>Open-source software with BYO infrastructure and an offline-capable desktop workspace.</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="public-home-container public-photo-feature public-photo-feature-grid" aria-labelledby="chain-heading">
        <div className="public-photo-feature-copy">
          <h2 id="chain-heading">Proofs on chain. Content stays private.</h2>
          <p>Connect a Solana wallet to anchor SHA-256 digests and settle invoices in USDC. The chain carries wallet-signed statements, while your files, coordinates and client records stay in the workspace.</p>
          <Link to="/help#anchoring" className="public-home-secondary">See how anchoring works <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </div>
        <div className="public-home-chain-grid">
          <SurveyPhoto image="blockchain-wallet" />
          <SurveyPhoto image="blockchain-signing" />
        </div>
      </section>

      <section className="public-home-close" aria-labelledby="close-heading">
        <div className="public-home-container">
          <h2 id="close-heading" className="public-home-section-heading">Keep the whole survey job in view.</h2>
          <p className="public-home-section-copy">Plan the work, preserve the evidence, and carry one record through to payment.</p>
          <div className="public-home-hero-actions">
            <Link to={workspacePath} className="public-home-primary">{user ? "Open workspace" : "Create your workspace"}<ArrowRight className="size-4" aria-hidden="true" /></Link>
            <Link to="/paper" className="public-home-secondary">Read the paper</Link>
            <Link to="/market" className="public-home-secondary">Browse marketplace</Link>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
