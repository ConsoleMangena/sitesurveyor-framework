"""
SiteSurveyor AI — Export Utilities
===================================
Exports candidate coordinates, heatmaps, and survey results to Google Earth
KML/KMZ for smartphone GPS navigation in the field.
"""
from __future__ import annotations

import zipfile
from pathlib import Path

import src.config as cfg


def export_candidates_kml(
    candidates: list[dict],
    out_path: Path,
    survey_name: str = "Groundwater Potential",
    footnote: str = "Recommended for ground geophysical verification (VES / ERT).",
) -> Path:
    """
    Generate an interactive Google Earth KML file for mobile GPS navigation.
    """
    kml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        '<Document>',
        f'  <name>SiteSurveyor AI — {survey_name} Candidates</name>',
        f'  <description>Automated site screening results for {cfg.CLIENT}</description>',
        '',
        '  <!-- Style for Target Site -->',
        '  <Style id="targetStyle">',
        '    <IconStyle>',
        '      <scale>1.3</scale>',
        '      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/star.png</href></Icon>',
        '    </IconStyle>',
        '    <LabelStyle><scale>1.0</scale></LabelStyle>',
        '  </Style>',
        '',
        '  <!-- Style for Top Candidates -->',
        '  <Style id="candidateStyle">',
        '    <IconStyle>',
        '      <scale>1.1</scale>',
        '      <Icon><href>http://maps.google.com/mapfiles/kml/paddle/ylw-circle.png</href></Icon>',
        '    </IconStyle>',
        '    <LabelStyle><scale>0.9</scale></LabelStyle>',
        '  </Style>',
        '',
        '  <!-- Placemark: Client Target Property -->',
        '  <Placemark>',
        f'    <name>Target Property ({cfg.CLIENT})</name>',
        f'    <description><![CDATA[<b>Client:</b> {cfg.CLIENT}<br/><b>Coordinates:</b> {cfg.TARGET_LAT:.5f}, {cfg.TARGET_LON:.5f}]]></description>',
        '    <styleUrl>#targetStyle</styleUrl>',
        '    <Point>',
        f'      <coordinates>{cfg.TARGET_LON:.6f},{cfg.TARGET_LAT:.6f},0</coordinates>',
        '    </Point>',
        '  </Placemark>',
        '',
    ]

    for cand in candidates:
        rank = cand.get("rank", 0)
        score = cand.get("potential_score", cand.get("prospectivity_score", 0))
        cls = cand.get("class_name", "High")
        dist = cand.get("distance_from_target_km", 0)
        lat = cand.get("latitude", 0)
        lon = cand.get("longitude", 0)
        primary_comm = cand.get("primary_commodity")
        indicated_minerals = cand.get("indicated_minerals")

        placemark_name = (
            f"Target #{rank} — {primary_comm} ({score}/100 - {cls})"
            if primary_comm
            else f"Candidate #{rank} ({score}/100 - {cls})"
        )

        lines = [
            '  <Placemark>',
            f'    <name>{placemark_name}</name>',
            '    <description><![CDATA[',
            f'      <b>Rank:</b> #{rank}<br/>',
            f'      <b>Potential Score:</b> {score} / 100<br/>',
            f'      <b>Class:</b> {cls}<br/>',
            f'      <b>Distance from Client Site:</b> {dist:.2f} km<br/>',
            f'      <b>GPS Latitude:</b> {lat:.5f}<br/>',
            f'      <b>GPS Longitude:</b> {lon:.5f}<br/>',
        ]
        if primary_comm:
            p_score = cand.get("primary_commodity_score", score)
            lines.append(f'      <b>Primary Mineral Affinity:</b> {primary_comm} ({p_score}/100)<br/>')
        if indicated_minerals:
            lines.append(f'      <b>Indicated in Survey Area:</b> {indicated_minerals}<br/>')
        for note in cand.get("field_notes", []):
            lines.append(f'      <b>{note}</b><br/>')
        lines.extend([
            f'      <p><i>{footnote}</i></p>',
            '    ]]></description>',
            '    <styleUrl>#candidateStyle</styleUrl>',
            '    <Point>',
            f'      <coordinates>{lon:.6f},{lat:.6f},0</coordinates>',
            '    </Point>',
            '  </Placemark>',
        ])
        kml_lines.extend(lines)

    kml_lines.extend([
        '</Document>',
        '</kml>',
    ])

    out_path.write_text("\n".join(kml_lines), encoding="utf-8")
    return out_path


def export_mineral_commodities_csv(commodities: list[dict], out_path: Path) -> Path:
    """Export ranked mineral screening results to CSV for desktop GIS and spreadsheet analysis."""
    import csv

    fieldnames = [
        "key",
        "name",
        "group",
        "deposit_style",
        "confidence",
        "indicated",
        "area_top_decile",
        "area_mean",
        "area_contrast",
        "share_high_pct",
        "target_score",
        "target_band",
        "verification",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for comm in commodities:
            writer.writerow({
                "key": comm.get("key"),
                "name": comm.get("name"),
                "group": comm.get("group"),
                "deposit_style": comm.get("deposit_style"),
                "confidence": comm.get("confidence"),
                "indicated": "YES" if comm.get("indicated") else "NO",
                "area_top_decile": comm.get("area_top_decile"),
                "area_mean": comm.get("area_mean"),
                "area_contrast": comm.get("area_contrast"),
                "share_high_pct": comm.get("share_high_pct"),
                "target_score": comm.get("target_score"),
                "target_band": comm.get("target_band"),
                "verification": comm.get("verification"),
            })
    return out_path


def export_kmz(kml_path: Path, kmz_path: Path) -> Path:
    """Compress KML file into a standalone KMZ package."""
    with zipfile.ZipFile(kmz_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, arcname="doc.kml")
    return kmz_path

