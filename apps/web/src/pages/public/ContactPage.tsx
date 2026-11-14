import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, Send } from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage.tsx";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.ts";

const CONTACT_EMAIL = "support@sitesurveyor.tech";

const SUBJECT_OPTIONS = [
  { value: "support", label: "Product support" },
  { value: "sales", label: "Pricing and plans" },
  { value: "security", label: "Security or privacy" },
  { value: "market", label: "Marketplace listing" },
  { value: "other", label: "Something else" },
] as const;

type SubjectValue = (typeof SUBJECT_OPTIONS)[number]["value"];

/**
 * The public contact page. No backend form pipeline exists yet, so the form
 * composes a mailto: draft in the visitor's own mail client — nothing is
 * transmitted from the page itself, and the address stays visible for people
 * who prefer to write directly.
 */
export default function ContactPage() {
  useDocumentTitle(`Contact — SiteSurveyor`);

  const [subject, setSubject] = useState<SubjectValue>("support");
  const [message, setMessage] = useState("");
  const [opened, setOpened] = useState(false);

  const subjectLabel = SUBJECT_OPTIONS.find(({ value }) => value === subject)?.label ?? "Support";

  function composeMailto(): string {
    const query = new URLSearchParams({
      subject: `[${subjectLabel}] SiteSurveyor enquiry`,
      body: message.trim() ? `${message.trim()}\n` : "",
    });
    return `mailto:${CONTACT_EMAIL}?${query.toString()}`;
  }

  return (
    <PublicPage section="Contact">
      <section aria-labelledby="contact-heading" className="border-b border-border/70 bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 pb-12 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
          <h1 id="contact-heading" className="market-hero-title max-w-3xl text-balance text-foreground">
            Talk to the people building it
          </h1>
          <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-muted-foreground sm:text-lg">
            Product questions, marketplace listings, security reports — write to us directly. A
            signed-in workspace also has the in-app assistant for questions about your own records.
          </p>
        </div>
      </section>

      <section aria-label="Contact form and channels" className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="max-w-[62ch]">
          <form
            className="border-t border-border/60 pt-8"
            onSubmit={(event) => {
              event.preventDefault();
              window.location.href = composeMailto();
              setOpened(true);
            }}
          >
            <h2 className="text-lg font-semibold leading-snug text-foreground">Write to us</h2>

            <div className="mt-5">
              <label htmlFor="contact-subject" className="text-sm font-medium text-foreground">
                What is this about?
              </label>
              <select
                id="contact-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value as SubjectValue)}
                className="mt-1.5 block h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SUBJECT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
                Your message
              </label>
              <textarea
                id="contact-message"
                rows={6}
                required
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell us what you need. If it is a support question, include what you were doing when it went wrong."
                className="mt-1.5 block w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <button
              type="submit"
              className="web3-btn web3-btn-primary mt-5 min-h-11 w-full gap-2 sm:w-auto"
            >
              <Send className="size-4" aria-hidden="true" />
              Open email draft
            </button>

            {opened ? (
              <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Nothing was sent from this page — your email client opened with the draft. If it
                did not, write to {CONTACT_EMAIL} directly.
              </p>
            ) : null}
          </form>

          <div className="mt-10 border-t border-border/60 py-8">
            <h2 className="text-lg font-semibold leading-snug text-foreground">Direct channels</h2>
            <ul className="mt-4 space-y-3 text-[0.9375rem]">
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="web3-mono text-foreground underline-offset-4 hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Security reports: describe the issue without exploit details in the first message and
              we will follow up. See also{" "}
              <Link to="/privacy" className="font-medium text-foreground underline-offset-4 hover:underline">
                Privacy
              </Link>{" "}
              for how data is handled, and{" "}
              <Link to="/help" className="font-medium text-foreground underline-offset-4 hover:underline">
                Help
              </Link>{" "}
              for answers to common questions.
            </p>
          </div>
        </div>
      </section>
    </PublicPage>
  );
}
