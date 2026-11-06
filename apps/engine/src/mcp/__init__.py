"""
SiteSurveyor AI — Model Context Protocol (MCP) Package
======================================================
Exposes satellite intelligence, prioritised borehole siting, mineral targeting,
land capability, and natural hazard due diligence to AI Agents.
"""
from src.mcp.server import mcp, run_server

__all__ = ["mcp", "run_server"]

