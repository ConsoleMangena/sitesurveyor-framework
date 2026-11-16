# Zenodo deposit metadata

The paper is published as its own Zenodo record with resource type
**Publication → Preprint**. It is deliberately separate from the software record:
the software record archives a tagged release of the code, this one archives the
manuscript, and the two are linked through related identifiers so either DOI leads
to the other.

Copy these values into the deposit form. Keep this file in sync with `main.tex`
when the paper changes; the bibliography is inline in `main.tex`, so there is no
separate `.bib` file to update.

## Title

```
SiteSurveyor: A Hybrid On-Chain/Off-Chain Architecture for Secure and Verifiable Surveying Systems
```

## Authors

```
Consolation Mangena (ORCID 0009-0006-2708-914X)
Tatenda Mangena
```

## Resource type

`Publication` → `Preprint`

## Description (abstract)

Zenodo's description field accepts a limited subset of HTML. Paste this as two
paragraphs, or as one paragraph if you prefer:

```html
<p><strong>SiteSurveyor</strong> is an open-source framework for building secure and
verifiable surveying systems, realised as a multi-tenant workspace that keeps the
operational record continuous: projects, jobs, quotes, invoices, evidence and
payments live in a single PostgreSQL database protected by row-level security.</p>

<p>Confidential survey files stay off-chain. Solana is used only where database
guarantees are insufficient: wallet-based sign-in, stablecoin settlement, and
wallet-signed SHA-256 digests that let a third party confirm a file presented later
is byte-identical to the one anchored, without accessing its contents. An AI
assistant operates on workspace records through a typed, allowlisted tool surface
with read-back write verification and explicit confirmation for destructive
operations. An asynchronous Python worker screens open Earth-observation imagery
(Sentinel-2, Copernicus DEM, ALOS PALSAR, Landsat WOFS, ESA WorldCover, CHIRPS)
into ranked field targets and GeoTIFF, GeoJSON and KMZ deliverables.</p>

<p>The stack includes:</p>
<ul>
  <li>a React 19 progressive web app, installable on phone and desktop</li>
  <li>Supabase: PostgreSQL with row-level security, Storage, Auth and edge functions</li>
  <li>a Tauri desktop shell packaging the same frontend</li>
  <li>an MCP server exposing the agent and screening surfaces to external hosts</li>
  <li>an optional self-hosted Node gateway for the agent contract</li>
</ul>

<p>Released under the MIT licence. See the linked paper for the system design, the
threat model, and an explicit statement of what an anchored digest does and does
not prove.</p>
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
| `paper-source.zip` | `main.tex`, `Makefile`, `assets/logo.png` — lets a reader rebuild the PDF exactly |

Build the archive from the repository root so the paths are stable:

```bash
cd paper && zip -r ../paper-source.zip main.tex Makefile assets && cd ..
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

## Published DOIs (filled 2026-11-16)

| Record | Concept DOI | First version DOI |
| --- | --- | --- |
| Software | `10.5281/zenodo.24287890` | `10.5281/zenodo.24287891` (v0.1.0) |
| Paper | `10.5281/zenodo.24288094` | `10.5281/zenodo.24288095` |

The software record's related identifiers already carry *is documented by* the
paper DOI, and the paper carries *is supplement to* the software concept DOI.
The header DOI in `main.tex` is `10.5281/zenodo.24288095`.

## Versioning policy

The paper grows with the framework. Publish revisions as **new versions of this
same record** — never as separate records — so the concept DOI keeps resolving to
the newest manuscript and every old citation stays valid.

**How the DOIs work:**

| DOI | Behaviour |
| --- | --- |
| Concept DOI (`10.5281/zenodo.NNNNNNN`) | Always resolves to the newest version. Cite this one. |
| Version DOI (`10.5281/zenodo.MMMMMMM`) | Pinpoints one revision. Use it only when a claim must be tied to an exact manuscript. |

**When to mint a new version:**

| Change | Action |
| --- | --- |
| Typo, wording, reference fix | Update the files only; do not mint a version for trivia |
| New component, changed security boundary, changed test strategy, new evidence | New version — same rule as `paper/README.md`: paper changes ride along with the material code change |
| Genuinely new framework capability | New version, and revisit the abstract and the Version field |

**Keep the two records' versions honest:** the paper's Version field should name
the software release it describes (for example, paper v2 describes `v0.3.x`). The
software record versions automatically from `v*` git tags via the tag-triggered
workflow; the paper versions only when the manuscript meaningfully changes. The
related identifiers below use the software's concept DOI precisely so this link
survives every release on either side.
