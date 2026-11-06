"""
SiteSurveyor AI — MCP Server Entrypoint
=======================================
Direct entrypoint to launch the SiteSurveyor AI Model Context Protocol server.

Usage:
    python -m src.mcp_server                     # stdio for Claude Desktop / local agents
    python -m src.mcp_server --transport sse     # SSE for remote cloud agents / Render
"""
from src.mcp.server import run_server

if __name__ == "__main__":
    run_server()

