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
        if (!vuln?.vulnerability) {
            console.warn("Skipping finding due to missing vulnerability details:", vuln?.id);
            continue;
        }

        let filePath: string | null = null;

        if (scaPkg && scaPkg.fileName) {
            filePath = scaPkg.fileName;
        } else {
            const type = vuln.vulnerability.vulnerabilityType;
            switch (type) {
                case 'sast':
                    filePath = (vuln as SastVulnerabilityDetectionDto).path;
                    break;
                case 'iac':
                    filePath = (vuln as IacVulnerabilityDetectionDto).path;
                    break;
                default:
                    filePath = null;
            }
        }

        const key = filePath || NO_FILE_KEY;
        if (!grouped.has(key)) { grouped.set(key, []); }
        grouped.get(key)!.push(vuln);
    }

    return grouped;
}


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

    // If no findings, display placeholder
    if (findingsCount === 0) {
        findingsGroupHtml = '<p class="no-findings">No findings of this type were detected.</p>';
    } else {
        // 1. Compute criticality score per file group
        const scoredGroups = Array.from(groupedFindings.entries()).map(([filePathKey, fileVulns]) => ({
            filePathKey,
            fileVulns,
            score: _calculateFileCriticalityScore(fileVulns)
        }));

        // 2. Sort by score descending, then by file path ascending
        scoredGroups.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.filePathKey.localeCompare(b.filePathKey);
        });

        // 3. Render each group
        scoredGroups.forEach(({ filePathKey, fileVulns, score }) => {
            const fileVulnCount = fileVulns.length;
            const isUnspecifiedFile = filePathKey === NO_FILE_KEY;
            const displayFileName = isUnspecifiedFile ? filePathKey : path.basename(filePathKey);

            const listItemsHtml = fileVulns.map(vuln => {
                if (!vuln?.vulnerability) { return ''; }

                const severity = vuln.currentSeverity?.toUpperCase() as VulnerabilitySeverityEnum || VulnerabilitySeverityEnum.UNKNOWN;
                const iconId = severityToIconMap[severity] || severityToIconMap.UNKNOWN;
                const severityClass = getSeverityClass(severity);
                const severityColor = severityColorMap[severity] || severityColorMap.UNKNOWN;
                const severityStyle = `color: ${severityColor}; font-weight: bold;`;

                const meta = vuln.vulnerability;
                let title: string;
                if (scanType === 'sca') {
                    const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
                    const pkg = scaVuln.scaDetectedPackage;
                    // Prefer vulnerability name (CVE…), fallback on package@version
                    const vulnName = meta.name?.trim();
                    if (vulnName) {
                        title = escape(vulnName);
                    } else if (pkg?.packageName && pkg?.packageVersion) {
                        title = `${escape(pkg.packageName)}@${escape(pkg.packageVersion)}`;
                    } else {
                        title = escape(vuln.id);
                    }
                } else {
                    // For SAST/IaC keep the original fallback
                    title = escape(meta.name || vuln.id);
                }
                let locationText = '';
                let line = 0;

                // Unified location logic for all scan types
                switch (scanType) {
                    case 'sast': {
                        const s = vuln as SastVulnerabilityDetectionDto;
                        line = s.vulnerableStartLine ?? 0;
                        locationText = line > 0 ? `Line ${line}` : 'Location N/A';
                        break;
                    }
                    case 'iac': {
                        const i = vuln as IacVulnerabilityDetectionDto;
                        line = i.vulnerableStartLine ?? 0;
                        locationText = line > 0 ? `Line ${line}` : 'Location N/A';
                        break;
                    }
                    case 'sca': {
                        const sca = vuln as ScaVulnerabilityWithCvssDto;
                        const score = sca.cvssScore != null ? `CVSS: ${sca.cvssScore}` : '';
                        const parts = [score].filter(p => p.length);
                        locationText = parts.join(' • ');
                        break;
                    }
                    default:
                        locationText = 'Location N/A';
                }

                const locationHtml = `<span class="finding-location">${locationText}</span>`;

                let vulnDataString = '';
                try {
                    vulnDataString = escape(JSON.stringify(vuln));
                } catch {
                    vulnDataString = escape(JSON.stringify({ id: vuln.id, error: 'Serialization error' }));
                }

                return `
                    <li class="finding-item ${severityClass}"
                        data-vulnerability='${vulnDataString}'
                        data-scan-type='${scanType}'
                        title="${escape(vuln.id)} - Click for details and location"
                        tabindex="0"
                        role="button"
                        aria-label="Vulnerability: ${title}, Severity: ${severity}, Location: ${locationText}">
                        <span class="codicon codicon-${iconId} severity-icon" style="${severityStyle}" aria-hidden="true"></span>
                        <div class="finding-content">
                            <span class="finding-title">${title}</span>
                            ${locationHtml}
                        </div>
                    </li>`;
            }).join('');

            findingsGroupHtml += `
                <details class="file-group" ${findingsCount <= 15 ? 'open' : ''}>
                    <summary class="file-summary" title="${escape(filePathKey)}\nScore: ${score}">
                        <span class="codicon codicon-chevron-right" aria-hidden="true"></span>
                        <span class="codicon file-icon ${isUnspecifiedFile ? 'codicon-question' : 'codicon-file-code'}" aria-hidden="true"></span>
                        <span class="file-name">${escape(displayFileName)}</span>
                        <span class="file-vuln-count" aria-label="${fileVulnCount} vulnerabilities">${fileVulnCount}</span>
                    </summary>
                    <ul class="findings-list-nested">
                        ${listItemsHtml}
                    </ul>
                </details>`;
        });
    }

    // Always use grouped HTML (no separate SCA branch)
    const finalHtmlContent = findingsGroupHtml;

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
                --file-summary-bg: rgba(var(--vscode-button-secondaryBackground-rgb), 0.1);
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

            .findings-header {
                padding: 5px 10px; font-weight: 600;
                color: var(--vscode-sideBarTitle-foreground);
                background-color: var(--vscode-sideBarSectionHeader-background);
                border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
                position: sticky; top: 0; z-index: 10;
                font-size: 0.95em;
            }

            .file-group { border-bottom: var(--file-group-border); }
            .file-group:last-child { border-bottom: none; }
            .file-summary {
                display: flex; align-items: center; padding: 6px 10px;
                cursor: pointer; background-color: var(--file-summary-bg);
                transition: background-color 0.1s;
                gap: 5px; list-style: none; user-select: none;
            }
            .file-summary:hover { background-color: var(--file-summary-hover-bg); }
            .file-summary::marker, .file-summary::-webkit-details-marker { display: none; }

            .file-summary .codicon-chevron-right {
                font-size: 1em; margin-right: 2px; width: 16px; text-align: center;
                transition: transform 0.15s;
            }
            details[open] > summary .codicon-chevron-right { transform: rotate(90deg); }
            .file-summary .file-icon { font-size: 1em; }
            .file-name {
                flex-grow: 1; font-weight: 600; overflow: hidden;
                text-overflow: ellipsis; white-space: nowrap; margin-left: 2px;
            }
            .file-vuln-count {
                font-size: 0.85em; padding: 1px 5px; border-radius: 8px;
                background-color: var(--vscode-badge-background);
                color: var(--vscode-badge-foreground);
            }

            .findings-list-nested { list-style: none; padding: 0; margin: 0; }
            li.finding-item {
                display: flex; align-items: center; gap: 8px;
                padding: 5px 10px 5px 30px; border-top: 1px solid var(--vscode-tree-tableColumnsBorderColor);
                cursor: pointer;
            }
            details[open] > ul.findings-list-nested > li:first-child { border-top: none; }
            li.finding-item:hover { background-color: var(--vscode-list-hoverBackground); }
            li.finding-item:focus {
                outline: 1px solid var(--vscode-focusBorder);
                background-color: var(--vscode-list-focusBackground);
            }

            .severity-icon {
                width: 18px; height: 18px; display: flex; align-items: center;
                justify-content: center; border-radius: 3px; transition: transform 0.1s;
            }
            .finding-content { display: flex; flex-direction: column; gap: 1px; }
            .finding-title { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .finding-location { font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            p.no-findings { padding: 20px; text-align: center; font-style: italic; color: var(--vscode-descriptionForeground); }
        </style>
    </head>
    <body>
        <div class="findings-header">
            ${findingsCount} ${scanType.toUpperCase()} Finding${findingsCount !== 1 ? 's' : ''}
        </div>
        ${finalHtmlContent}

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.finding-item').forEach(item => {
                item.addEventListener('click', () => {
                    const data = item.getAttribute('data-vulnerability');
                    const type = item.getAttribute('data-scan-type');
                    if (data && type) {
                        vscode.postMessage({ command: 'vulnerabilityClicked', vulnerabilityData: JSON.parse(data), scanType: type });
                    }
                });
                item.addEventListener('keydown', e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        item.click();
                    }
                });
            });
        </script>
    </body>
    </html>`;
}
