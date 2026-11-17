# Paper

Source for the SiteSurveyor preprint, kept separate from the application so that a
reader can find the publication without wading through the monorepo, and so that a
LaTeX build never touches the JS toolchain.

| File | Purpose |
| --- | --- |
| `main.tex` | The paper. Two-column layout with a hand-set front page (logo, title block, full-width abstract). The architecture figure is TikZ; the only external asset is the logo under `assets/`. The bibliography is an inline `thebibliography` block, so the document needs no BibTeX run |
| `references.bib` | Unused legacy BibTeX stub from the earlier `\bibliography{references}` setup. `main.tex` now carries its bibliography inline; keep this file only if the paper is moved back to BibTeX |
| `zenodo-metadata.md` | Values for the Zenodo deposit form, file list, related identifiers and publishing order |
| `Makefile` | `make` builds with `tectonic`, falling back to `latexmk` |
| `assets/logo.png` | The project mark, set above the title on the front page. Copied from `apps/web/public/logo.png`; refresh it from there if the logo changes |
| `assets/eo-*.png`, `assets/tour-*.png` | Figure assets for the earth-observation section and the guided walkthrough. Every screenshot is rendered offline: the tour shots come from the fixture harness in `apps/web/.tour-harness/` (production web bundle, no live database, wallet or tile host), and the EO figures from the seeded specimen run of `apps/engine/scripts/provision_gravity.py`. Regenerate the tour shots with that harness; never edit the PNGs by hand |
| `related/` | Open-access related-work reading pile with gap notes (`related/README.md`) — not part of the deposit |

## Build

Any standard TeX installation works; the paper uses only `article`, `geometry`,
`booktabs`, `array`, `amsmath`, `graphicx`, `float` (the walkthrough figures are
pinned with `[H]`), `microtype`, `tikz` and `hyperref`.
There is no BibTeX step: the bibliography is inline in `main.tex`.

```bash
# fastest: self-contained engine, downloads what it needs on first run
cd paper && tectonic main.tex

# or a normal TeX Live / MiKTeX install
cd paper && latexmk -pdf main.tex

# or by hand
cd paper && pdflatex main.tex && pdflatex main.tex
```

`tectonic` resolves its bundle cache on first run, so it needs network access once;
after that the build is offline. The logo is read from `assets/logo.png` relative to
the build directory, which is why the commands above `cd paper` first.

Output is `main.pdf`. Build artefacts are ignored by `paper/.gitignore`; the PDF is
not committed, because it is a generated binary that would silently go stale.

## Publishing

The manuscript is deposited on Zenodo as a **Publication → Preprint** record, with
a DOI minted on publish. Zenodo does not gate publication on endorsement, so there
is no separate account-approval step to wait for.

1. Build `main.pdf` and read it once. Check that every `\ref` resolved (no `??`
   in the output) and that the bibliography printed after the conclusion.
2. Follow `zenodo-metadata.md` for the form values, the files to upload and the
   related identifiers.
3. Publish the software release first if it is not already published, so the paper
   can link to its concept DOI from the start.
4. Record the paper DOI in this file once it exists.

## Published DOIs

| Record | DOI |
| --- | --- |
| Software (concept DOI, always newest version) | [10.5281/zenodo.24287890](https://doi.org/10.5281/zenodo.24287890) |
| Paper (concept DOI, always newest version) | [10.5281/zenodo.24288094](https://doi.org/10.5281/zenodo.24288094) |
| Paper v4 (current manuscript, adds the risk mapping, the operation ledger, the EO pipeline detail and the guided walkthrough) | [10.5281/zenodo.24301833](https://doi.org/10.5281/zenodo.24301833) |

Paper v1 (`10.5281/zenodo.24288095`) listed two authors and is superseded;
v2 (`10.5281/zenodo.24290109`) corrected the author list but still printed the
v1 DOI in the header; v3 (`10.5281/zenodo.24290209`) was the sole-author revision
that switched the header to the concept DOI. All remain online because version
DOIs are permanent. The header prints the **concept DOI**, so future revisions
need no header change.

## Relationship to the rest of the repository

`CITATION.cff` **stays at the repository root**. GitHub and Zenodo both look for it
there: GitHub renders the "Cite this repository" button from it, and Zenodo reads it
when it archives a release. Moving it into `paper/` would break both, so this folder
holds the manuscript only.

The paper describes the `v0.1.x` line. If the system changes materially — a new
component, a different trust boundary, a changed test strategy — update the paper in
the same pull request as the code, or state clearly in the paper which release it
describes.
