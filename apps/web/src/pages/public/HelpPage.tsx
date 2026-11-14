import { Link } from "react-router-dom";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";

const TOPICS: Array<{
  id: string;
  question: string;
  answer: string[];
}> = [
  {
    id: "accounts",
    question: "How do I sign in, and what does the wallet signature mean?",
    answer: [
      "Sign in with a Solana wallet (Sign In With Solana), or with email, Google or GitHub. A wallet signature proves control of the wallet — it is not a payment, and sign-in never asks for a seed phrase. Desktop is built around Phantom; mobile supports Solflare hand-off.",
      "If your account is partially configured, finish the setup form you are shown rather than creating a second identity. Connect extra sign-in methods later from Account → Security.",
    ],
  },
  {
    id: "workspaces",
    question: "Personal or business workspace — which one?",
    answer: [
      "Personal is an independent surveyor: your own work, finances, files and contacts. Business is a firm: quotes, projects, dispatch, staff, assets and billing. Platform operators sit above both with administration views, and are not needed for surveying work.",
    ],
  },
  {
    id: "workflow",
    question: "What does a job look like end to end?",
    answer: [
      "Plan and price: create a contact, prepare a quote with line items, and group the record in a project. Prepare and execute: Dispatch and Schedule organise jobs and assignments; Time & Expenses record effort; Assets track instruments.",
      "Keep evidence: upload files to the File Manager, version them, and run Verify integrity to confirm the bytes still match the recorded SHA-256. Invoice and settle: Billing & Payments offers Solana USDC or the Card & mobile money prepaid rail — a pending payment or sandbox reference is never proof of settlement.",
    ],
  },
  {
    id: "ai",
    question: "What can SiteSurveyor AI actually do?",
    answer: [
      "The assistant streams answers and calls allowlisted tools against real workspace data: summarise open quotes and overdue invoices, flag missing job assignments, create a contact and read back the saved record, prepare a quote and confirm the total, inspect CAD layers and entities.",
      "Creates and updates may execute immediately — be explicit about the target record. Permanent deletes need confirmation, so prefer archiving. There is no CAD drafting: the assistant reads drawings, but no screen executes commands against one. Always verify coordinates, datums, units, totals and dates — AI output is not a substitute for a licensed surveyor.",
    ],
  },
  {
    id: "anchoring",
    question: "What goes on chain when I anchor a file?",
    answer: [
      "One wallet-signed Solana Memo: the attachment ID and the file's SHA-256 digest (hash-only, the default). Optional full-file anchoring also commits a manifest digest and chunk count for encrypted copies. In both modes the original file stays off-chain in private workspace storage.",
      "An anchor proves the wallet signed that digest and the cluster confirmed it. It does not prove authorship, land ownership, coordinate accuracy or legal validity. Never put client names, coordinates or secrets in a custom memo.",
    ],
  },
  {
    id: "money",
    question: "How do payments work?",
    answer: [
      "Two settlement paths, kept separate. Solana USDC settles on the selected cluster — verify cluster, recipient, amount and mint before approving, and keep the signature as the reconciliation reference. Card & mobile money funds a prepaid USD balance; in development deployments it runs on sandbox keys and processes no live payment.",
      "Marketplace orders are saved as pending before your wallet signs; the signature moves them to submitted, SiteSurveyor verifies the transfer on chain, and only then do they complete and pay the seller.",
    ],
  },
  {
    id: "networks",
    question: "Why does everything say devnet and sandbox?",
    answer: [
      "Development deployments target Solana devnet and the fiat sandbox: devnet SOL and USDC have no monetary value, and devnet anchors are not production evidence. Check the network in the app and in your wallet before approving anything, and never switch to mainnet just to clear a devnet warning.",
    ],
  },
  {
    id: "offline",
    question: "Does the app work offline?",
    answer: [
      "The app is a PWA with caching, offline status and cached-session handling. An offline-cached screen is presentation only — live queries, AI calls, uploads, payment confirmation and anchoring all need the network. Reconnect and verify before treating anything as done.",
    ],
  },
];

/**
 * The public help page: the questions a visitor asks before signing up,
 * answered from the same facts as the in-app user guide. Two-column on
 * desktop (contents beside the body), single measure on phones.
 */
export default function HelpPage() {
  useDocumentTitle(`Help — SiteSurveyor`);

  return (
    <PublicPage section="Help">
      <section aria-labelledby="help-heading" className="border-b border-border/70 bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <h1 id="help-heading" className="market-hero-title max-w-3xl text-balance text-foreground">
            How SiteSurveyor works
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            The questions people ask before signing up — accounts, workflow, evidence, money and
            networks — answered the way the product actually behaves.
          </p>
        </div>
      </section>

      <section aria-label="Help topics" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="sticky top-20 space-y-2.5 border-l border-border/60 pl-4 text-sm">
              {TOPICS.map(({ id, question }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {question.split("—")[0].trim()}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="max-w-[68ch]">
            {TOPICS.map(({ id, question, answer }) => (
              <section
                key={id}
                id={id}
                className="scroll-mt-20 border-t border-border/60 py-8 first:border-t-0 first:pt-0"
              >
                <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
                  {question}
                </h2>
                {answer.map((paragraph, index) => (
                  <p
                    key={index}
                    className="mt-4 text-[0.9375rem] leading-relaxed text-foreground/90"
                  >
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}

            <aside className="border-t border-border/60 py-8">
              <h2 className="text-lg font-semibold leading-snug text-foreground">
                Still stuck?
              </h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
                The in-app assistant answers questions against your own workspace once you are
                signed in. For anything else, <Link to="/contact" className="font-medium text-foreground underline-offset-4 hover:underline">contact us</Link>.
              </p>
            </aside>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
