import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border/60 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold leading-snug tracking-[-0.01em] text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[0.9375rem] leading-relaxed text-foreground/90">{children}</p>;
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-4 space-y-2 text-[0.9375rem] leading-relaxed text-foreground/90">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5">
          <span className="mt-[0.55em] size-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The privacy statement. Every claim here traces to DESIGN.md's data
 * classification table — nothing aspirational. When the data model changes,
 * this page changes with it.
 */
export default function PrivacyPage() {
  useDocumentTitle(`Privacy — SiteSurveyor`);

  return (
    <PublicPage section="Privacy">
      <section aria-labelledby="privacy-heading" className="border-b border-border/70 bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <h1 id="privacy-heading" className="market-hero-title max-w-3xl text-balance text-foreground">
            Privacy
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            What SiteSurveyor stores, what leaves your workspace, and what is written to a public
            blockchain. Written from the architecture, not around it.
          </p>
        </div>
      </section>

      <section aria-label="Privacy statement" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-[68ch]">
          <Section title="The short version">
            <P>
              Your operational records and original files stay off-chain by default. Solana carries
              only explicit transactions and minimal digest statements. Confidential survey content
              is never published to a blockchain by any automatic behaviour in the product.
            </P>
          </Section>

          <Section title="What is stored, and where">
            <List
              items={[
                "Account and workspace profiles, quotes, jobs, invoices and other operational records live in a managed Postgres database (Supabase) protected by row-level security, so a workspace's records are readable only by its members.",
                "Original survey files — plans, photos, point clouds — are stored as private objects in workspace storage. They are not public and not on chain.",
                "File metadata (names, digests, versions) sits alongside the records the files document, so evidence stays findable from its job.",
              ]}
            />
          </Section>

          <Section title="What reaches a public blockchain">
            <P>
              Only what you explicitly sign. Anchoring a file writes one wallet-signed Memo
              statement: an attachment identifier and the file's SHA-256 digest (or, in the optional
              full-file mode, the digest plus a manifest digest and chunk count). Payment and
              sign-in transactions are visible on the cluster you use them on.
            </P>
            <P>
              A blockchain is public and permanent by design. That is why the product never writes
              file contents, client names, coordinates or legal descriptions to it — the anchor
              carries the minimum needed to associate a proof with an attachment, and nothing more.
            </P>
          </Section>

          <Section title="AI processing">
            <P>
              The in-app assistant runs server-side against your workspace's allowlisted records.
              Prompts and tool context go to the configured AI provider; original files are supplied
              to the model only if you explicitly supply them. Review your organisation's client
              contract before submitting restricted information in chat.
            </P>
          </Section>

          <Section title="Development deployments">
            <P>
              Development builds target Solana devnet and run the fiat rail on sandbox keys. Devnet
              transactions have no production value, and no live payment is processed from a
              development session.
            </P>
          </Section>

          <Section title="Your controls">
            <List
              items={[
                "Sign in with wallet, email, Google or GitHub, and connect or disconnect methods from Account → Security.",
                "Files support versioning, restore and soft delete; permanent delete requires explicit confirmation. Deleting a record removes private copies — an anchor Memo on chain, once written, remains.",
                "Encrypted full-file copies are sealed under a passphrase only you hold. There is no reset and no recovery service: losing the passphrase leaves the original intact but the copies unrebuildable.",
              ]}
            />
          </Section>

          <Section title="Questions">
            <P>
              Write to us through the{" "}
              <Link to="/contact" className="font-medium text-foreground underline-offset-4 hover:underline">
                contact page
              </Link>
              . Security-specific reports are welcome and are handled before anything else.
            </P>
          </Section>
        </div>
      </section>
    </PublicPage>
  );
}
