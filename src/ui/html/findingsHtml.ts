// src/ui/html/findingsHtml.ts
import * as vscode from 'vscode';
import { escape } from 'lodash';
import { DetailedVulnerability, VulnerabilitySeverityEnum } from '../../dtos/result/details'; // Ajuster chemin
import { SastVulnerabilityDetectionDto, IacVulnerabilityDetectionDto, ScaVulnerabilityWithCvssDto } from '../../dtos/result/details'; // Specific types
import { ScanType } from '../../api/apiService'; // Ajuster chemin
import { getNonce } from '../../utilities/utils'; // Ajuster chemin
import { getSeverityClass, severityToIconMap, getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils';
import path from 'path';

/**
 * Groups findings by their file path.
 */
function _groupFindingsByFile(findings: DetailedVulnerability[]): Map<string, DetailedVulnerability[]> {
    const grouped = new Map<string, DetailedVulnerability[]>();
    const NO_FILE_KEY = '(File not specified)';

    for (const vuln of findings) {
        let filePath: string | undefined | null = null;
        if (!vuln || !vuln.vulnerability) continue; // Skip invalid entries

        if (vuln.vulnerability.vulnerabilityType === 'sast' && 'path' in vuln) {
            filePath = (vuln as SastVulnerabilityDetectionDto).path;
        } else if (vuln.vulnerability.vulnerabilityType === 'iac' && 'path' in vuln) {
            filePath = (vuln as IacVulnerabilityDetectionDto).path;
        } else if (vuln.vulnerability.vulnerabilityType === 'sca' && 'scaDetectedPackage' in vuln) {
            filePath = (vuln as ScaVulnerabilityWithCvssDto).scaDetectedPackage?.fileName;
        }

        const key = filePath || NO_FILE_KEY;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)?.push(vuln);
    }
    return grouped;
}

/**
 * Creates the command URI for opening a file.
 */
function _createOpenFileCommandUri(filePath: string | undefined | null, lineNumber: number): string | null {
     if (!filePath) return null;
     const line = Math.max(1, lineNumber);
     const args = [filePath, line];
     try {
        const encodedArgs = encodeURIComponent(JSON.stringify(args));
        // Assurez-vous que 'cybedefendScanner.openFileLocation' est bien l'ID de votre commande
        return `command:cybedefendScanner.openFileLocation?${encodedArgs}`;
     } catch (e) {
         console.error("Error encoding command URI arguments:", e, args);
         return null;
     }
}

/**
 * Generates the HTML content for a Findings Webview View.
 */
export function getFindingsViewHtml(
    findings: DetailedVulnerability[],
    scanType: ScanType,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);
    // Log des URIs générées pour vérifier les chemins
    console.log("Codicons CSS URI:", codiconsUri.toString());
    console.log("Codicons Font URI:", codiconsFontUri.toString());

    const findingsCount = findings?.length ?? 0;
    const groupedFindings = _groupFindingsByFile(findings);
    let findingsGroupHtml = '';

    if (findingsCount === 0) {
        findingsGroupHtml = '<p class="no-findings">No findings of this type were detected.</p>';
    } else {
        const sortedGroups = Array.from(groupedFindings.entries()).sort((a, b) => a[0].localeCompare(b[0]));

        sortedGroups.forEach(([filePathKey, fileVulns]) => {
            const fileVulnCount = fileVulns.length;
            const isUnspecifiedFile = filePathKey === '(File not specified)';
            const displayFileName = isUnspecifiedFile ? filePathKey : path.basename(filePathKey);

            const listItemsHtml = fileVulns.map(vuln => {
                if (!vuln || !vuln.vulnerability) return '';

                const severity = vuln.currentSeverity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN;
                const iconId = severityToIconMap[severity] || 'question';
                const severityClass = getSeverityClass(severity);
                const severityColorClass = severityClass.replace('severity-', 'color-');
                const meta = vuln.vulnerability;
                const title = escape(meta.name || vuln.id);
                let line = 0;
                let commandUri: string | null = null;
                let locationText = 'N/A';

                 if (vuln.vulnerability.vulnerabilityType === 'sast' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                    const sastVuln = vuln as SastVulnerabilityDetectionDto;
                    line = sastVuln.vulnerableStartLine ?? 0;
                    locationText = `Ligne ${line}`;
                    commandUri = _createOpenFileCommandUri(sastVuln.path, line);
                } else if (vuln.vulnerability.vulnerabilityType === 'iac' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                    const iacVuln = vuln as IacVulnerabilityDetectionDto;
                    line = iacVuln.vulnerableStartLine ?? 0;
                    locationText = `Ligne ${line}`;
                    commandUri = _createOpenFileCommandUri(iacVuln.path, line);
                } else if (vuln.vulnerability.vulnerabilityType === 'sca' && 'scaDetectedPackage' in vuln) {
                    const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
                    const pkg = scaVuln.scaDetectedPackage;
                    locationText = `${escape(pkg?.packageName || '?')}@${escape(pkg?.packageVersion || '?')}`;
                    line = 1;
                    commandUri = _createOpenFileCommandUri(pkg?.fileName, line);
                }

                const locationHtml = commandUri
                    ? `<a class="finding-location-link" href="${commandUri}" title="Go to ${escape(filePathKey || '')}:${line}">${locationText}</a>`
                    : `<span class="finding-location">${locationText}</span>`;

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
                             ${locationHtml}
                        </div>
                    </li>`;
            }).join('');

            findingsGroupHtml += `
                <details class="file-group" ${findingsCount <= 15 ? 'open' : ''}>
                    <summary class="file-summary" title="${escape(filePathKey)}">
                         <span class="codicon chevron"></span>
                         <span class="codicon file-icon ${isUnspecifiedFile ? 'codicon-question' : 'codicon-file-code'}"></span>
                         <span class="file-name">${escape(displayFileName)}</span>
                         <span class="file-vuln-count">${fileVulnCount}</span>
                    </summary>
                    <ul class="findings-list-nested">
                        ${listItemsHtml}
                    </ul>
                </details>
            `;
        });
    }

    // --- Complete HTML with Styles ---
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
        <title>${scanType.toUpperCase()} Findings</title>
        <style>
            /* CORRECTION: Inclure la règle @font-face */
            ${getCodiconStyleSheet(codiconsFontUri)}

            :root {
                 --severity-color-critical: var(--vscode-errorForeground, #D14949);
                 --severity-color-high: var(--vscode-list-warningForeground, #E17D3A);
                 --severity-color-medium: var(--vscode-testing-iconPassed, #007ACC);
                 --severity-color-low: var(--vscode-descriptionForeground, #777777);
                 --severity-color-info: var(--vscode-textSeparator-foreground, #999999);
                 --severity-color-unknown: var(--vscode-disabledForeground, #AAAAAA);
                 --file-group-border: 1px solid var(--vscode-tree-tableColumnsBorderColor, var(--vscode-editorGroup-border));
                 --file-summary-bg: rgba(var(--vscode-list-inactiveSelectionBackground-rgb), 0.5);
                 --file-summary-hover-bg: var(--vscode-list-hoverBackground);
            }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 0;
                font-size: var(--vscode-font-size);
                background-color: var(--vscode-sideBar-background);
            }

             .findings-header {
                 padding: 10px 15px;
                 font-weight: 600;
                 color: var(--vscode-sideBarTitle-foreground);
                 background-color: var(--vscode-sideBarSectionHeader-background);
                 border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
                 position: sticky; top: 0; z-index: 10;
                 font-size: 0.95em;
             }

            /* Styles pour les groupes de fichiers */
            .file-group { border-bottom: var(--file-group-border); }
            .file-group:last-child { border-bottom: none; }
             .file-summary {
                 display: flex; align-items: center;
                 padding: 6px 10px; cursor: pointer;
                 background-color: var(--file-summary-bg);
                 transition: background-color 0.1s ease-in-out;
                 gap: 5px; list-style: none;
             }
             .file-summary:hover { background-color: var(--file-summary-hover-bg); }
             .file-summary::marker,
             .file-summary::-webkit-details-marker { display: none; }

             .file-summary .chevron {
                 font-size: 1em; color: var(--vscode-icon-foreground);
                 margin-right: 2px; width: 16px; text-align: center;
                 transition: transform 0.15s ease-in-out; /* Transition pour la rotation */
             }
              /* Rotation du chevron avec CSS */
             .file-summary .chevron::before { content: "\\ea74"; /* chevron-right par défaut */ display: inline-block; }
             details[open] > summary .chevron::before { transform: rotate(90deg); } /* pivote vers le bas */

             .file-summary .file-icon { color: var(--vscode-icon-foreground); font-size: 1em; }
             .file-name {
                 flex-grow: 1; font-weight: normal; overflow: hidden;
                 text-overflow: ellipsis; white-space: nowrap;
                 color: var(--vscode-list-highlightForeground); margin-left: 2px;
             }
             .file-vuln-count {
                 font-size: 0.85em; font-weight: normal; padding: 1px 5px;
                 border-radius: 8px; background-color: var(--vscode-badge-background);
                 color: var(--vscode-badge-foreground); margin-left: auto; flex-shrink: 0;
             }

             /* Liste imbriquée */
             .findings-list-nested { list-style: none; padding: 0; margin: 0; }
             li.finding-item {
                 padding: 5px 10px 5px 28px; /* Indentation */
                 margin: 0; border-radius: 0; cursor: pointer;
                 display: flex; align-items: center; gap: 8px;
                 border: none;
                 border-top: 1px solid var(--vscode-tree-tableColumnsBorderColor, var(--vscode-editorGroup-border));
             }
             details[open] > ul.findings-list-nested > li:first-child { border-top: none; }
             li.finding-item:hover { background-color: var(--vscode-list-hoverBackground); }
             li.finding-item:focus { outline: 1px solid var(--vscode-focusBorder); background-color: var(--vscode-list-focusBackground); outline-offset: -1px; }

            .severity-icon { flex-shrink: 0; font-size: 1em; width: 16px; text-align: center; margin-right: 2px;}
             .color-critical { color: var(--severity-color-critical); }
             .color-high { color: var(--severity-color-high); }
             .color-medium { color: var(--severity-color-medium); }
             .color-low { color: var(--severity-color-low); }
             .color-info { color: var(--severity-color-info); }
             .color-unknown { color: var(--severity-color-unknown); }

            .finding-content { flex-grow: 1; overflow: hidden; display: flex; flex-direction: column; gap: 1px; }
            .finding-title { font-weight: normal; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .finding-location, .finding-location-link { font-size: 0.9em; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
             .finding-location-link { cursor: pointer; text-decoration: none; color: var(--vscode-textLink-foreground); }
             .finding-location-link:hover { text-decoration: underline; color: var(--vscode-textLink-activeForeground); }
            p.no-findings { padding: 20px; text-align: center; color: var(--vscode-descriptionForeground); font-style: italic; }
        </style>
    </head>
    <body>
         <div class="findings-header">
             ${findingsCount} ${scanType.toUpperCase()} Finding${findingsCount !== 1 ? 's' : ''}
         </div>
        ${findingsGroupHtml}
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            document.querySelectorAll('.finding-item').forEach(item => {
                 item.setAttribute('tabindex', '0');

                 item.addEventListener('click', (event) => {
                     if (event.target.closest('.finding-location-link')) { return; }
                     const vulnDataString = item.getAttribute('data-vulnerability');
                     const scanType = item.getAttribute('data-scan-type');
                     if (vulnDataString && scanType) {
                        try {
                            const vulnerabilityData = JSON.parse(vulnDataString);
                            vscode.postMessage({ command: 'triggerShowDetails', vulnerabilityData, scanType });
                        } catch (e) { console.error("Failed to parse vulnerability data:", e); }
                     } else { console.warn("Missing data attributes on list item."); }
                 });

                 item.addEventListener('keydown', (event) => {
                     if (event.key === 'Enter' || event.key === ' ') {
                         if (event.target.closest('.finding-location-link')) { return; }
                         event.preventDefault();
                         const vulnDataString = item.getAttribute('data-vulnerability');
                         const scanType = item.getAttribute('data-scan-type');
                         if (vulnDataString && scanType) {
                             try {
                                 const vulnerabilityData = JSON.parse(vulnDataString);
                                 vscode.postMessage({ command: 'triggerShowDetails', vulnerabilityData, scanType });
                             } catch (e) { console.error("Failed to parse vulnerability data:", e); }
                         } else { console.warn("Missing data attributes on list item."); }
                     }
                 });
            });

             // Le JS pour le chevron n'est plus nécessaire grâce au CSS
        </script>
    </body>
    </html>`;
}