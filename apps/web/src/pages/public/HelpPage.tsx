import { Link } from "react-router-dom"
import { PublicPage } from "../../components/shared/PublicPage.tsx"
import { PublicHero } from "../../components/shared/PublicHero.tsx"
import { PublicSection } from "../../components/shared/PublicSection.tsx"
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts"
import { ArrowRight, ExternalLink } from "lucide-react"

const TOPICS: Array<{
  id: string
  title: string
  summary: string
  details: { question: string; answer: string }[]
}> = [
  {
    id: "accounts",
    title: "Accounts & sign-in",
    summary: "Email, Google, GitHub, or connect a Solana wallet.",
    details: [
      {
        question: "What does the wallet signature mean?",
        answer:
          "A signature proves you control the wallet — it is not a payment. Sign-in never asks for a seed phrase.",
      },
      {
        question: "Duplicate email?",
        answer:
          "Use the original sign-in method, then connect extra methods from Account → Security.",
      },
    ],
  },
  {
    id: "workspaces",
    title: "Workspaces",
    summary: "Personal for independents, Business for firms.",
    details: [
      {
        question: "Which workspace do I need?",
        answer:
          "Personal covers one surveyor's work and finances. Business adds quotes, projects, dispatch, staff, assets and billing.",
      },
    ],
  },
  {
    id: "workflow",
    title: "Job workflow",
    summary: "Quote → Project → Job → Evidence → Invoice → Payment.",
    details: [
      {
        question: "How do I track a survey job?",
        answer:
          "Create a project, plan the quote, dispatch the crew, upload files, anchor evidence, generate the invoice.",
      },
      {
        question: "What is Verify integrity?",
        answer:
          "Re-hashes the file and confirms the bytes still match the recorded SHA-256 digest.",
      },
    ],
  },
  {
    id: "ai",
    title: "AI assistant",
    summary: "Calls real tools against your workspace — not just text.",
    details: [
      {
        question: "What can it do?",
        answer:
          "Summarise quotes and invoices, flag missing assignments, create contacts and quotes, inspect CAD layers. It reads records it wrote back to confirm.",
      },
      {
        question: "Can it draft CAD?",
        answer:
          "No — the assistant reads drawings but no screen executes CAD commands.",
      },
    ],
  },
  {
    id: "anchoring",
    title: "File anchoring",
    summary: "SHA-256 digests on Solana. Originals stay off-chain.",
    details: [
      {
        question: "What goes on chain?",
        answer:
          "One wallet-signed Memo: attachment ID + file digest. Full-file mode adds manifest digest and chunk count for encrypted copies.",
      },
      {
        question: "What does an anchor prove?",
        answer:
          "The wallet signed that digest and the cluster confirmed it. It does not prove authorship, ownership, accuracy or legal validity.",
      },
    ],
  },
  {
    id: "money",
    title: "Payments",
    summary: "Solana USDC or prepaid card & mobile money.",
    details: [
      {
        question: "How do payments work?",
        answer:
          "USDC settles on the selected cluster. Card & mobile money funds a prepaid balance — sandbox keys in development.",
      },
      {
        question: "Marketplace orders?",
        answer:
          "Saved as pending → wallet signs → submitted → verified on chain → completed and seller paid.",
      },
    ],
  },
  {
    id: "networks",
    title: "Devnet & sandbox",
    summary: "Development deployments use devnet SOL and sandbox fiat.",
    details: [
      {
        question: "Why devnet everywhere?",
        answer:
          "Devnet tokens have no value and devnet anchors are not production evidence. Check the network before approving anything.",
      },
    ],
  },
  {
    id: "offline",
    title: "Offline",
    summary: "PWA with caching — live queries, uploads and payments need network.",
    details: [
      {
        question: "What works offline?",
        answer:
          "Cached screens are presentation only. Live queries, AI calls, uploads, payment confirmation and anchoring all require connectivity.",
      },
    ],
  },
]

export default function HelpPage() {
  useDocumentTitle("Help — SiteSurveyor")

  return (
    <PublicPage section="Help">
      <PublicHero
        id="help-heading"
        title="How SiteSurveyor works"
        description="Accounts, workflow, evidence, money and networks — the way the product actually behaves."
        image="receiver"
      />

      <PublicSection aria-label="Help topics" className="max-w-5xl px-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map(({ id, title, summary, details }) => (
            <details
              key={id}
              id={id}
              className="group bolt-panel-light open:bg-muted/10"
            >
              <summary className="cursor-pointer select-none p-5 list-none [&::-webkit-details-marker]:hidden">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold leading-snug">{title}</h2>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{summary}</p>
              </summary>
              <div className="border-t px-5 pb-5 pt-4">
                {details.map(({ question, answer }, i) => (
                  <div key={i} className={i > 0 ? "mt-4" : ""}>
                    <p className="text-sm font-medium">{question}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{answer}</p>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-4 border-t pt-8">
          <p className="text-sm text-muted-foreground">
            The in-app assistant answers questions against your own workspace once signed in.
          </p>
          <div className="flex gap-3">
            <Link
              to="/journal"
              className="inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
            >
              Blogs <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
            >
              Contact <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </PublicSection>
    </PublicPage>
  )
}
