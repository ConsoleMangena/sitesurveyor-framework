import { Link } from "react-router-dom"
import { PublicNavLinks } from "../../components/shared/PublicNavLinks"
import { PublicFooter } from "../../components/shared/PublicFooter"
import { PublicWebOnly } from "../../components/shared/PublicWebOnly"
import { useDocumentTitle } from "../../hooks/useDocumentTitle"
import { useAuthStore } from "../../lib/auth/auth-store"
import {
  ArrowRight,
  Blocks,
  ClipboardCheck,
  CloudOff,
  FolderKanban,
  Scale,
  ShieldCheck,
} from "lucide-react"

const PILLARS: { icon: typeof FolderKanban; title: string; href: string }[] = [
  { icon: FolderKanban, title: "One continuous record", href: "/journal/one-record-from-quote-to-cash" },
  { icon: Blocks, title: "Wallet-first identity", href: "/help#accounts" },
  { icon: ClipboardCheck, title: "Real tools, not promises", href: "/help#ai" },
  { icon: Scale, title: "Integrity, not authority", href: "/journal/hash-anchors-explained" },
  { icon: ShieldCheck, title: "Private by default", href: "/privacy" },
  { icon: CloudOff, title: "Works offline", href: "/help#offline" },
]

/**
 * Signed-out landing page at `/`.
 * Sells the mechanism, not a promise. Each capability links to the page
 * that explains it in full — the landing is a table of contents, not the book.
 */
export default function LandingPage() {
  useDocumentTitle("SiteSurveyor — Plan the work. Prove the survey.")
  const user = useAuthStore((state) => state.user)

  return (
    <PublicWebOnly>
      <div className="flex min-h-screen flex-col surface-bolt">
        <PublicNavLinks />

        {/* Hero */}
        <section className="mx-auto flex max-w-5xl flex-col items-center px-4 pb-16 pt-24 text-center sm:px-6 sm:pb-24 sm:pt-32">
          <span className="bolt-chip mb-6">v2 · Open source · BYO infrastructure</span>
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
            Plan the work.
            <br />
            <span className="text-primary">Prove the survey.</span>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            One workspace that runs a survey job from quote to cash — evidence included.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={user ? "/?view=jobs" : "/login"}
              className="inline-flex items-center gap-2 rounded-none bg-primary px-6 py-3 font-mono text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {user ? "Open workspace" : "Get started"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/market"
              className="inline-flex items-center gap-2 rounded-none border border-primary bg-transparent px-6 py-3 font-mono text-sm font-semibold text-primary hover:bg-primary/5"
            >
              Browse market
            </Link>
          </div>
        </section>

        {/* Chain strip */}
        <section className="border-y bg-muted/20">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-xs text-muted-foreground sm:text-sm">
              <span>Quote</span> <span className="text-primary">→</span>
              <span>Project</span> <span className="text-primary">→</span>
              <span>Job</span> <span className="text-primary">→</span>
              <span>Evidence</span> <span className="text-primary">→</span>
              <span>Invoice</span> <span className="text-primary">→</span>
              <span>Payment</span>
            </div>
          </div>
        </section>

        {/* Capability grid */}
        <section id="capabilities" className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            What it does
          </h2>
          <div className="divider-solid mb-8" />
          <div className="grid gap-px overflow-hidden border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, href }) => (
              <Link
                key={title}
                to={href}
                className="group flex flex-col bg-card p-6 transition-colors hover:bg-muted/20"
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <span className="font-semibold leading-snug">{title}</span>
                <span className="mt-auto pt-4 font-mono text-xs text-muted-foreground group-hover:text-primary">
                  Read more →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Quick-start */}
        <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Quick start
          </h2>
          <div className="divider-solid mb-8" />
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <span className="font-mono text-3xl font-bold text-primary/20">01</span>
              <h3 className="mt-2 font-semibold">Create an account</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Email, Google, GitHub, or connect a Solana wallet.
              </p>
            </div>
            <div>
              <span className="font-mono text-3xl font-bold text-primary/20">02</span>
              <h3 className="mt-2 font-semibold">Plan a project</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Quote it, assign a crew, upload the site files.
              </p>
            </div>
            <div>
              <span className="font-mono text-3xl font-bold text-primary/20">03</span>
              <h3 className="mt-2 font-semibold">Deliver and settle</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Anchor evidence, send the invoice, collect payment.
              </p>
            </div>
          </div>
        </section>

        {/* Honest limits */}
        <section className="border-t bg-muted/10">
          <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Honest limits
            </p>
            <div className="mt-4 grid gap-6 text-sm text-muted-foreground sm:grid-cols-2">
              <p>
                Devnet ≠ mainnet. Warnings are intentional — switch networks deliberately.
              </p>
              <p>Hash anchors prove file bytes, not authorship or ownership.</p>
            </div>
          </div>
        </section>

        <div className="mt-auto">
          <PublicFooter />
        </div>
      </div>
    </PublicWebOnly>
  )
}
