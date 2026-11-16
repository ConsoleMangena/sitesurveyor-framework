# Paper

Source for the SiteSurveyor preprint, kept separate from the application so that a
reader can find the publication without wading through the monorepo, and so that a
LaTeX build never touches the JS toolchain.

| File | Purpose |
| --- | --- |
| `main.tex` | The paper. Self-contained: the architecture figure is TikZ, so there are no external images |
| `references.bib` | Bibliography stub for `\bibliography{references}` |
| `arxiv-metadata.md` | Values to paste into the arXiv submission form, plus the post-submission DOI steps |
| `Makefile` | `make` builds with `tectonic`, falling back to `latexmk` |

## Build

Any standard TeX installation works; the paper uses only `article`, `geometry`,
`booktabs`, `amsmath`, `graphicx`, `microtype`, `tikz` and `hyperref`. No shell
escape and no exotic fonts, because arXiv compiles the source in a sandbox.

```bash
# fastest: self-contained engine, downloads what it needs on first run
tectonic main.tex

# or a normal TeX Live / MiKTeX install
latexmk -pdf main.tex

# or by hand
pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

Output is `main.pdf`. Build artefacts are ignored by `paper/.gitignore`; the PDF is
not committed, because arXiv builds from source and the repository should not carry
a binary that silently goes stale.

## Submitting

1. Build `main.tex` locally and read the PDF once. Check that every `\ref` resolved
   and that the bibliography printed.
2. Copy title, abstract and categories from `arxiv-metadata.md` into the arXiv form.
3. Upload `main.tex` and `references.bib`. arXiv compiles the source.
4. Record the arXiv identifier in `arxiv-metadata.md` and in the Zenodo record's
   related identifiers, so the paper and the archived software point at each other.

## Relationship to the rest of the repository

`CITATION.cff` **stays at the repository root**. GitHub and Zenodo both look for it
there: GitHub renders the "Cite this repository" button from it, and Zenodo reads it
when it archives a release. Moving it into `paper/` would break both, so this folder
holds the manuscript only.

The paper describes the `v0.1.x` line. If the system changes materially — a new
component, a different trust boundary, a changed test strategy — update the paper in
the same pull request as the code, or state clearly in the paper which release it
describes.
