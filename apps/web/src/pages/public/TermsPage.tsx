import { Link } from "react-router-dom";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";

/**
 * The terms of use. Written to match how the product actually behaves —
 * including the parts that matter most operationally: devnet data is not
 * production data, an anchor proves integrity only, and a pending payment is
 * never proof of settlement.
 */
export default function TermsPage() {
  useDocumentTitle(`Terms — SiteSurveyor`);

  return (
    <PublicPage section="Terms">
      <section aria-labelledby="terms-heading" className="border-b border-border/70 bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <h1 id="terms-heading" className="market-hero-title max-w-3xl text-balance text-foreground">
            Terms of use
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            The rules for using SiteSurveyor — accounts, workspaces, blockchain records, payments
            and the limits of what the platform promises.
          </p>
        </div>
      </section>

      <section aria-label="Terms of use" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-[68ch]">
          <TermsSection title="1. The service">
            <P>
              SiteSurveyor is an operational workspace for surveying work — quoting, projects,
              dispatch, evidence, billing and settlement — with an AI assistant, a marketplace, a
              transport board and a native desktop shell. It is open-source software operated as a
              hosted service by Eineva Incorporated.
            </P>
            <P>
              The service is provided as is. Features change as the product develops; material
              changes to these terms will be announced in the product before they take effect.
            </P>
          </TermsSection>

          <TermsSection title="2. Accounts and workspaces">
            <P>
              You may hold one account with one or more workspaces (personal, business, or both).
              Sign-in uses a Solana wallet signature, email, Google or GitHub; a wallet signature
              proves control of the wallet and is not a payment. You are responsible for the
              security of your wallet, your passphrase-protected encrypted copies, and the actions
              taken through your account.
            </P>
            <P>
              Do not use the service to store or transmit unlawful content, or to impersonate a
              licensed surveyor if you are not one. Professional deliverables remain the
              responsibility of the professional who signs them.
            </P>
          </TermsSection>

          <TermsSection title="3. Blockchain records">
            <P>
              Anchoring writes a wallet-signed statement to the Solana cluster you select, visible
              to anyone on that cluster. Anchors prove byte integrity — that a file's digest was
              signed and confirmed — and nothing else: not authorship, land ownership, coordinate
              accuracy or legal validity. Once written, an anchor Memo cannot be removed, including
              after the underlying record or file is deleted.
            </P>
            <P>
              Development deployments target Solana devnet, where transactions carry no production
              value. You are responsible for checking the cluster and network shown in the app and
              in your wallet before approving any transaction.
            </P>
          </TermsSection>

          <TermsSection title="4. Payments and settlement">
            <P>
              Settlement runs on two separate rails: Solana USDC (verify cluster, recipient, amount
              and mint before approving) and a prepaid Card &amp; mobile money balance. A pending
              payment or a sandbox reference is never proof of settlement; on-chain transactions
              are confirmed only by the network, and marketplace orders complete only after
              SiteSurveyor verifies the transfer on chain.
            </P>
            <P>
              Marketplace and transport listings are provided by their authors. SiteSurveyor
              verifies marketplace transfers and holds dispute records, but does not warrant the
              condition, calibration or legality of listed instruments or services.
            </P>
          </TermsSection>

          <TermsSection title="5. AI assistance">
            <P>
              The assistant reads and writes real workspace records through allowlisted tools.
              Created and updated records execute as they claim — review them. AI output is not a
              substitute for a licensed surveyor's review of coordinates, datums, units, totals and
              dates, and the assistant does not execute CAD drafting commands.
            </P>
          </TermsSection>

          <TermsSection title="6. Your content">
            <P>
              You keep ownership of the content you create and upload. You grant the service the
              limited right to store, process and display it as needed to operate your workspace —
              including supplying workspace records to the AI provider when you use the assistant.
              See <Link to="/privacy" className="font-medium text-foreground underline-offset-4 hover:underline">Privacy</Link> for
              what leaves your workspace and what reaches a public blockchain.
            </P>
          </TermsSection>

          <TermsSection title="7. Liability">
            <P>
              To the maximum extent permitted by law, SiteSurveyor and Eineva Incorporated are not
              liable for indirect or consequential losses arising from use of the service,
              including loss of data you did not back up, lost profits, or disputes arising from
              marketplace or transport dealings between users. Nothing in these terms limits
              liability that cannot be limited by law.
            </P>
          </TermsSection>

          <TermsSection title="8. Contact">
            <P>
              Questions about these terms go through the{" "}
              <Link to="/contact" className="font-medium text-foreground underline-offset-4 hover:underline">
                contact page
              </Link>
              .
            </P>
          </TermsSection>
        </div>
      </section>
    </PublicPage>
  );
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border/60 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[0.9375rem] leading-relaxed text-foreground/90">{children}</p>;
}
