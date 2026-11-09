"""
Mineral commodity screening — which minerals this survey area can support
=======================================================================

The mineral engine used to answer one question: how prospective is this ground
for shear-hosted **gold**. That is a single commodity dressed up as a category.
This module keeps the same evidence layers and asks the same question once per
commodity, so a report can say what the area is indicated for and - just as
usefully - what it is not.

What the data can and cannot do
-------------------------------
The inputs are Sentinel-2 / Landsat median surface reflectance (blue, green,
red, NIR, SWIR-1, SWIR-2), ALOS PALSAR L-band SAR, a DEM and ESA WorldCover.
That is enough to map *alteration assemblages* (iron oxides/gossan, hydroxyl and
clay minerals, ferrous/mafic minerals), *structure* (lineament density and
intersections), *relative relief* and *land cover*, and to lean on regional
endowment around known occurrences.

It is **not** enough to identify a mineral species or measure grade. There is no
hyperspectral sensor, no thermal infrared, no geological map and no geochemistry
in this pipeline. So a commodity score here means: "the alteration, structure and
terrain pattern this deposit style needs are present in this ground", with a
confidence tier that says how well Earth Observation can discriminate that style
at all. Commodities whose host cannot be seen from orbit are listed separately in
`UNSCREENED` rather than being given a misleading number.

Every weighted overlay is computed on layers that are already normalised 0-1
within the AOI, so scores are percentiles, not physical quantities: a 70 on one
property is not a 70 on another.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

#: Evidence layers the predictors share. Names match the keys of the normalised
#: raster dict built in `engines/minerals.py`.
EVIDENCE_KEYS = (
    "lineament_density",
    "lineament_intersections",
    "iron_oxide",
    "hydroxyl_clay",
    "ferrous_mafic",
    "relative_relief",
    "endowment",
)

#: Score bands, in index units (0-100 percentiles within the survey area).
BAND_HIGH = 70.0
BAND_MODERATE = 55.0
BAND_LOW = 45.0

#: A commodity counts as indicated in an area when its top decile reaches this
#: ...
INDICATED_P90 = BAND_MODERATE

#: ...and the index actually varies across the area by at least this many points.
#: Without it every commodity in a flat, uniformly average AOI reads "indicated",
#: because the layers are percentiles: somewhere is always the best cell.
MIN_CONTRAST = 15.0

#: Cells where less than this share of the model's weight has data are refused
#: rather than scored, so a hole in one raster cannot invent a number.
MIN_WEIGHT_COVERAGE = 0.6


@dataclass(frozen=True)
class Commodity:
    """One mineral system the predictors can screen for."""

    key: str
    name: str
    group: str
    #: Short label the map prints beside a target, where the full name will not fit.
    symbol: str
    #: This system's colour on the dominant-mineral map, the GeoTIFF colour table and
    #: the web legend. One authority, so the three cannot drift apart.
    color: str
    #: What the model is actually screening for, in the report's own words.
    systems: str
    deposit_style: str
    #: Evidence weights. Must sum to 1.0 - `validate()` enforces it.
    weights: dict[str, float]
    #: How well Earth Observation can discriminate this style at all.
    confidence: str
    confidence_note: str
    verification: str
    #: Mineral species this is often taken to mean, for the report's wording.
    minerals: tuple[str, ...] = field(default_factory=tuple)

    def evidence_names(self) -> list[str]:
        """Evidence keys that carry weight, strongest first."""
        return [
            key
            for key, _ in sorted(self.weights.items(), key=lambda kv: kv[1], reverse=True)
            if _ > 0
        ]


@dataclass(frozen=True)
class Unscreenable:
    """A commodity this pipeline deliberately does not score."""

    key: str
    name: str
    reason: str
    needs: str


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------

GOLD = Commodity(
    key="gold",
    name="Gold",
    group="Precious",
    symbol="Au",
    color="#e69f00",
    systems="Orogenic / shear-zone hosted gold with quartz-carbonate veining",
    deposit_style="Structurally controlled lode gold in greenstone and granite-greenstone terrane",
    # Deliberately identical to the historic model weights, so the gold index
    # in the map sheet is unchanged by this catalogue existing.
    weights={
        "lineament_density": 0.28,
        "lineament_intersections": 0.18,
        "iron_oxide": 0.14,
        "hydroxyl_clay": 0.14,
        "ferrous_mafic": 0.12,
        "relative_relief": 0.08,
        "endowment": 0.06,
    },
    confidence="High",
    confidence_note=(
        "Shear-hosted gold is structurally controlled, and lineaments plus "
        "intersections are the strongest signals this sensor set carries. The "
        "alteration layers (sericite, carbonate, iron oxide) are supportive, not "
        "diagnostic."
    ),
    verification="Ground geological mapping and soil or channel geochemical sampling",
    minerals=("gold",),
)

BASE_METALS = Commodity(
    key="base_metals",
    name="Copper, zinc and lead",
    group="Base",
    symbol="Cu-Zn-Pb",
    color="#cc79a7",
    systems="Volcanogenic massive sulphide and skarn-style base-metal alteration",
    deposit_style="Sulphide-bearing alteration zones along structures and lithological contacts",
    weights={
        "hydroxyl_clay": 0.26,
        "iron_oxide": 0.22,
        "lineament_intersections": 0.18,
        "lineament_density": 0.14,
        "ferrous_mafic": 0.10,
        "relative_relief": 0.06,
        "endowment": 0.04,
    },
    confidence="Moderate",
    confidence_note=(
        "Gossan and clay-carbonate alteration around sulphide bodies is visible, "
        "but copper is not spectrally active at these wavelengths, so this maps "
        "the alteration halo rather than the metal."
    ),
    verification="Soil geochemistry with multi-element ICP and trench or drill follow-up",
    minerals=("copper", "zinc", "lead"),
)

NICKEL_PGM = Commodity(
    key="nickel_pgm",
    name="Nickel and platinum-group elements",
    group="Battery / precious",
    symbol="Ni-PGM",
    color="#0072b2",
    systems="Magmatic sulphide in mafic and ultramafic bodies",
    deposit_style="Mafic-ultramafic hosted sulphide, often in layered complexes or greenstone belts",
    weights={
        "ferrous_mafic": 0.30,
        "lineament_density": 0.18,
        "relative_relief": 0.16,
        "lineament_intersections": 0.14,
        "iron_oxide": 0.10,
        "hydroxyl_clay": 0.06,
        "endowment": 0.06,
    },
    confidence="Moderate",
    confidence_note=(
        "Ultramafic rock is ferrous-mineral rich with little clay, and that ratio "
        "does separate from granite and sediment cover. Fresh exposure matters, "
        "which is why relief carries real weight here."
    ),
    verification="Rock-chip and soil geochemistry (Ni, Cr, PGE) with petrographic check",
    minerals=("nickel", "platinum", "palladium", "chromium"),
)

CHROMIUM = Commodity(
    key="chromium",
    name="Chromium (chromitite)",
    group="Ferro-alloy",
    symbol="Cr",
    color="#009e73",
    systems="Stratiform chromitite seams in ultramafic sequences",
    deposit_style="Layered ultramafic seams, commonly on ridgelines where they crop out",
    weights={
        "ferrous_mafic": 0.34,
        "relative_relief": 0.24,
        "lineament_density": 0.16,
        "iron_oxide": 0.12,
        "lineament_intersections": 0.08,
        "hydroxyl_clay": 0.04,
        "endowment": 0.02,
    },
    confidence="Moderate",
    confidence_note=(
        "Chromitite is dark, ferrous and resists erosion, so it tends to stand "
        "proud in the terrain this model keys on. Seam scale is below the pixel, "
        "so this locates host sequences, not individual seams."
    ),
    verification="Detailed geological mapping of seam attitude and channel sampling",
    minerals=("chromium",),
)

IRON_ORE = Commodity(
    key="iron_ore",
    name="Iron ore",
    group="Ferro-alloy",
    symbol="Fe",
    color="#d55e00",
    systems="Banded iron formation and iron-enriched laterite or gossan",
    deposit_style="BIF-hosted or supergene iron enrichment",
    weights={
        "iron_oxide": 0.42,
        "relative_relief": 0.20,
        "lineament_density": 0.12,
        "ferrous_mafic": 0.12,
        "lineament_intersections": 0.06,
        "hydroxyl_clay": 0.04,
        "endowment": 0.04,
    },
    confidence="High",
    confidence_note=(
        "Iron oxide is the most direct signal in the whole sensor set, and BIF "
        "weathers into resistant ridges. This is the commodity this data sees best."
    ),
    verification="Chip sampling for Fe grade, magnetite/hematite ratio and beneficiation testwork",
    minerals=("iron",),
)

LITHIUM = Commodity(
    key="lithium",
    name="Lithium (pegmatite)",
    group="Battery",
    symbol="Li",
    color="#f0e442",
    systems="LCT pegmatite swarms and their greisen alteration",
    deposit_style="Intrusion-related pegmatites, structurally controlled, often in greenstone margins",
    weights={
        "lineament_density": 0.30,
        "relative_relief": 0.24,
        "lineament_intersections": 0.18,
        "hydroxyl_clay": 0.12,
        "iron_oxide": 0.08,
        "ferrous_mafic": 0.04,
        "endowment": 0.04,
    },
    confidence="Low",
    confidence_note=(
        "This is a structural favourability screen only. Pegmatites are narrower "
        "than a pixel and their lithium minerals (spodumene, petalite) have no "
        "usable signature at these wavelengths. Treat the score as 'worth walking'."
    ),
    verification="Targeted pegmatite mapping with rock-chip assay (Li, Ta, Sn, Cs)",
    minerals=("lithium", "tantalum", "tin"),
)

MANGANESE = Commodity(
    key="manganese",
    name="Manganese (oxide / supergene)",
    group="Ferro-alloy / battery",
    symbol="Mn",
    color="#6d4c41",
    systems="Sedimentary and supergene manganese oxide enrichment",
    deposit_style="Stratiform or supergene wad/psilomelane blankets on weathering plateaus",
    weights={
        "iron_oxide": 0.34,
        "relative_relief": 0.22,
        "ferrous_mafic": 0.16,
        "lineament_density": 0.12,
        "lineament_intersections": 0.08,
        "hydroxyl_clay": 0.04,
        "endowment": 0.04,
    },
    confidence="Moderate",
    confidence_note=(
        "Manganese oxides strongly absorb in visible-to-SWIR wavelengths and commonly "
        "co-occur with iron duricrusts along elevated weathering surfaces."
    ),
    verification="Channel sampling along ridge caps with XRF/ICP assay for Mn/Fe ratio",
    minerals=("manganese",),
)

BAUXITE = Commodity(
    key="bauxite",
    name="Bauxite (aluminium laterite)",
    group="Base / industrial",
    symbol="Al",
    color="#56b4e9",
    systems="Residual lateritic weathering profiles over aluminous parent rock",
    deposit_style="Plateau-capping residual laterite and gibbsite/kaolinite enrichment",
    weights={
        "hydroxyl_clay": 0.38,
        "iron_oxide": 0.26,
        "relative_relief": 0.20,
        "ferrous_mafic": 0.06,
        "lineament_density": 0.04,
        "lineament_intersections": 0.03,
        "endowment": 0.03,
    },
    confidence="Moderate",
    confidence_note=(
        "Al-OH absorption (gibbsite/kaolinite) coupled with ferricrete capping "
        "on preserved palaeo-plateaus is clearly discriminated at 20-30 m resolution."
    ),
    verification="Pitting, shallow auger drilling, and XRF analysis (available Al2O3 vs reactive silica)",
    minerals=("aluminium", "bauxite", "gibbsite"),
)

RARE_EARTHS = Commodity(
    key="rare_earths",
    name="Rare earth elements (REE)",
    group="Critical / tech",
    symbol="REE",
    color="#7b5ea7",
    systems="Carbonatite complexes, alkaline intrusions and ion-adsorption clays",
    deposit_style="Hydrothermally altered alkaline ring complexes and weathered clay blankets",
    weights={
        "hydroxyl_clay": 0.28,
        "iron_oxide": 0.24,
        "lineament_density": 0.20,
        "lineament_intersections": 0.14,
        "ferrous_mafic": 0.06,
        "relative_relief": 0.04,
        "endowment": 0.04,
    },
    confidence="Low",
    confidence_note=(
        "Screening captures the intense clay-iron hydrothermal halo and fault intersections "
        "characteristic of carbonatite/alkaline margins; REE minerals themselves require ground assay."
    ),
    verification="Radiometric spectrometry follow-up (Th/U proxy) and multi-element geochemical assay",
    minerals=("neodymium", "praseodymium", "dysprosium", "lanthanum", "cerium"),
)

COMMODITIES: tuple[Commodity, ...] = (
    GOLD,
    IRON_ORE,
    NICKEL_PGM,
    CHROMIUM,
    BASE_METALS,
    LITHIUM,
    MANGANESE,
    BAUXITE,
    RARE_EARTHS,
)

BY_KEY: dict[str, Commodity] = {c.key: c for c in COMMODITIES}

# ---------------------------------------------------------------------------
# The dominant-mineral raster's class domain
# ---------------------------------------------------------------------------
# Unlike the other categories, minerals is not a five-step ramp: a cell is coloured
# by whichever system scores highest there. These codes are what the GeoTIFF, the
# PMTiles drape, the PNG map and the web legend all agree on.
ZONE_WATER = 0
#: Catalogue order, so code 1 is gold and code 9 is REE. Adding a commodity adds a code.
COMMODITY_ZONE_CODES: dict[str, int] = {c.key: i + 1 for i, c in enumerate(COMMODITIES)}
BY_ZONE_CODE: dict[int, Commodity] = {code: BY_KEY[key] for key, code in COMMODITY_ZONE_CODES.items()}
#: Scored ground whose best system still reads below the indicated threshold. It stays
#: grey rather than taking the colour of a winner nobody should act on.
ZONE_BELOW_THRESHOLD = len(COMMODITIES) + 1
ZONE_BUILTUP = len(COMMODITIES) + 2
#: Matches `NODATA_CLASS` in utils/classification.py, which cannot be imported here:
#: this module is deliberately readable without GDAL.
ZONE_NODATA = 255

#: Commodities a client may ask about that this pipeline must not pretend to score.
#: Listing them is the honest half of the answer: silence reads as "nothing there".
UNSCREENED: tuple[Unscreenable, ...] = (
    Unscreenable(
        key="diamond",
        name="Diamonds (kimberlite)",
        reason=(
            "Kimberlite pipes are a few hundred metres across, below this pixel, and "
            "carry no distinctive reflectance; their indicator minerals are too small "
            "to see from orbit."
        ),
        needs="Airborne magnetics or ground indicator-mineral sampling",
    ),
    Unscreenable(
        key="coal",
        name="Coal and carbonaceous shale",
        reason=(
            "Carbonaceous seams sit under cover and their spectral contrast is swamped "
            "by soil and vegetation at 10-30 m resolution."
        ),
        needs="Stratigraphic mapping and borehole or seismic data",
    ),
    Unscreenable(
        key="gemstones",
        name="Gemstones (emerald, aquamarine, tourmaline)",
        reason=(
            "Gem-bearing pockets are metre-scale and their host alteration is not "
            "distinguishable at this resolution."
        ),
        needs="Ground mapping of host structures and pegmatite or schist zones",
    ),
)


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def validate() -> None:
    """Raise if any commodity could not be scored. Called by the engine and tests."""
    for commodity in COMMODITIES:
        unknown = set(commodity.weights) - set(EVIDENCE_KEYS)
        if unknown:
            raise ValueError(f"{commodity.key}: unknown evidence {sorted(unknown)}")
        total = sum(commodity.weights.values())
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"{commodity.key}: weights sum to {total:.6f}, not 1.0")
        if not commodity.confidence_note or not commodity.verification:
            raise ValueError(f"{commodity.key}: every commodity needs its caveat")
        if not commodity.symbol or not commodity.color:
            raise ValueError(f"{commodity.key}: the map needs a symbol and a colour")
    keys = [c.key for c in COMMODITIES] + [u.key for u in UNSCREENED]
    if len(keys) != len(set(keys)):
        raise ValueError("duplicate commodity key in the catalogue")
    # Two systems sharing a colour or a symbol would be one zone wearing two names on
    # the map, which is the exact failure the dominant-mineral sheet exists to avoid.
    for field_name in ("color", "symbol"):
        values = [getattr(c, field_name) for c in COMMODITIES]
        if len(values) != len(set(values)):
            raise ValueError(f"duplicate commodity {field_name} in the catalogue")


def commodity_index(
    layers: dict[str, np.ndarray],
    weights: dict[str, float],
) -> np.ndarray:
    """Weighted overlay of already-normalised evidence, as a 0-100 index.

    A cell missing some of its evidence is scored on the weight it does have, as
    long as `MIN_WEIGHT_COVERAGE` of the model is present; below that it is left
    as NaN rather than guessed. No-data cells stay no-data.
    """
    height, width = next(iter(layers.values())).shape
    total = np.zeros((height, width), dtype="float64")
    mass = np.zeros((height, width), dtype="float64")

    for key, weight in weights.items():
        layer = layers.get(key)
        if layer is None or weight == 0:
            continue
        arr = np.asarray(layer, dtype="float64")
        finite = np.isfinite(arr)
        total += np.where(finite, arr * weight, 0.0)
        mass += np.where(finite, weight, 0.0)

    with np.errstate(invalid="ignore", divide="ignore"):
        index = np.where(mass >= MIN_WEIGHT_COVERAGE, total / mass, np.nan)
    # Normalised evidence is 0-1; a weighted mean of it is the percentile index.
    return np.clip(index, 0.0, 1.0) * 100.0


def cell_index(
    layers: dict[str, np.ndarray],
    weights: dict[str, float],
    row: int,
    col: int,
) -> float | None:
    """One cell scored by the same rule `commodity_index` applies to the whole area.

    A candidate read straight off a weighted sum disagrees with the area table wherever
    an evidence layer is missing: the sum loses that weight, the index renormalizes over
    the weight it does have. None where the cell has too little evidence to score at all.
    """
    total = 0.0
    mass = 0.0
    for key, weight in weights.items():
        layer = layers.get(key)
        if layer is None or weight == 0:
            continue
        value = float(np.asarray(layer)[row, col])
        if not np.isfinite(value):
            continue
        total += value * weight
        mass += weight
    if mass < MIN_WEIGHT_COVERAGE:
        return None
    return float(np.clip(total / mass, 0.0, 1.0) * 100.0)


def dominant_zones(
    layers: dict[str, np.ndarray],
    water_mask: np.ndarray | None = None,
    builtup_mask: np.ndarray | None = None,
    threshold: float = INDICATED_P90,
    commodities: tuple[Commodity, ...] = COMMODITIES,
) -> tuple[np.ndarray, np.ndarray]:
    """Race every mineral system cell by cell: (class raster, winning score raster).

    The map answers "what is this ground most prospective for here", not "how prospective
    is it for one metal". Every system is raced on every cell, including ones the area as
    a whole reads cold on: a local high is still a target, and the area table beside the
    map is where the reader learns how much of the area supports it.

    Only the running best is held, never nine index rasters at once - at a regional AOI
    that is the difference between two arrays and several hundred megabytes. Ties go to
    the earlier commodity in the catalogue, so the raster is reproducible.

    Cells whose best score is below `threshold` are classed `ZONE_BELOW_THRESHOLD` but
    keep their score, so a grey cell can still be read rather than merely dismissed.
    """
    height, width = next(iter(layers.values())).shape
    best = np.full((height, width), -np.inf, dtype="float64")
    zones = np.full((height, width), ZONE_NODATA, dtype="uint8")

    for commodity in commodities:
        index = commodity_index(layers, commodity.weights)
        wins = np.isfinite(index) & (index > best)
        best[wins] = index[wins]
        zones[wins] = COMMODITY_ZONE_CODES[commodity.key]
        del index, wins

    observed = np.isfinite(best)
    scores = np.where(observed, best, np.nan).astype("float32")
    zones[observed & (best < threshold)] = ZONE_BELOW_THRESHOLD

    if water_mask is not None:
        water = np.asarray(water_mask, dtype=bool)
        zones[water] = ZONE_WATER
        scores[water] = np.nan
    if builtup_mask is not None:
        builtup = np.asarray(builtup_mask, dtype=bool)
        zones[builtup] = ZONE_BUILTUP
        scores[builtup] = np.nan

    return zones, scores


def dominant_area_stats(
    zones: np.ndarray,
    scores: np.ndarray,
    cell_km2: float,
    commodities: tuple[Commodity, ...] = COMMODITIES,
) -> list[dict]:
    """The figures the map legend prints: how much ground each system owns, and how hot.

    `share_pct` is of the whole raster, water and built-up included, so the shares add to
    the area the reader sees on the sheet rather than to a silently reduced denominator.
    """
    total = int(zones.size)
    rows: list[dict] = []
    for commodity in commodities:
        code = COMMODITY_ZONE_CODES[commodity.key]
        owned = zones == code
        count = int(np.count_nonzero(owned))
        values = np.asarray(scores, dtype="float64")[owned]
        finite = values[np.isfinite(values)]
        rows.append(
            {
                "key": commodity.key,
                "code": code,
                "name": commodity.name,
                "symbol": commodity.symbol,
                "color": commodity.color,
                "cells": count,
                "area_km2": round(count * cell_km2, 2),
                "share_pct": round(count / total * 100.0, 2) if total else 0.0,
                "peak_score": round(float(finite.max()), 1) if finite.size else None,
                "mean_score": round(float(finite.mean()), 1) if finite.size else None,
            }
        )
    rows.sort(key=lambda row: (row["area_km2"], row["peak_score"] or 0.0), reverse=True)
    return rows


def band_of(score: float | None) -> str:
    """Class name for one index value."""
    if score is None or not np.isfinite(score):
        return "Not indicated"
    if score >= BAND_HIGH:
        return "High"
    if score >= BAND_MODERATE:
        return "Moderate"
    if score >= BAND_LOW:
        return "Low"
    return "Not indicated"


def evidence_at(
    layers: dict[str, np.ndarray],
    weights: dict[str, float],
    row: int,
    col: int,
    top: int = 3,
) -> list[dict]:
    """The evidence that actually drove the score at one cell, strongest first.

    Reported as weight x value, so a heavily weighted layer that reads low does
    not outrank a modest layer that reads high.
    """
    contributions: list[dict] = []
    for key, weight in weights.items():
        layer = layers.get(key)
        if layer is None or weight == 0:
            continue
        value = float(np.asarray(layer)[row, col])
        if not np.isfinite(value):
            continue
        contributions.append(
            {"evidence": key, "value": round(value, 3), "weight": weight,
             "contribution": round(weight * value, 4)}
        )
    contributions.sort(key=lambda item: item["contribution"], reverse=True)
    return contributions[:top]


def rank_commodities(
    layers: dict[str, np.ndarray],
    mask: np.ndarray | None = None,
    target: tuple[int, int] | None = None,
    commodities: tuple[Commodity, ...] = COMMODITIES,
    indices: dict[str, np.ndarray] | None = None,
) -> list[dict]:
    """Score every commodity over the survey area and rank them.

    A commodity is marked `indicated` when its top decile clears the moderate
    band *and* the index varies by at least `MIN_CONTRAST` across the area: a
    uniform AOI has a best cell without having a target.

    `indices` lets a caller supply an index it already computed (the minerals
    engine reuses its historic gold raster so the map and the table agree), and
    `mask` excludes cells such as open water and built-up ground.
    """
    ranked: list[dict] = []
    for commodity in commodities:
        supplied = (indices or {}).get(commodity.key)
        index = supplied if supplied is not None else commodity_index(layers, commodity.weights)

        values = np.asarray(index, dtype="float64")
        if mask is not None:
            values = np.where(mask, np.nan, values)
        finite = values[np.isfinite(values)]
        if finite.size == 0:
            continue

        mean = float(np.mean(finite))
        p90 = float(np.percentile(finite, 90))
        p10 = float(np.percentile(finite, 10))
        contrast = p90 - p10
        share_high = float(np.mean(finite >= BAND_HIGH) * 100.0)

        target_score = None
        evidence: list[dict] = []
        if target is not None:
            row, col = target
            cell = float(values[row, col]) if values.shape[0] > row and values.shape[1] > col else np.nan
            if np.isfinite(cell):
                target_score = round(cell, 1)
                evidence = evidence_at(layers, commodity.weights, row, col)

        ranked.append(
            {
                "key": commodity.key,
                "name": commodity.name,
                "group": commodity.group,
                "symbol": commodity.symbol,
                "color": commodity.color,
                "zone_code": COMMODITY_ZONE_CODES[commodity.key],
                "systems": commodity.systems,
                "deposit_style": commodity.deposit_style,
                "confidence": commodity.confidence,
                "confidence_note": commodity.confidence_note,
                "verification": commodity.verification,
                "minerals": list(commodity.minerals),
                "area_mean": round(mean, 1),
                "area_top_decile": round(p90, 1),
                "area_contrast": round(contrast, 1),
                "share_high_pct": round(share_high, 2),
                "area_band": band_of(p90),
                # A commodity needs somewhere to go as well as a good top decile.
                "indicated": p90 >= INDICATED_P90 and contrast >= MIN_CONTRAST,
                "target_score": target_score,
                "target_band": band_of(target_score),
                "top_evidence": evidence,
            }
        )

    # Indicated first, then by how strongly the area reads. A commodity that is
    # not indicated anywhere in the AOI still appears, at the bottom, with the
    # reason in `confidence_note` - "we looked and it reads cold" is a result.
    ranked.sort(key=lambda item: (item["indicated"], item["area_top_decile"]), reverse=True)
    return ranked


def headline(ranked: list[dict], limit: int = 3) -> list[str]:
    """Short names of the commodities the area is indicated for."""
    return [item["name"] for item in ranked if item["indicated"]][:limit]


def unscreened_payload() -> list[dict]:
    """`UNSCREENED` as plain dicts, for the report and the JSON summary."""
    return [
        {"key": entry.key, "name": entry.name, "reason": entry.reason, "needs": entry.needs}
        for entry in UNSCREENED
    ]
