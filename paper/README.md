# Paper

Source for the SiteSurveyor preprint, kept separate from the application so that a
reader can find the publication without wading through the monorepo, and so that a
LaTeX build never touches the JS toolchain.

| File | Purpose |
| --- | --- |
| `main.tex` | The paper. Self-contained: the architecture figure is TikZ, so there are no external images |
| `references.bib` | Bibliography stub for `\bibliography{references}` |
| `zenodo-metadata.md` | Values for the Zenodo deposit form, file list, related identifiers and publishing order |
| `Makefile` | `make` builds with `tectonic`, falling back to `latexmk` |

## Build

Any standard TeX installation works; the paper uses only `article`, `geometry`,
`booktabs`, `amsmath`, `graphicx`, `microtype`, `tikz` and `hyperref`.

```bash
# fastest: self-contained engine, downloads what it needs on first run
tectonic main.tex

# or a normal TeX Live / MiKTeX install
latexmk -pdf main.tex

# or by hand
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

Output is `main.pdf`. Build artefacts are ignored by `paper/.gitignore`; the PDF is
not committed, because it is a generated binary that would silently go stale.

## Publishing

The manuscript is deposited on Zenodo as a **Publication → Preprint** record, with
a DOI minted on publish. Zenodo does not gate publication on endorsement, so there
is no separate account-approval step to wait for.

1. Build `main.pdf` and read it once. Check that every `\ref` resolved and that the
   bibliography printed.
2. Follow `zenodo-metadata.md` for the form values, the files to upload and the
   related identifiers.
3. Publish the software release first if it is not already published, so the paper
   can link to its concept DOI from the start.
4. Record the paper DOI in this file once it exists.

## Relationship to the rest of the repository

`CITATION.cff` **stays at the repository root**. GitHub and Zenodo both look for it
there: GitHub renders the "Cite this repository" button from it, and Zenodo reads it
when it archives a release. Moving it into `paper/` would break both, so this folder
holds the manuscript only.

The paper describes the `v0.1.x` line. If the system changes materially — a new
component, a different trust boundary, a changed test strategy — update the paper in
the same pull request as the code, or state clearly in the paper which release it
describes.
