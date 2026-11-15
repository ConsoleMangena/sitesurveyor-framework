import { Link } from "react-router-dom"
import { PublicHero } from "../../components/shared/PublicHero.tsx"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { PublicSection } from "../../components/shared/PublicSection.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"

const SECTIONS: Array<{
  id: string
  title: string
  body: string
}> = [
  {
    id: "short-version",
    title: "The short version",
    body: "Operational records and original files stay off-chain by default. Solana carries only explicit transactions and minimal digest statements. Confidential survey content is never published to a blockchain by any automatic behaviour in the product.",
  },
  {
    id: "storage",
    title: "What is stored, and where",
    body: "Account profiles, quotes, jobs, invoices and operational records live in a managed Postgres database (Supabase) protected by row-level security. Original survey files (plans, photos, point clouds) are stored as private objects in workspace storage. File metadata (names, digests, versions) sits alongside the records the files document.",
  },
  {
    id: "on-chain",
    title: "What reaches a public blockchain",
    body: "Only what you explicitly sign. Anchoring writes one wallet-signed Memo: attachment identifier + SHA-256 digest (or, in full-file mode, the digest plus manifest digest and chunk count). Payment and sign-in transactions are visible on the cluster you use them on. File contents, client names, coordinates and legal descriptions are never written to the chain.",
  },
  {
    id: "ai",
    title: "AI processing",
    body: "The in-app assistant runs server-side against your workspace's allowlisted records. Prompts and tool context go to the configured AI provider; original files are supplied to the model only if you explicitly supply them.",
  },
  {
    id: "development",
    title: "Development deployments",
    body: "Development builds target Solana devnet and run the fiat rail on sandbox keys. Devnet transactions have no production value, and no live payment is processed from a development session.",
  },
]

const CONTROLS = [
  "Connect or disconnect sign-in methods from Account → Security.",
  "Files support versioning, restore and soft delete; permanent delete requires confirmation.",
  "Encrypted full-file copies are sealed under a passphrase only you hold; losing it leaves the original intact but the copies unrebuildable.",
]

export default function PrivacyPage() {
  useDocumentTitle("Privacy | SiteSurveyor")

  return (
    <PublicPage section="Privacy">
      <PublicHero
        id="privacy-heading"
        title="Your survey records belong in your workspace, not on a public ledger."
        description="What we store, what leaves your workspace, and what reaches a public blockchain."
        image="boundary"
      />

      <PublicSection aria-label="Privacy statement" className="public-reading-section">
        <div className="max-w-2xl space-y-8">
          {SECTIONS.map(({ id, title, body }) => (
            <section key={id} id={id}>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
            </section>
          ))}

          <section id="controls">
            <h2 className="text-lg font-semibold">Your controls</h2>
            <ul className="mt-3 space-y-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
              {CONTROLS.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section id="questions" className="border-t pt-8">
            <p className="text-sm text-muted-foreground">
              Questions?{" "}
              <Link to="/contact" className="text-primary hover:underline">
                Contact us
              </Link>
              . Security-specific reports are handled first.
            </p>
          </section>
        </div>
      </PublicSection>
    </PublicPage>
  )
}
