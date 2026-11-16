# Related work — reading pile

Open-access papers downloaded for the related-work gap analysis. Grouped by the
SiteSurveyor section they speak to. Verify each claim against the PDF before
citing it in `main.tex` / `references.bib`.

## Blockchain in land administration / cadastre (closest genre competitors)

| File | What it is | Read it for |
| --- | --- | --- |
| `jedem-2023-blockchain-land-registration-review.pdf` | Zein & Twinomurinzi, JeDEM 15(2), 2023 — systematic literature review of blockchain in land registration, focused on low-income countries | The map of the field. Use it to position SiteSurveyor: nearly all surveyed work targets *land registry/ownership records*, not the *operational survey workflow* (quotes, jobs, crews, evidence, invoicing). DOI: 10.29379/jedem.v15i2.748 |
| `mdpi-ijgi-2021-serbia-blockchain-land.pdf` | Sladić et al., ISPRS Int. J. Geo-Inf. 10(1):35, 2021 — blockchain architecture for Serbian land-administration transactions | The closest national-registry system design. Compares well: they anchor *property transactions*; SiteSurveyor anchors *field evidence*. DOI: 10.3390/ijgi10010035 |
| `fig2018-blockchain-cadastre-boundaries.pdf` | Torun, FIG Congress 2018 — hierarchical blockchain for resolving boundary conflicts between successive cadastral surveys | Surveying-domain problem framing (boundary inconsistency between surveys). Vision paper: no deployed system, no security analysis — a contrast SiteSurveyor can claim. |
| `bacp-lrs-2025-blockchain-ipfs-land-records.pdf` | Boumezbeur et al., Acta Informatica Pragensia 14(1), 2025 — Ethereum + IPFS land record system with on-chain access control | The store-everything-on-chain/IPFS approach SiteSurveyor deliberately avoids (confidentiality). Good foil for the "hash-only anchor" design decision. DOI: 10.18267/j.aip.252 |
| `cadastre-smart-contracts-vision-2018.pdf` | Martyn, Baltic Surveying 8, 2018 — land plot as a combination of smart contracts (vision paper) | Conceptual predecessor genre. Short; useful as an early-citation example of the field's vision stage. DOI: 10.22616/j.balticsurveying.2018.009 |

## Systems / security design exemplars (structure models, not competitors)

| File | What it is | Read it for |
| --- | --- | --- |
| `hyperledger-fabric-eurosys2018.pdf` | Androulaki et al., EuroSys 2018 — permissioned blockchain architecture with measured performance | How a systems paper earns trust: layered architecture + quantitative evaluation. Model for beefing up the "Engineering evidence" section. arXiv:1801.10228 |
| `sigstore-usability-arxiv2025.pdf` | "Why Johnny Adopts Identity-Based Software Signing", arXiv 2025 — usability case study of Sigstore | Sigstore-adjacent open paper (the CCS'22 original is paywalled). Keyed signing + adoption evidence + threat framing; model for the security-model table and honest-limitations tone. arXiv:2503.00271 |
| `rfc6962-certificate-transparency.txt` | RFC 6962 — Certificate Transparency: public, append-only, verifiable logs | The canonical "verify later without trusting the operator" design. Sharpen the anchoring section's vocabulary against it (Merkle tree, gossip, inclusion proofs) — and note SiteSurveyor anchors digests, not log positions. |

## AI agent as operational actor

| File | What it is | Read it for |
| --- | --- | --- |
| `react-language-models-arxiv2022.pdf` | Yao et al., arXiv:2210.03629 — ReAct: reasoning + acting in LLMs | The canonical agent-loop citation for the agent section's operating model. |
| `toolformer-arxiv2023.pdf` | Schick et al., arXiv:2302.04761 — Toolformer | Canonical citation for tool-using LLMs. Contrast: Toolformer learns tool use; SiteSurveyor *constrains* it with an allowlist + read-back verification + confirmation gates — that contrast is the novelty claim. |

## Known gaps in SiteSurveyor's paper (as of this pile)

1. **No related-work section** — none of the five cadastral papers above is cited
   yet. The JeDEM review is the cheapest way to build one credibly.
2. **No quantitative evaluation** — Fabric shows what "engineering evidence"
   should look like; the paper's evidence section is qualitative.
3. **No threat-model table** — Sigstore/RFC 6962 show the expected format.
4. **No positioning against store-on-chain systems** — BACP-LRS (IPFS/Ethereum)
   is the perfect contrast for the hash-only anchoring decision.
5. **Agent section lacks citations** — ReAct/Toolformer are the two expected ones.
