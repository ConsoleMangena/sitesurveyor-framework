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
    id: "service",
    title: "The service",
    body: "SiteSurveyor is an operational workspace for surveying work — quoting, projects, dispatch, evidence, billing and settlement — with an AI assistant, a marketplace, a transport board and a native desktop shell. Open-source software hosted by Eineva Incorporated. Provided as is; features change as the product develops.",
  },
  {
    id: "accounts",
    title: "Accounts and workspaces",
    body: "One account with one or more workspaces (personal, business, or both). Sign-in uses wallet signature, email, Google or GitHub. You are responsible for wallet security, passphrase-protected encrypted copies, and actions taken through your account. Do not store unlawful content or impersonate a licensed surveyor.",
  },
  {
    id: "blockchain",
    title: "Blockchain records",
    body: "Anchoring writes a wallet-signed statement to the Solana cluster you select, visible to anyone on that cluster. Anchors prove byte integrity only — not authorship, land ownership, coordinate accuracy or legal validity. Once written, an anchor Memo cannot be removed. Development deployments target Solana devnet; transactions carry no production value.",
  },
  {
    id: "payments",
    title: "Payments and settlement",
    body: "Solana USDC or prepaid Card & mobile money. A pending payment or sandbox reference is never proof of settlement. Marketplace orders complete only after on-chain verification. Marketplace and transport listings are provided by their authors; SiteSurveyor verifies transfers and holds dispute records but does not warrant listed instruments or services.",
  },
  {
    id: "ai",
    title: "AI assistance",
    body: "The assistant reads and writes real workspace records through allowlisted tools. Created and updated records execute as they claim — review them. AI output is not a substitute for a licensed surveyor's review, and the assistant does not execute CAD drafting commands.",
  },
  {
    id: "content",
    title: "Your content",
    body: "You keep ownership of content you create and upload. You grant the service the limited right to store, process and display it as needed to operate your workspace — including supplying workspace records to the AI provider when you use the assistant. See Privacy for what leaves your workspace.",
  },
  {
    id: "liability",
    title: "Liability",
    body: "To the maximum extent permitted by law, SiteSurveyor and Eineva Incorporated are not liable for indirect or consequential losses arising from use of the service — including loss of data you did not back up, lost profits, or disputes arising from marketplace or transport dealings between users.",
  },
]

export default function TermsPage() {
  useDocumentTitle("Terms — SiteSurveyor")

  return (
    <PublicPage section="Terms">
      <PublicHero
        id="terms-heading"
        title="Clear terms for work that happens on the ground."
        description="Accounts, blockchain records, payments and the limits of what we promise."
        image="setting-out"
      />

      <PublicSection aria-label="Terms of use" className="public-reading-section">
        <div className="max-w-2xl space-y-8">
          {SECTIONS.map(({ id, title, body }) => (
            <section key={id} id={id}>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{body}</p>
            </section>
          ))}

          <section id="contact" className="border-t pt-8">
            <p className="text-sm text-muted-foreground">
              Questions about these terms?{" "}
              <Link to="/contact" className="text-primary hover:underline">
                Contact us
              </Link>
              .
            </p>
          </section>
        </div>
      </PublicSection>
    </PublicPage>
  )
}
