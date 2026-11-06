# 🔌 SiteSurveyor AI — Model Context Protocol (MCP) Guide

This guide explains how to connect AI agents (Claude, Gemini, Cursor, ChatGPT, or custom LLM bots) directly to SiteSurveyor AI using the **Model Context Protocol (MCP)**.

---

## 🚀 Quick Setup (Claude Desktop & Cursor)

To connect SiteSurveyor AI to Claude Desktop or Cursor, add this configuration block to your MCP config:

* **Claude Desktop**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
* **Cursor**: `.cursor/mcp.json` or Global Settings $\rightarrow$ MCP

```json
{
  "mcpServers": {
    "SiteSurveyorAI": {
      "command": "python",
      "args": ["-m", "src.mcp_server"],
      "cwd": "c:\\Users\\THINKPAD\\Documents\\SiteSurveyorAI",
      "env": {
        "PYTHONUNBUFFERED": "1"
      }
    }
  }
}
```

Once saved, restart Claude Desktop or Cursor. The hammer icon (🛠️) will light up with 6 active tools!

---

## 🛠️ Available MCP Tools

### 1. `survey_site`
Runs a comprehensive multi-criteria screening across all requested categories.
* **Parameters**:
  * `latitude` *(float, required)*: GPS latitude (e.g. `-19.50487`)
  * `longitude` *(float, required)*: GPS longitude (e.g. `29.84598`)
  * `categories` *(list[str], optional)*: `["all"]`, `["water"]`, `["minerals"]`, `["soil"]`, `["hazard"]`
  * `client_name` *(str, optional)*: Client or project name for report attribution
* **Returns**: Executive summary text, scores for all domains, primary GPS coordinates for drilling/mining/building, and deliverable file paths.

### 2. `get_boreholes`
Focuses on Category 1: Groundwater potential and precision borehole siting.
* **Parameters**:
  * `latitude` *(float, required)*
  * `longitude` *(float, required)*
  * `top_k` *(int, default: 5)*: Number of ranked drilling sites
* **Returns**: Property GWPZ score, Top $K$ drilling coordinates with distance in km, score (0–100), and recommended Vertical Electrical Sounding (VES) verification advice.

### 3. `get_minerals`
Focuses on Category 2: Shear-zone gold prospectivity & hydrothermal alteration.
* **Parameters**:
  * `latitude` *(float, required)*
  * `longitude` *(float, required)*
  * `top_k` *(int, default: 5)*
* **Returns**: Mineral prospectivity index, structural lineament intersection context, alteration indices (iron oxide, gossan, hydroxyl clay), and ranked exploration targets.

### 4. `get_soil_capability`
Focuses on Category 3: Land & Soil agricultural capability and erosion risk.
* **Parameters**:
  * `latitude` *(float, required)*
  * `longitude` *(float, required)*
  * `top_k` *(int, default: 5)*
* **Returns**: Soil Capability Index (SCI), erosion risk score, and prime arable land zones.

### 5. `get_hazard_safety`
Focuses on Category 5: Multi-hazard environmental screening & site safety due diligence.
* **Parameters**:
  * `latitude` *(float, required)*
  * `longitude` *(float, required)*
  * `top_k` *(int, default: 5)*
* **Returns**: Site Safety Score (0–100, 100=safest), flood history (from 40-year Landsat WOfS), slope failure risk, wildfire dry biomass fuel, and safest buildable coordinates.

### 6. `get_executive_dossier`
Retrieves the consolidated cross-category executive scorecard and the path to the master JSON dossier on disk.

---

## 📄 MCP Resources

Agents can read these virtual URIs directly:
* `sitesurveyor://reports/master_dossier.json` — Structured JSON metadata of all scores and targets.

---

## 🌐 Running Over Network (SSE Cloud Transport)

To run the MCP server as a remote service (e.g. for agents running on a server or Render):

```bash
python -m src.mcp_server --transport sse --host 0.0.0.0 --port 8000
```

Remote agents connect via SSE at:
`http://<your-host>:8000/sse`

