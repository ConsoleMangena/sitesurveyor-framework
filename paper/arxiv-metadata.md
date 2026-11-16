# arXiv submission metadata

Copy these values into the arXiv submission form. Keep this file in sync with
`main.tex` and `references.bib` when the paper changes.

## Title

```
SiteSurveyor: A Hybrid On-Chain/Off-Chain Workspace for Survey Operations, Evidence Provenance, and Settlement
```

## Authors

```
Consolation Mangena
```

Affiliation: Eineva Labs.

## Abstract (plain text, single paragraph)

```
Field survey work is usually split across a paper field book, a spreadsheet, a file
share and several disconnected business systems. Every hand-off loses context, and
evidence gathered in the field is rarely bound to the record it is supposed to
support. This paper describes SiteSurveyor, an open-source, multi-tenant workspace
that keeps the operational record -- project, job, quote, invoice, evidence and
payment -- continuous, while keeping confidential survey content off-chain. The
system combines a React/TypeScript progressive web app, a PostgreSQL backend with
row-level security, and a small set of edge functions. Solana is used only where it
adds a property the database cannot supply: wallet-based sign-in, stablecoin
settlement, and a wallet-signed digest that lets a third party confirm that a file
presented later is byte-identical to the one that was anchored. An AI agent operates
the same records through an allowlisted tool surface, with read-back verification of
writes and explicit confirmation before destructive actions. We report the design,
the security boundaries, and the engineering evidence behind the current release,
and we are explicit about what a file digest does not prove.
```

## Categories

- **Primary:** `cs.SE` (Software Engineering)
- **Cross-list:** `cs.CY` (Computers and Society)

Do not cross-list to `cs.CR` solely because the paper has a security section; the
contribution is a software system, not a cryptography result.

## Comments field

```
8 pages, 3 tables, 1 figure. Software: https://github.com/ConsoleMangena/sitesurveyor-framework
```

Adjust the page count after each successful build.

## License

Choose **CC BY 4.0** on arXiv. MIT already covers the code; the paper and the code
can carry different licences, and CC BY 4.0 is the least surprising choice for a
preprint.

## Files to upload

```
main.tex
references.bib
```

Nothing else is required: the figure is TikZ inside `main.tex`, so there are no
external image files. arXiv compiles the source itself. Do not upload the `.bbl`
unless arXiv's build fails; if it does, upload the generated `main.bbl` as well.

## After the preprint is announced

1. Add the arXiv DOI to the published Zenodo record's *Related identifiers*
   (`is supplemented by`, relation type `is documented by` works too — pick one and
   stay consistent across versions).
2. Add the Zenodo DOI to the arXiv paper as a **journal reference** or in the
   comments field via a replacement submission:

   ```
   Code: https://doi.org/10.5281/zenodo.XXXXXXX
   ```

3. Update `CITATION.cff` at the repository root with the Zenodo DOI of the release
   the paper describes, and note the paper in `preferred-citation` only if the paper
   becomes the canonical citation.

arXiv identifiers are permanent, but the concept DOI from Zenodo is what you should
cite for "the software"; use the version DOI when the claim depends on an exact
release.
