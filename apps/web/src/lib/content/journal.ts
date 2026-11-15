/**
 * The journal's content: typed entries authored in code, rendered by
 * JournalPage / JournalPostPage. No CMS and no markdown pipeline — an entry is
 * a plain object here, which keeps the whole public surface statically
 * buildable and the writing reviewable in the same PR as the page.
 *
 * Content rules:
 * - Every factual claim traces to PRODUCT.md / DESIGN.md / the user guide.
 *   Nothing is invented: no customer stories, no metrics, no dates that were
 *   not shipped dates in the repository.
 * - `synthetic: true` marks entries whose examples are illustrative rather
 *   than records from a production deployment.
 */

export interface JournalSection {
  /** A sub-heading inside the entry. */
  heading: string;
  /** Paragraphs under the heading. */
  paragraphs: string[];
}

export interface JournalEntry {
  /** URL segment: /journal/<slug>. */
  slug: string;
  title: string;
  /** Standfirst shown on the index and at the top of the post. */
  summary: string;
  /** ISO date; rendered as a mono label on the index and the post. */
  date: string;
  /** Shown beside the date; free text, not a taxonomised tag. */
  topic: string;
  /** Reading-time estimate is computed from the body, not stored. */
  sections: JournalSection[];
  /**
   * True when the entry's examples are illustrative. The post page renders a
   * visible note so illustrative material is never mistaken for production
   * records.
   */
  synthetic?: boolean;
}

export const JOURNAL_ENTRIES: JournalEntry[] = [
  {
    slug: "one-record-from-quote-to-cash",
    title: "One record from quote to cash",
    summary:
      "Why the workspace is built around a single continuous job record instead of separate tools for quoting, scheduling, filing and invoicing.",
    date: "2026-11-02",
    topic: "Product",
    sections: [
      {
        heading: "The paper field book problem",
        paragraphs: [
          "Surveying work usually lives in three disconnected systems: a paper field book that travels to the site, a spreadsheet that tracks the money, and whichever file-sharing service the last client preferred. None of them agree on what a job is. When a client asks for the plan, the photos and the invoice in one place, someone reassembles them by hand.",
          "SiteSurveyor's answer is structural, not cosmetic: the job is the unit of work. A quote turns into a project, the project carries dispatch, evidence and cost, and the invoice is drawn from the same record rather than retyped into billing software. Every artefact stays attached to the job it documents, which is what makes the workspace navigable at all.",
        ],
      },
      {
        heading: "What changes in practice",
        paragraphs: [
          "The practical difference shows up at the edges of the job. Time and expenses are logged against the project while the crew is still on site, so the invoice is assembled from records instead of recollection. Files keep their versions, so the plan the invoice refers to is the plan that was actually issued. The assistant reads the same records, which is why a question like \"summarise open quotes and overdue invoices\" has a real answer.",
          "None of this removes professional judgement. Coordinates, datums, units and totals still get reviewed by a licensed surveyor. The record just stops getting in the way of the review.",
        ],
      },
    ],
  },
  {
    slug: "hash-anchors-explained",
    title: "What a hash anchor proves, and what it does not",
    summary:
      "A plain explanation of the Solana anchoring in File Manager: what goes on chain, what stays off, and the exact line between integrity and authority.",
    date: "2026-11-09",
    topic: "Evidence",
    synthetic: true,
    sections: [
      {
        heading: "The statement on chain",
        paragraphs: [
          "Anchoring a file writes one wallet-signed Solana Memo: ssv1:<attachment-id>:sha256:<file-digest>. That is the whole statement: an identifier, a digest, and a signature. The original file never leaves Supabase Storage; a full-file anchor (ssv2) additionally commits a manifest digest and chunk count for encrypted copies, and still keeps the bytes off-chain.",
          "The signature proves that the wallet signed that digest at that time. The digest proves that the file's bytes are exactly the bytes hashed. Together they let anyone re-verify, years later, that the document in question has not changed since the anchor was written.",
        ],
      },
      {
        heading: "The line integrity cannot cross",
        paragraphs: [
          "A hash proves byte equivalence only. It does not prove authorship, land ownership, coordinate accuracy or legal validity. A signed anchor of a wrong plan is a permanently signed wrong plan. That is why the file manager keeps verification (re-download, re-hash, compare) separate from review, and why anchoring is a deliberate per-file choice rather than an automatic step.",
          "The same discipline governs what may enter a custom memo: never client names, coordinates, legal descriptions or secrets. The chain is public and permanent; the workspace is private and versioned. The anchor carries the minimum needed to associate a proof with an attachment, and nothing more.",
        ],
      },
    ],
  },
  {
    slug: "designing-for-the-390-pixel-field-phone",
    title: "Designing for the 390-pixel field phone",
    summary:
      "Field work happens on phones with gloves, glare and one free hand. A look at the accessibility and layout rules the app is held to, and why mobile-web is a first-class target.",
    date: "2026-11-14",
    topic: "Engineering",
    synthetic: true,
    sections: [
      {
        heading: "The real usage scene",
        paragraphs: [
          "The honest picture of the app's mobile audience is not a desk with good lighting: it is a surveyor between site visits, holding a phone in one hand, maybe with gloves on, in full sun. Layouts that survive a 390-pixel viewport, controls large enough to hit reliably, and text with real contrast against glare are requirements, not refinements.",
          "The baseline the app is held to: every control is keyboard-operable, focus is visible, fields are labelled, error text is tied to its field, and no layout breaks at 390px. The same rules that serve screen readers serve the sunlit screen: both punish low-contrast text and ambiguous controls.",
        ],
      },
      {
        heading: "Evidence travels with the work",
        paragraphs: [
          "The phone is also where evidence is created: site photos, plan uploads, job notes. The file manager's upload, version and integrity-verify flows are designed to run from a phone browser against private workspace storage, with the SHA-256 computed locally before anything is sent. Offline, the app says so plainly: cached screens are presentation, and live queries, uploads and payments wait for the network.",
        ],
      },
    ],
  },
];

export function getJournalEntry(slug: string): JournalEntry | undefined {
  return JOURNAL_ENTRIES.find((entry) => entry.slug === slug);
}

/** Rough reading time: ~220 wpm over every paragraph in the entry. */
export function journalReadingMinutes(entry: JournalEntry): number {
  const words = entry.sections.reduce(
    (total, section) =>
      total + section.paragraphs.join(" ").split(/\s+/).filter(Boolean).length,
    0,
  );
  return Math.max(1, Math.round(words / 220));
}

/** ISO date rendered the way the market renders its own meta labels. */
export function journalFormatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
