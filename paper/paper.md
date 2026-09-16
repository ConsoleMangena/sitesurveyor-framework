---
title: 'SiteSurveyor: An Open-Source Framework for Developing Secure, Blockchain-Based Land Surveying Systems'
tags:
  - land surveying
  - blockchain
  - AI
  - Automation
  - Rust
  - React
  - WebAssembly
authors:
  - name: Consolation Mangena
    orcid: 0009-0006-2708-914X
    affiliation: 1
affiliations:
  - name: Eineva Labs
    index: 1
date: 16 September 2026
bibliography: paper.bib
---

![SiteSurveyor logo.\label{fig:logo}](logo.png){ width=15% }

# Summary

This paper presents SiteSurveyor, an open-source framework for developing secure, blockchain-based land surveying systems. The framework addresses the fragmentation of land surveying software, where field data collection, surveying computation, CAD drafting, project administration, data management, collaboration, and other operational functions are commonly distributed across separate applications and services.

SiteSurveyor provides an integrated software foundation for developing land surveying systems within a common architecture. It combines a reusable surveying computation engine with an AI-assisted CAD environment, project and field-workflow management, survey-data management, visualization, user and workspace management, and cross-platform application infrastructure. The framework is designed to support the complete land-surveying workflow from field operations and survey computation through drafting, project management, and production of survey information.

# Statement of Need

A central component of SiteSurveyor is its reusable surveying computation engine, implemented in Rust and made available across web and desktop environments through WebAssembly and native application integration. This enables surveying applications built with the framework to share a common computational foundation while supporting different interfaces and deployment environments.

Security is incorporated into the framework architecture through authentication, controlled access, role and workspace based authorization, and protected management of surveying information. The framework further incorporates blockchain-based mechanisms for verification and data integrity, allowing selected survey records, files, and transactions to be associated with independently verifiable blockchain evidence. Blockchain is therefore used as a trust and verification layer within the broader surveying system rather than as a replacement for conventional surveying data storage and computation.

The primary contribution of SiteSurveyor is a reusable open-source architecture for developing secure and integrated land surveying systems. By combining surveying computation, AI-assisted CAD, operational workflows, application infrastructure, and blockchain-based verification within a common framework, SiteSurveyor provides developers and researchers with a foundation for building specialized surveying systems without repeatedly implementing the underlying software infrastructure from scratch.

Land surveying practice depends on a range of software tools for coordinate geometry, terrain modelling, CAD drafting, project management, and data management. In current practice these functions are typically spread across separate commercial applications—each with its own data format, licensing model, and integration requirements—creating interoperability barriers and duplicated effort for developers who build surveying solutions [@ghilani2017adjustment; @wolf2014elementary]. Open-source geospatial libraries such as PROJ [@proj2024], GDAL [@gdal2024], and the GeoRust ecosystem [@georust2024] provide foundational components, but no existing open-source project combines survey-specific computation, CAD, operational workflow management, and data integrity verification in a single integrated framework. SiteSurveyor addresses these gaps for survey software developers, GIS researchers, and organisations developing custom land surveying or land administration systems.

# State of the Field

Several open-source tools address individual aspects of the surveying pipeline. QGIS [@qgis2024] provides comprehensive GIS analysis and cartographic output but does not include survey-specific computation such as traverse adjustment, resection, or set-out. OpenDroneMap [@opendronemap2024] handles aerial photogrammetric processing to produce orthomosaics and digital elevation models, while CloudCompare [@cloudcompare2024] offers 3D point-cloud processing and comparison. Survey2GIS and GeoEasy [@siki2018geoeasypaper] serve as conversion and adjustment tools for field observations but lack integrated CAD or project management capabilities.

On the blockchain side, research into blockchain-based land administration has accelerated, with frameworks proposed for cadastral records using Hyperledger Fabric [@ali2023secure] and Ethereum [@bennett2021blockchain]. Vos et al. [@vos2017blockchain] examined blockchain as a vehicle for transparent land administration in developing economies. However, these efforts have focused primarily on land registry and title management rather than the operational surveying workflow—field computation, drafting, project administration—that produces the spatial data in the first place.

SiteSurveyor differs from these existing tools in three ways. First, it integrates survey-specific computation (coordinate geometry, TIN generation, volumetric analysis) with an AI-assisted CAD drafting environment and operational project management within a single codebase, eliminating the need to bridge separate applications. Second, the computation engine is implemented in Rust and compiled to both WebAssembly and native targets from the same source, ensuring deterministic results across browser and desktop deployments [@haas2017webassembly]. Third, blockchain verification is incorporated as an optional integrity layer—recording cryptographic hashes of survey artifacts on Solana [@yakovenko2018solana]—rather than as a replacement for conventional data storage.

# Software Design

SiteSurveyor is structured as a multi-tier system comprising a Rust computation engine, a TypeScript/React frontend, a Supabase backend, Solana blockchain programs, and an AI gateway service. \autoref{fig:architecture} illustrates the high-level component relationships.

![SiteSurveyor system architecture. The survey-core Rust engine is compiled to WebAssembly for the browser frontend and accessed via native IPC on the Tauri desktop shell. The frontend communicates with Supabase for data and authentication, the Solana blockchain for file anchoring and payments, and the AI gateway for natural-language CAD commands.\label{fig:architecture}](architecture.jpg){ width=100% }

The core computation engine (`survey-core`) is a pure-Rust library with no platform-specific dependencies, compiled to both native targets and WebAssembly via `wasm-bindgen` [@wasm_bindgen2024]. It provides modules for coordinate geometry (forward/inverse, bearing-bearing and distance-distance intersection, traverse adjustment with Bowditch correction, three-point resection via Tienstra, and set-out computations), terrain modelling (Delaunay triangulation via the Spade library [@spade2024], constrained TIN, contour generation through marching triangles and marching squares), volumetric analysis (cut-and-fill, cross-section profiles, surface-to-surface comparison), alignment geometry (horizontal circular curves and vertical parabolic curves), and spatial I/O (GeoJSON [@butler2016geojson], WKT, DXF, and CSV). Native-only capabilities—PROJ-based datum transformations [@proj2024], GDAL raster I/O [@gdal2024], ESRI Shapefile, and LiDAR LAS/LAZ—are feature-gated in the Tauri desktop shell and excluded from the WASM target.

The design deliberately separates the platform-independent computation core from platform-specific I/O. This separation allows the same surveying algorithms to produce deterministic results whether invoked in the browser through WebAssembly or through Tauri IPC on the desktop, while still supporting richer file-format support when native libraries are available. Coordinates use a Northing/Easting/Elevation convention and are locally shifted (centroid subtraction) before triangulation to preserve `f64` precision with large UTM coordinate values.

The frontend is built with React 19 and TypeScript using Vite [@vite2024] and deploys as both a progressive web application and a Tauri [@tauri2024] desktop application. It includes an AI-assisted CAD drafting canvas with tool-based editing, survey point management with MapLibre GL [@maplibre2024] for 2D mapping and Three.js [@threejs2024] for 3D terrain visualization, a project hub with job tracking and time management, quoting and invoicing, a file manager with QR-code-based field data capture, team chat, and multi-workspace support (personal, business, and platform administration tiers).

The backend uses Supabase [@supabase2024] for PostgreSQL hosting, row-level security, authentication, and edge functions. Multi-tenant isolation is enforced at the database level: every table carries a `workspace_id` column and PostgreSQL Row-Level Security policies restrict access to the user's authorized workspaces and roles (owner, admin, operations manager, finance, sales, technician, viewer).

Blockchain integration operates through an Anchor-based Solana program (`sitesurveyor-file-record`) that creates program-derived accounts (PDAs) keyed by workspace UUID and file content hash. The `anchor_file` instruction records a cryptographic hash on-chain; `delete_file` and `restore_file` manage soft-delete attestations. Users choose per file whether to anchor on-chain (tamper-evident, immutable) or store off-chain in Supabase (fast, affordable). Wallet adapters allow the user's own Solana wallet to pay network gas fees directly.

An AI gateway service manages communication between the frontend assistant and language model providers through a model context protocol (MCP) interface, enabling natural-language CAD commands and automated workflow operations.

# Research Impact Statement

SiteSurveyor is an early-stage open-source framework released under the MIT licence and hosted publicly at [https://github.com/ConsoleMangena/sitesurveyor-framework](https://github.com/ConsoleMangena/sitesurveyor-framework). The framework is designed to serve as research infrastructure for investigators studying integrated surveying workflows, blockchain-based verification of spatial data, and cross-platform geospatial computation via WebAssembly.

Concrete community-readiness signals include: the full source code for the computation engine, frontend, and Solana programs is publicly available; the repository includes CI workflows, linting, type-checking, and an automated test suite (Vitest for the frontend, Rust unit tests for `survey-core`); and the Solana program is deployable to devnet with documented instructions. The framework's modular architecture—where the computation engine, frontend, backend, and blockchain layer are independently usable—enables researchers to adopt individual components without committing to the full stack.

The dual-target compilation strategy (Rust to both WASM and native) provides a reproducible testbed for benchmarking WebAssembly performance in geospatial computation workloads against native execution, an area of active research interest [@zhang2024wasm]. The hybrid on-chain/off-chain storage model offers a practical experimental platform for researchers exploring blockchain-based data integrity in land administration, complementing existing cadastral blockchain research that has focused on title registration rather than operational surveying workflows [@vos2017blockchain; @bennett2021blockchain].

# AI Usage Disclosure

Generative AI tools were used during the development of SiteSurveyor for code assistance, debugging support, and drafting documentation. All AI-generated code was reviewed, tested, and validated by the author before integration. The surveying computation algorithms in `survey-core` were verified against known survey textbook solutions [@ghilani2017adjustment; @wolf2014elementary] and validated through unit tests with the `approx` crate for floating-point comparison.

# Acknowledgements

The author acknowledges the open-source communities behind Rust, Tauri, React, Supabase, Solana, the GeoRust ecosystem, the Spade triangulation library, and the Anchor framework, whose tools form the foundation of this framework. SiteSurveyor is developed by Eineva Labs.

# References
