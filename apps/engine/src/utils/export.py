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

        lines = [
            '  <Placemark>',
            f'    <name>Candidate #{rank} ({score}/100 - {cls})</name>',
            '    <description><![CDATA[',
            f'      <b>Rank:</b> #{rank}<br/>',
            f'      <b>Potential Score:</b> {score} / 100<br/>',
            f'      <b>Class:</b> {cls}<br/>',
            f'      <b>Distance from Client Site:</b> {dist:.2f} km<br/>',
            f'      <b>GPS Latitude:</b> {lat:.5f}<br/>',
            f'      <b>GPS Longitude:</b> {lon:.5f}<br/>',
        ]
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


def export_kmz(kml_path: Path, kmz_path: Path) -> Path:
    """Compress KML file into a standalone KMZ package."""
    with zipfile.ZipFile(kmz_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(kml_path, arcname="doc.kml")
    return kmz_path

