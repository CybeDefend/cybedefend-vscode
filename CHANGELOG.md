# Change Log

All notable changes to the "cybedefend-vscode" extension will be documented in this file.

## [Unreleased]

*Work in progress for the next release.*

## [0.0.3] - 2025-04-23

### Fixed
- Chatbot: Language adaptation.

## [0.0.2] - 2025-04-23

### Added
- Vulnerability Views (SAST, IaC, SCA): Files are now sorted by criticality score (based on severity and count of vulnerabilities) in descending order, showing the most critical files first.

### Fixed
- Chatbot: Resolved an issue preventing Markdown formatting from being correctly rendered in AI responses.

## [0.0.1] - 2025-04-22

### Added
- Initial alpha release of the CybeDefend VS Code Extension.
- Support for SAST, SCA, and IaC vulnerability scanning.
- Dedicated webview panels for Summary, SAST, SCA, IaC results.
- Integrated Security Champion chatbot panel.
- Commands for:
    - Starting scans (`CybeDefend: Start Vulnerability Scan`)
    - Updating API Key (`CybeDefend: Update API Key (Global)`)
    - Updating Project ID (`CybeDefend: Update Project ID (Current Workspace)`)
    - Viewing vulnerability details.
    - Opening file location from vulnerability details.
- API key authentication (stored globally).
- Workspace-level project configuration (Organization/Project ID).
- Basic CybeDefend Activity Bar view container.

### Changed
- *No changes in the initial release.*

### Fixed
- *No fixes in the initial release.*