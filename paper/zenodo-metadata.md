# Zenodo deposit metadata

The paper is published as its own Zenodo record with resource type
**Publication → Preprint**. It is deliberately separate from the software record:
the software record archives a tagged release of the code, this one archives the
manuscript, and the two are linked through related identifiers so either DOI leads
to the other.

Copy these values into the deposit form. Keep this file in sync with `main.tex`
and `references.bib` when the paper changes.

## Title

```
SiteSurveyor: A Hybrid On-Chain/Off-Chain Workspace for Survey Operations, Evidence Provenance, and Settlement
```

## Authors

```
Consolation Mangena (Eineva Labs)
```

Add an ORCID if you have one; it makes the author unambiguous and is worth the
two minutes.

## Resource type

`Publication` → `Preprint`

## Description (abstract)

Zenodo's description field accepts a limited subset of HTML. Paste this as two
paragraphs, or as one paragraph if you prefer:

```html
<p>Field survey work is usually split across a paper field book, a spreadsheet, a
file share and several disconnected business systems. Every hand-off loses context,
and evidence gathered in the field is rarely bound to the record it is supposed to
support. This paper describes SiteSurveyor, an open-source, multi-tenant workspace
that keeps the operational record -- project, job, quote, invoice, evidence and
payment -- continuous, while keeping confidential survey content off-chain.</p>

<p>The system combines a React/TypeScript progressive web app, a PostgreSQL backend
with row-level security, and a small set of edge functions. Solana is used only where
it adds a property the database cannot supply: wallet-based sign-in, stablecoin
settlement, and a wallet-signed digest that lets a third party confirm that a file
presented later is byte-identical to the one that was anchored. An AI agent operates
the same records through an allowlisted tool surface, with read-back verification of
writes and explicit confirmation before destructive actions. We report the design,
the security boundaries, and the engineering evidence behind the current release,
and we are explicit about what a file digest does not prove.</p>
```

## Fields

| Field | Value |
| --- | --- |
| Publication date | date of first publication |
| Version | `1` (or `v1.0`) |
| Language | English |
| License | CC BY 4.0 |
| Keywords | `surveying`, `geospatial`, `earth observation`, `software provenance`, `row-level security`, `Solana`, `AI agents` |
| Communities | add only if a genuinely relevant community exists; do not create one for this |

## Files

| File | Why |
| --- | --- |
| `main.pdf` | The readable manuscript |
| `paper-source.zip` | `main.tex`, `references.bib`, `Makefile` — lets a reader rebuild the PDF exactly |

Build the archive from the repository root so the paths are stable:

```bash
cd paper && zip -r ../paper-source.zip main.tex references.bib Makefile && cd ..
```

Zenodo stores files up to 50 GB per record, so size is not a constraint here.

## Related identifiers

Once the software release has a DOI, link the two records from both sides:

| Record | Relation | Target |
| --- | --- | --- |
| Paper | *is supplement to* | software concept DOI |
| Software | *is documented by* | paper DOI |

Use the **concept DOI** of the software (`10.5281/zenodo.NNNNNNN`, the one that
always resolves to the newest version) rather than a version DOI, so the link does
not break when a new release is published.

## Publishing order

1. Deposit the software release first, through the tag-triggered workflow, and copy
   its concept DOI.
2. Build `main.pdf` and `paper-source.zip`.
3. Reserve a DOI in the Zenodo form if you want the DOI printed inside the PDF; add
   it to the Availability section, rebuild, then upload.
4. Upload both files, fill the fields above, add the related identifier, publish.
5. Record the paper DOI in `paper/README.md` and, if the paper should be offered as
   the preferred citation, in `CITATION.cff` at the repository root.

Zenodo mints a DOI immediately on publish and does not gate publication on
endorsement or moderation, so the paper is citable as soon as you finish the form.
A later revision is published as a **new version** of the same record: the concept
DOI stays stable and the version DOI changes.
