// src/ui/html/findingsHtml.ts
import { escape } from 'lodash';
import * as vscode from 'vscode';
// Ensure correct path to DTOs and Enums
import path from 'path';
import { ScanType } from '../../api/apiService';
import { DetailedVulnerability, IacVulnerabilityDetectionDto, SastVulnerabilityDetectionDto, ScaVulnerabilityWithCvssDto, VulnerabilitySeverityEnum } from '../../dtos/result/details';
import { getNonce } from '../../utilities/utils';
import { getCodiconStyleSheet, getCommonAssetUris, getSeverityClass, severityColorMap, severityToIconMap } from './commonHtmlUtils';

const NO_FILE_KEY = '(File not specified)'; // Define constant for clarity

/**
 * Define weights for each severity level to calculate a criticality score.
 */
const severityWeights: { [key in VulnerabilitySeverityEnum | 'UNKNOWN']: number } = {
    [VulnerabilitySeverityEnum.CRITICAL]: 100,
    [VulnerabilitySeverityEnum.HIGH]: 50,
    [VulnerabilitySeverityEnum.MEDIUM]: 20,
    [VulnerabilitySeverityEnum.LOW]: 5,
    [VulnerabilitySeverityEnum.INFO]: 1,
    'UNKNOWN': 0 // Assign a weight for unknown severity
};

/**
 * Calculates a criticality score for a list of vulnerabilities based on their severities.
 * @param vulnerabilities - Array of vulnerability findings for a single file/group.
 * @returns The calculated criticality score.
 */
function _calculateFileCriticalityScore(vulnerabilities: DetailedVulnerability[]): number {
    let score = 0;
    if (!vulnerabilities) {
        return 0;
    }
    for (const vuln of vulnerabilities) {
        const severity = vuln?.currentSeverity?.toUpperCase() as VulnerabilitySeverityEnum || 'UNKNOWN';
        score += severityWeights[severity] || 0; // Add weight, default to 0 if severity is somehow invalid
    }
    return score;
}

/**
 * Groups findings by their file path.
 * @param findings - Array of vulnerability findings.
 * @returns Map where keys are file paths and values are arrays of findings for that file.
 */
function _groupFindingsByFile(findings: DetailedVulnerability[]): Map<string, DetailedVulnerability[]> {
    const grouped = new Map<string, DetailedVulnerability[]>();

    for (const vuln of findings) {
        // Basic validation of the vulnerability object
        if (!vuln?.vulnerability) {
            console.warn("Skipping finding due to missing vulnerability details:", vuln?.id);
            continue;
        }

        let filePath: string | undefined | null = null;

        // Determine file path based on vulnerability type
        switch (vuln.vulnerability.vulnerabilityType) {
            case 'sast':
                filePath = (vuln as SastVulnerabilityDetectionDto).path;
                break;
            case 'iac':
                filePath = (vuln as IacVulnerabilityDetectionDto).path;
                break;
            case 'sca':
                // For SCA, use the manifest file where the package was detected
                filePath = (vuln as ScaVulnerabilityWithCvssDto).scaDetectedPackage?.fileName;
                break;
            default:
                console.warn(`Unknown vulnerability type for grouping: ${vuln.vulnerability.vulnerabilityType}`, vuln.id);
        }

        const key = filePath || NO_FILE_KEY; // Use constant if path is missing
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)?.push(vuln);
    }
    return grouped;
}

// REMOVED: _createOpenFileCommandUri function is no longer needed as opening file is handled by the provider.

/**
 * Generates the HTML content for a Findings Webview View (SAST, IaC, SCA).
 * @param findings - The list of vulnerabilities to display.
 * @param scanType - The type of scan ('sast', 'iac', 'sca').
 * @param webview - The VS Code Webview instance.
 * @param extensionUri - The URI of the extension directory.
 * @returns The complete HTML string for the webview.
 */
export function getFindingsViewHtml(
    findings: DetailedVulnerability[],
    scanType: ScanType,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);

    const findingsCount = findings?.length ?? 0;
    const groupedFindings = _groupFindingsByFile(findings);
    let findingsGroupHtml = '';
    let allFindingsHtml = ''; // Added for direct SCA list

    if (findingsCount === 0) {
        findingsGroupHtml = '<p class="no-findings">No findings of this type were detected.</p>';
    } else if (scanType === 'sca') {
        // --- SCA: Display all findings directly without grouping --- 
        const listItemsHtml = findings.map(vuln => {
            if (!vuln?.vulnerability) { return ''; }

            const severity = vuln.currentSeverity?.toUpperCase() as VulnerabilitySeverityEnum || VulnerabilitySeverityEnum.UNKNOWN;
            const iconId = severityToIconMap[severity] || severityToIconMap.UNKNOWN;
            const severityClass = getSeverityClass(severity);
            const severityColor = severityColorMap[severity] || severityColorMap.UNKNOWN;
            const severityStyle = `color: ${severityColor}; font-weight: bold;`;

            const meta = vuln.vulnerability;
            const title = escape(meta.name || vuln.id); // Use ID as fallback title

            const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
            const pkg = scaVuln.scaDetectedPackage;
            const locationText = pkg ? `${escape(pkg.packageName || '?')}@${escape(pkg.packageVersion || '?')}` : 'Package N/A';
            const manifestFile = pkg?.fileName || NO_FILE_KEY;

            const locationHtml = `<span class="finding-location" title="Found in: ${escape(manifestFile)}">${locationText}</span>`;

            let vulnDataString = '';
            try {
                vulnDataString = escape(JSON.stringify(vuln));
            } catch (e) {
                console.error("Failed to stringify finding data:", e, vuln.id);
                vulnDataString = escape(JSON.stringify({ id: vuln.id, error: 'Data too complex or circular' }));
            }
            return `
                <li class="finding-item ${severityClass}"
                    data-vulnerability='${vulnDataString}'
                    data-scan-type='${scanType}'
                    title="${escape(vuln.id)} - Click for details and location"
                    tabindex="0"
                    role="button"
                    aria-label="Vulnerability: ${title}, Severity: ${severity}, Package: ${locationText}. Press Enter or Space to view details and location.">
                    <span class="codicon codicon-${iconId} severity-icon" style="${severityStyle}" aria-hidden="true"></span>
                    <div class="finding-content">
                        <span class="finding-title">${title}</span>
                        ${locationHtml}
                    </div>
                </li>`;
        }).join('');

        // Wrap the direct list in a simple container
        allFindingsHtml = `<ul class="findings-list-direct">${listItemsHtml}</ul>`;

    } else {
        // 1. Calculate score for each group
        const scoredGroups = Array.from(groupedFindings.entries()).map(([filePathKey, fileVulns]) => ({
            filePathKey,
            fileVulns,
            score: _calculateFileCriticalityScore(fileVulns)
        }));

        // 2. Sort groups: primarily by score (descending), secondarily by file path (ascending)
        scoredGroups.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score; // Higher score comes first
            }
            // If scores are equal, sort alphabetically by file path for consistent ordering
            return a.filePathKey.localeCompare(b.filePathKey);
        });

        // 3. Generate HTML from sorted groups
        scoredGroups.forEach(({ filePathKey, fileVulns, score }) => { // Use destructured sorted data
            const fileVulnCount = fileVulns.length;
            const isUnspecifiedFile = filePathKey === NO_FILE_KEY;
            const displayFileName = isUnspecifiedFile ? filePathKey : path.basename(filePathKey);

            const listItemsHtml = fileVulns.map(vuln => {
                // Added check from grouping function for safety, though should be filtered already
                if (!vuln?.vulnerability) { return ''; }

                const severity = vuln.currentSeverity?.toUpperCase() as VulnerabilitySeverityEnum || VulnerabilitySeverityEnum.UNKNOWN;
                const iconId = severityToIconMap[severity] || severityToIconMap.UNKNOWN;
                const severityClass = getSeverityClass(severity);
                const severityColor = severityColorMap[severity] || severityColorMap.UNKNOWN;
                const severityStyle = `color: ${severityColor}; font-weight: bold;`;

                const meta = vuln.vulnerability;
                const title = escape(meta.name || vuln.id); // Use ID as fallback title
                let line = 0; // Default line number
                let locationText = ''; // Text to display for location

                // Determine location text based on type
                switch (vuln.vulnerability.vulnerabilityType) {
                    case 'sast': {
                        const sastVuln = vuln as SastVulnerabilityDetectionDto;
                        line = sastVuln.vulnerableStartLine ?? 0;
                        locationText = line > 0 ? `Line ${line}` : 'Location N/A';
                        break;
                    }
                    case 'iac': {
                        const iacVuln = vuln as IacVulnerabilityDetectionDto;
                        line = iacVuln.vulnerableStartLine ?? 0;
                        locationText = line > 0 ? `Line ${line}` : 'Location N/A';
                        break;
                    }
                    case 'sca': {
                        const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
                        const pkg = scaVuln.scaDetectedPackage;
                        locationText = pkg ? `${escape(pkg.packageName || '?')}@${escape(pkg.packageVersion || '?')}` : 'Package N/A';
                        // Line number isn't directly relevant for SCA in the same way,
                        line = 0;
                        break;
                    }
                    default:
                        locationText = 'Location N/A';
                }

                const locationHtml = `<span class="finding-location">${locationText}</span>`;

                let vulnDataString = '';
                try {
                    vulnDataString = escape(JSON.stringify(vuln));
                } catch (e) {
                    console.error("Failed to stringify finding data:", e, vuln.id);
                    vulnDataString = escape(JSON.stringify({ id: vuln.id, error: 'Data too complex or circular' }));
                }
                return `
                    <li class="finding-item ${severityClass}"
                        data-vulnerability='${vulnDataString}'
                        data-scan-type='${scanType}'
                        title="${escape(vuln.id)} - Click for details and location"
                        tabindex="0"
                        role="button"
                        aria-label="Vulnerability: ${title}, Severity: ${severity}, Location: ${locationText}. Press Enter or Space to view details and location.">
                        <span class="codicon codicon-${iconId} severity-icon" style="${severityStyle}" aria-hidden="true"></span>
                        <div class="finding-content">
                            <span class="finding-title">${title}</span>
                            ${locationHtml}
                        </div>
                    </li>`;
            }).join('');

            // Use <details> for collapsibility, open few items by default
            findingsGroupHtml += `
                <details class="file-group" ${findingsCount <= 15 ? 'open' : ''}>
                    <summary class="file-summary" title="${escape(filePathKey)}\nScore: ${score}">
                        <span class="codicon codicon-chevron-right" aria-hidden="true"></span>
                        <span class="codicon file-icon ${isUnspecifiedFile ? 'codicon-question' : 'codicon-file-code'}" aria-hidden="true"></span>
                        <span class="file-name">${escape(displayFileName)}</span>
                        <span class="file-vuln-count" aria-label="${fileVulnCount} vulnerabilities in this file">${fileVulnCount}</span>
                    </summary>
                    <ul class="findings-list-nested">
                        ${listItemsHtml}
                    </ul>
                </details>
            `;
        });
    }

    // Determine which HTML block to use
    const finalHtmlContent = scanType === 'sca' ? allFindingsHtml : findingsGroupHtml;

    // --- Complete HTML with Styles and Script ---
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="
            default-src 'none';
            style-src ${webview.cspSource} 'unsafe-inline';
            font-src ${webview.cspSource};
            img-src ${webview.cspSource} https:;
            script-src 'nonce-${nonce}';
        ">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>${scanType.toUpperCase()} Findings (${findingsCount})</title>
        <style>
            ${getCodiconStyleSheet(codiconsFontUri)}

            :root {
                --severity-color-critical: ${severityColorMap[VulnerabilitySeverityEnum.CRITICAL]};
                --severity-color-high: ${severityColorMap[VulnerabilitySeverityEnum.HIGH]};
                --severity-color-medium: ${severityColorMap[VulnerabilitySeverityEnum.MEDIUM]};
                --severity-color-low: ${severityColorMap[VulnerabilitySeverityEnum.LOW]};
                --severity-color-info: ${severityColorMap[VulnerabilitySeverityEnum.INFO]};
                --severity-color-unknown: ${severityColorMap['UNKNOWN']};
                --file-group-border: 1px solid var(--vscode-tree-tableColumnsBorderColor, var(--vscode-editorGroup-border));
                --file-summary-bg: rgba(var(--vscode-button-secondaryBackground-rgb), 0.1); /* Subtle background */
                --file-summary-hover-bg: var(--vscode-list-hoverBackground);
                --list-padding: 10px;
            }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 0;
                font-size: var(--vscode-font-size);
                background-color: var(--vscode-sideBar-background);
            }

            .findings-header { /* Optional header */
                padding: 5px 10px; font-weight: 600;
                color: var(--vscode-sideBarTitle-foreground);
                background-color: var(--vscode-sideBarSectionHeader-background);
                border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
                position: sticky; top: 0; z-index: 10;
                font-size: 0.95em;
            }

            /* File group styling */
            .file-group { border-bottom: var(--file-group-border); }
            .file-group:last-child { border-bottom: none; }
            .file-summary {
                display: flex; align-items: center; padding: 6px 10px;
                cursor: pointer; background-color: var(--file-summary-bg);
                transition: background-color 0.1s ease-in-out;
                gap: 5px; list-style: none; /* Remove default marker */
                user-select: none; /* Prevent text selection on summary */
            }
            .file-summary:hover { background-color: var(--file-summary-hover-bg); }
            .file-summary::marker, .file-summary::-webkit-details-marker { display: none; }

            .file-summary .codicon-chevron-right {
                font-size: 1em; color: var(--vscode-icon-foreground); margin-right: 2px;
                width: 16px; text-align: center; transition: transform 0.15s ease-in-out;
            }
            details[open] > summary .codicon-chevron-right { transform: rotate(90deg); }
            .file-summary .file-icon { color: var(--vscode-icon-foreground); font-size: 1em; }
            .file-name {
                flex-grow: 1; font-weight: 600; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap;
                color: var(--vscode-list-highlightForeground); margin-left: 2px;
            }
            .file-vuln-count {
                font-size: 0.85em; font-weight: normal; padding: 1px 5px;
                border-radius: 8px; background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground); margin-left: auto; flex-shrink: 0;
            }

            /* Findings list styling */
            .findings-list-nested { list-style: none; padding: 0; margin: 0; }
            li.finding-item {
                padding: 5px 10px 5px 30px; /* Indentation */
                margin: 0; border-radius: 0; cursor: pointer;
                display: flex; align-items: center; gap: 8px;
                border: none;
                border-top: 1px solid var(--vscode-tree-tableColumnsBorderColor, var(--vscode-editorGroup-border));
            }
            details[open] > ul.findings-list-nested > li:first-child { border-top: none; }
            li.finding-item:hover { background-color: var(--vscode-list-hoverBackground); }
            li.finding-item:focus {
                outline: 1px solid var(--vscode-focusBorder);
                background-color: var(--vscode-list-focusBackground);
                outline-offset: -1px;
            }

            .severity-icon {
                flex-shrink: 0; font-size: 1em; width: 18px; height: 18px;
                text-align: center; margin-right: 5px; font-weight: bold;
                border-radius: 3px; /* Slightly rounded square */
                display: flex; align-items: center; justify-content: center;
                border: 1px solid transparent; /* Add border for focus state */
                transition: transform 0.1s ease, background-color 0.1s ease;
            }
            /* Add subtle background on hover/focus */
            li.finding-item:hover .severity-icon,
            li.finding-item:focus .severity-icon {
                 background-color: rgba(var(--vscode-foreground-rgb), 0.08);
                 transform: scale(1.05);
            }

            .finding-content { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 1px; }
            .finding-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .finding-location { font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            p.no-findings { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); font-style: italic; }

            /* Styling for the direct SCA list */
            .findings-list-direct {
                list-style: none;
                padding: 0 var(--list-padding);
                margin: 0;
            }

            /* Shared styles for finding items (used in both grouped and direct lists) */
            .finding-item {
                display: flex;
                align-items: center;
                padding: 8px var(--list-padding);
                margin-bottom: 2px; /* Small gap between items */
                border-radius: 4px;
                cursor: pointer;
                border-left: 3px solid transparent; /* For severity indication */
                transition: background-color 0.1s ease, border-left-color 0.1s ease;
                overflow: hidden; /* Prevent content overflow */
            }

            .finding-item:hover {
                background-color: var(--vscode-list-hoverBackground);
            }

            .finding-item:focus {
                outline: 1px solid var(--vscode-focusBorder);
                outline-offset: -1px;
                background-color: var(--vscode-list-focusBackground);
            }

            /* Apply severity color to the left border */
            .finding-item.critical { border-left-color: var(--severity-color-critical); }
            .finding-item.high { border-left-color: var(--severity-color-high); }
            .finding-item.medium { border-left-color: var(--severity-color-medium); }
            .finding-item.low { border-left-color: var(--severity-color-low); }
            .finding-item.info { border-left-color: var(--severity-color-info); }
            .finding-item.unknown { border-left-color: var(--severity-color-unknown); }

            .severity-icon {
                flex-shrink: 0;
                font-size: 1.1em; /* Slightly larger icon */
                width: 20px;
                text-align: center;
                margin-right: 10px;
                opacity: 0.9;
            }

            .finding-content {
                flex-grow: 1;
                overflow: hidden; /* Prevent long titles from breaking layout */
                line-height: 1.4;
            }

            .finding-title {
                display: block;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                color: var(--vscode-list-activeSelectionForeground);
                margin-bottom: 2px; /* Space between title and location */
            }

            .finding-location {
                display: block;
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
        </style>
    </head>
    <body>
        <div class="findings-header">
            ${findingsCount} ${scanType.toUpperCase()} Finding${findingsCount !== 1 ? 's' : ''}
        </div>
        ${finalHtmlContent}

        <script nonce="${nonce}">
            // Get VS Code API handle (works in webviews)
            const vscode = acquireVsCodeApi();

            // Add event listeners to each finding item
            document.querySelectorAll('.finding-item').forEach(item => {
                // Ensure items are keyboard accessible
                item.setAttribute('tabindex', '0'); // Make focusable
                item.setAttribute('role', 'button'); // Indicate it's interactive

                // --- CLICK LISTENER ---
                item.addEventListener('click', (event) => {
                    // Prevent accidental clicks on nested elements if any were added later
                    if (event.currentTarget !== item) return;

                    const vulnDataString = item.getAttribute('data-vulnerability');
                    const scanTypeValue = item.getAttribute('data-scan-type');

                    if (vulnDataString && scanTypeValue) {
                        try {
                            const vulnerabilityData = JSON.parse(vulnDataString);
                            // **MODIFIED**: Send the new 'vulnerabilityClicked' command
                            vscode.postMessage({
                                command: 'vulnerabilityClicked', // New command name
                                vulnerabilityData: vulnerabilityData,
                                scanType: scanTypeValue
                            });
                        } catch (e) {
                            console.error("FindingsHTML: Failed to parse vulnerability data on click:", e, vulnDataString);
                            // Optionally inform the user via an alert or console message in dev tools
                            vscode.postMessage({ command: 'error', text: 'Failed to process vulnerability data.' });
                        }
                    } else {
                        console.warn("FindingsHTML: Missing data attributes on clicked item.", item);
                    }
                });

                // --- KEYDOWN LISTENER (for Enter/Space) ---
                item.addEventListener('keydown', (event) => {
                    // Trigger action on Enter or Spacebar press when item is focused
                    if (event.key === 'Enter' || event.key === ' ') {
                        // Prevent default spacebar scroll or other default actions
                        event.preventDefault();

                        // Prevent accidental triggers on nested elements
                        if (event.currentTarget !== item) return;

                        const vulnDataString = item.getAttribute('data-vulnerability');
                        const scanTypeValue = item.getAttribute('data-scan-type');

                        if (vulnDataString && scanTypeValue) {
                            try {
                                const vulnerabilityData = JSON.parse(vulnDataString);
                                // **MODIFIED**: Send the new 'vulnerabilityClicked' command
                                vscode.postMessage({
                                    command: 'vulnerabilityClicked', // New command name
                                    vulnerabilityData: vulnerabilityData,
                                    scanType: scanTypeValue
                                });
                            } catch (e) {
                                console.error("FindingsHTML: Failed to parse vulnerability data on keydown:", e, vulnDataString);
                                vscode.postMessage({ command: 'error', text: 'Failed to process vulnerability data.' });
                            }
                        } else {
                            console.warn("FindingsHTML: Missing data attributes on keydown target item.", item);
                        }
                    }
                });
            });
        </script>
    </body>
    </html>`;
}