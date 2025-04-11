// src/ui/html/findingsHtml.ts
import * as vscode from 'vscode';
import { escape } from 'lodash';
import { DetailedVulnerability, VulnerabilitySeverityEnum } from '../../dtos/result/details'; // Ajuster chemin
import { SastVulnerabilityDetectionDto, IacVulnerabilityDetectionDto, ScaVulnerabilityWithCvssDto } from '../../dtos/result/details'; // Specific types
import { ScanType } from '../../api/apiService'; // Ajuster chemin
import { getNonce } from '../../utilities/utils'; // Ajuster chemin
import { getSeverityClass, severityToIconMap, getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils';

/**
 * Generates the HTML content for a Findings Webview View (SAST, IAC, SCA) with improved styling.
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

    let findingsHtml = '';

    // Build Findings List
    if (findingsCount === 0) {
        findingsHtml = '<p class="no-findings">No findings of this type were detected.</p>';
    } else {
        const listItems = findings.map(vuln => {
            if (!vuln || !vuln.vulnerability) {
                console.warn("Skipping rendering finding due to missing data:", vuln);
                return '';
            }

            const severity = vuln.currentSeverity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN;
            const iconId = severityToIconMap[severity] || 'question';
            const severityClass = getSeverityClass(severity); // e.g., 'severity-high'
            const severityColorClass = severityClass.replace('severity-', 'color-'); // e.g., 'color-high' for CSS var

            const meta = vuln.vulnerability;
            const title = escape(meta.name || vuln.id);
            let location = 'Location N/A'; // Default location

            // Determine location based on type (using structure checks)
             if (vuln.vulnerability.vulnerabilityType === 'sast' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                 const sastVuln = vuln as SastVulnerabilityDetectionDto;
                 location = `${escape(sastVuln.path?.split(/[\\/]/).pop() || sastVuln.path || '?')} : ${sastVuln.vulnerableStartLine ?? '?'}`; // Separator change
             } else if (vuln.vulnerability.vulnerabilityType === 'iac' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                 const iacVuln = vuln as IacVulnerabilityDetectionDto;
                 location = `${escape(iacVuln.path?.split(/[\\/]/).pop() || iacVuln.path || '?')} : ${iacVuln.vulnerableStartLine ?? '?'}`; // Separator change
             } else if (vuln.vulnerability.vulnerabilityType === 'sca' && 'scaDetectedPackage' in vuln) {
                 const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
                 const pkg = scaVuln.scaDetectedPackage;
                 location = `${escape(pkg?.packageName || '?')}@${escape(pkg?.packageVersion || '?')}`; // Format change
             }

            let vulnDataString = '';
            try {
                vulnDataString = escape(JSON.stringify(vuln));
            } catch (e) {
                console.error("Failed to stringify finding data:", e, vuln.id);
                vulnDataString = escape(JSON.stringify({ id: vuln.id, error: 'Data too complex' }));
            }

            return `
                <li class="finding-item ${severityClass}" data-vulnerability='${vulnDataString}' data-scan-type='${scanType}' title="${escape(vuln.id)} - Click for details" tabindex="0">
                    <span class="codicon codicon-${iconId} severity-icon ${severityColorClass}" aria-label="Severity ${severity}"></span>
                    <div class="finding-content">
                         <span class="finding-title">${title}</span>
                         <span class="finding-location">${location}</span>
                    </div>
                </li>`;
        }).join('');
        findingsHtml = `<ul class="findings-list">${listItems}</ul>`;
    }

    // --- Complete HTML with Styles ---
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>${scanType.toUpperCase()} Findings</title>
        <style>
            ${getCodiconStyleSheet(codiconsFontUri)}

            :root {
                 /* Define severity colors using VS Code theme variables where possible */
                 --severity-color-critical: var(--vscode-errorForeground, #D14949);
                 --severity-color-high: var(--vscode-list-warningForeground, #E17D3A); /* Use warning color */
                 --severity-color-medium: var(--vscode-list-inactiveSelectionBackground, #007ACC); /* Adapting */
                 --severity-color-low: var(--vscode-descriptionForeground, #777777);
                 --severity-color-info: var(--vscode-textSeparator-foreground, #999999);
                 --severity-color-unknown: var(--vscode-disabledForeground, #AAAAAA);
            }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 0; /* Remove body padding, handle spacing inside */
                font-size: var(--vscode-font-size);
                background-color: var(--vscode-sideBar-background); /* Match sidebar */
            }

             .findings-header {
                 padding: 10px 15px; /* Increased padding */
                 font-weight: 600; /* Slightly bolder */
                 color: var(--vscode-sideBarTitle-foreground);
                 background-color: var(--vscode-sideBarSectionHeader-background); /* Section header bg */
                 border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); /* Separator */
                 position: sticky;
                 top: 0;
                 z-index: 10; /* Ensure it's above list items */
                 font-size: 0.95em;
             }

            ul.findings-list {
                list-style: none;
                padding: 5px 0; /* Add padding around the list */
                margin: 0;
            }
            li.finding-item {
                padding: 8px 15px; /* Consistent padding with header */
                margin: 0; /* Remove margin */
                border-radius: 0; /* Remove radius for full width feel */
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px; /* Increased gap */
                border-bottom: 1px solid var(--vscode-tree-tableColumnsBorderColor, var(--vscode-panel-border)); /* Subtle separator */
                transition: background-color 0.15s ease-out; /* Smooth transition */
            }
            li.finding-item:last-child {
                 border-bottom: none;
            }
            li.finding-item:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
             li.finding-item:focus {
                 outline: 1px solid var(--vscode-focusBorder);
                 background-color: var(--vscode-list-focusBackground);
                 outline-offset: -1px; /* Keep outline inside */
            }

            .severity-icon {
                 flex-shrink: 0;
                 font-size: 1.1em; /* Control icon size */
                 /* Color is set dynamically via inline style */
                 width: 18px; /* Ensure consistent width */
                 text-align: center;
            }
            /* Assign icon color using CSS variables defined in :root */
             .color-critical { color: var(--severity-color-critical); }
             .color-high { color: var(--severity-color-high); }
             .color-medium { color: var(--severity-color-medium); }
             .color-low { color: var(--severity-color-low); }
             .color-info { color: var(--severity-color-info); }
             .color-unknown { color: var(--severity-color-unknown); }

            .finding-content {
                 flex-grow: 1;
                 overflow: hidden;
                 display: flex;
                 flex-direction: column;
                 gap: 2px; /* Small gap between title and location */
            }
            .finding-title {
                font-weight: 500; /* Slightly bolder title */
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: var(--vscode-list-activeSelectionForeground); /* More prominent color */
            }
            .finding-location {
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            p.no-findings {
                 padding: 20px;
                 text-align: center;
                 color: var(--vscode-descriptionForeground);
                 font-style: italic;
             }
        </style>
    </head>
    <body>
         <div class="findings-header">
             ${findingsCount} ${scanType.toUpperCase()} Finding${findingsCount !== 1 ? 's' : ''}
         </div>
        ${findingsHtml}
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.finding-item').forEach(item => {
                 item.setAttribute('tabindex', '0');

                 const triggerDetails = () => {
                    const vulnDataString = item.getAttribute('data-vulnerability');
                    const scanType = item.getAttribute('data-scan-type');
                    if (vulnDataString && scanType) {
                        try {
                            const vulnerabilityData = JSON.parse(vulnDataString);
                             vscode.postMessage({
                                command: 'triggerShowDetails',
                                vulnerabilityData: vulnerabilityData,
                                scanType: scanType
                            });
                        } catch (e) {
                            console.error("Failed to parse vulnerability data:", e);
                         }
                    } else {
                         console.warn("Missing data attributes on list item.");
                     }
                 };

                item.addEventListener('click', triggerDetails);
                item.addEventListener('keydown', (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        triggerDetails();
                    }
                });
            });
        </script>
    </body>
    </html>`;
}