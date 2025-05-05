# Change Log

All notable changes to the "cybedefend-vscode" extension will be documented in this file.

## [Unreleased]

*Work in progress for the next release.*

## [0.0.6] - 2025-05-05

### Added
- Scan optimization: Automatically exclude temporary files and directories from scanning.
- Ignored patterns include node_modules, build artifacts, and other common temporary directories.

### Changed
- Scanning process now filters out non-essential files to improve performance and reduce unnecessary scan load.

## [0.0.5] - 2025-05-03

### Added
- Webview dropdown: display SCA findings in the vulnerabilities list.

### Changed
- `_prepareVulnerabilitiesForWebview`: updated filter/map to detect `scaDetectedPackage` when `vulnerabilityType` is missing, and assign type `sca` accordingly.

### Fixed
- Correctly include SCA entries in the dropdown even if their payload lacks a `vulnerabilityType` field.

## [0.0.4] - 2025-04-28

### Added
- Configuration: Allow creating a new project directly during organization project selection.
- Details View: Highlight the specific line number in the editor when opening a vulnerability location (SAST/IaC).

### Fixed
- Details View: Prevent opening file location twice when clicking vulnerability in list views (SAST/IaC/SCA).
- Details View: Correctly pass workspace root to open file location command when clicking link in details panel.
- SCA View: Display SCA findings as a flat list instead of incorrectly grouping by '(File not specified)'.
- SCA View: Disable line highlighting when opening SCA vulnerability location (manifest file).

## [0.0.3] - 2024-07-28

### Added
- Initial release with basic SAST, SCA, IaC scanning capabilities.
- Authentication via API Key and Project ID.
- Summary, Findings (SAST, SCA, IaC), Details, and Settings views.
- Chatbot view (Security Champion) for vulnerability context.

### Fixed
- Improved API error handling and user feedback.
- Addressed minor UI inconsistencies.

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