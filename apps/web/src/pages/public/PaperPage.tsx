import { Download, ExternalLink, FileText } from "lucide-react";
import { PublicPage } from "../../components/shared/PublicPage";
import { usePublicMeta } from "../../hooks/usePublicMeta";
import { breadcrumbJsonLd } from "../../lib/seo/meta";

const PDF_PATH = "/paper/sitesurveyor-preprint.pdf";
const PAPER_DOI = "https://doi.org/10.5281/zenodo.24288094";
const SOFTWARE_DOI = "https://doi.org/10.5281/zenodo.24287890";

/** The public manuscript page: citation, abstract and the readable PDF. */
export default function PaperPage() {
  usePublicMeta("/paper", {
    jsonLd: (origin) => [
      breadcrumbJsonLd(origin, [
        { name: "Home", path: "/" },
        { name: "Paper", path: "/paper" },
      ]),
    ],
  });

  return (
    <PublicPage section="Paper">
      <section className="public-home-section paper-hero">
        <div className="public-home-container">
          <h1 className="public-home-section-heading">The SiteSurveyor paper</h1>
          <p className="public-home-section-copy">
            A hybrid on-chain/off-chain architecture for secure and verifiable surveying systems.
            The manuscript describes the workspace, its evidence model, and the engineering checks
            that hold its claims to account.
          </p>

          <div className="paper-meta">
            <div>
              <small>Title</small>
              <strong>
                SiteSurveyor: A Hybrid On-Chain/Off-Chain Architecture for Secure and Verifiable
                Surveying Systems
              </strong>
            </div>
            <div>
              <small>Author</small>
              <strong>
                Consolation Mangena · Eineva Labs ·{" "}
                <a href="https://orcid.org/0009-0006-2708-914X" target="_blank" rel="noreferrer">
                  ORCID 0009-0006-2708-914X
                </a>
              </strong>
            </div>
            <div>
              <small>Status</small>
              <strong>Preprint · November 2026 · CC BY 4.0</strong>
            </div>
            <div>
              <small>DOI</small>
              <strong>
                <a href={PAPER_DOI} target="_blank" rel="noreferrer">
                  10.5281/zenodo.24288094
                </a>
              </strong>
            </div>
          </div>

          <div className="public-home-hero-actions paper-actions">
            <a href={PDF_PATH} download className="public-home-primary">
              <Download className="size-4" aria-hidden="true" />
              Download PDF
            </a>
            <a href={PDF_PATH} target="_blank" rel="noreferrer" className="public-home-secondary">
              <FileText className="size-4" aria-hidden="true" />
              Open in new tab
            </a>
            <a href={PAPER_DOI} target="_blank" rel="noreferrer" className="public-home-secondary">
              <ExternalLink className="size-4" aria-hidden="true" />
              Zenodo record
            </a>
          </div>

          <p className="paper-abstract">
            A field survey leaves a trail: a quote, a crew schedule, observations, photographs, CAD
            drawings, an invoice, a payment. In most practices that trail is broken across paper
            field books, spreadsheets, shared drives and separate accounting software. SiteSurveyor
            keeps it in one multi-tenant PostgreSQL workspace guarded by row-level security, keeps
            confidential files off-chain, and uses Solana only where the database cannot give the
            guarantee on its own: wallet sign-in, stablecoin settlement, and wallet-signed SHA-256
            digests that let a third party confirm a file is byte-identical to the one anchored.
            Every anchoring attempt, success or failure, lands in an append-only ledger. The paper
            maps the cybersecurity risks of surveying practice onto the controls that answer them
            and states plainly what an anchored digest does not prove.
          </p>

          <iframe
            className="paper-viewer"
            src={PDF_PATH}
            title="SiteSurveyor preprint, readable PDF"
            loading="lazy"
          />

          <p className="paper-note">
            The software is archived separately under{" "}
            <a href={SOFTWARE_DOI} target="_blank" rel="noreferrer">
              10.5281/zenodo.24287890
            </a>
            ; the two records cite each other. Revisions are published as new versions of the same
            record, so the concept DOI above always resolves to the newest manuscript.
          </p>
        </div>
      </section>
    </PublicPage>
  );
}