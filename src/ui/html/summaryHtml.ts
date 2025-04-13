// src/ui/html/summaryHtml.ts
import * as vscode from 'vscode';
import { escape } from 'lodash';
import { ScanProjectInfoDto, CountVulnerabilitiesCountByType } from '../../dtos/result/response/get-project-vulnerabilities-response.dto';
import { getNonce } from '../../utilities/utils';
import { getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils';

type SummaryData = {
    total?: number;
    counts?: CountVulnerabilitiesCountByType;
    scanInfo?: ScanProjectInfoDto;
    error?: string | null;
    isLoading?: boolean;
    isReady?: boolean;
    noWorkspace?: boolean;
    statusMessage?: string;
};

/**
 * Generates the HTML content for the Summary webview view with improved styling.
 */
export function getSummaryViewHtml(
    summaryData: SummaryData,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);

    // Icons
    const loadingIcon = `<span class="codicon codicon-loading codicon-modifier-spin"></span>`;
    const errorIcon = `<span class="codicon codicon-error"></span>`;
    const readyIcon = `<span class="codicon codicon-info"></span>`;
    const checkIcon = `<span class="codicon codicon-check"></span>`;
    const playIcon = `<span class="codicon codicon-play"></span>`;
    const folderIcon = `<span class="codicon codicon-folder"></span>`;
    const shieldIcon = `<span class="codicon codicon-shield"></span>`;
    const bugIcon = `<span class="codicon codicon-bug"></span>`;

    let contentHtml = '';

    // Determine content based on state
    if (summaryData.isLoading) {
        contentHtml = `
            <div class="loading-container">
                <div class="loader">
                    ${loadingIcon} </div>
                <h2>CybeDefend is scanning for issues...</h2>
                <p>${escape(summaryData.statusMessage || 'Please wait, analyzing your project...')}</p>
            </div>
        `;
    } else if (summaryData.error) {
        contentHtml = `
            <div class="error-container">
                 ${errorIcon}
                 <h3>Scan Failed</h3>
                 <p>${escape(summaryData.error)}</p>
            </div>
        `;
    } else if (summaryData.noWorkspace) {
        contentHtml = `
            <div class="info-container">
                ${readyIcon}
                <p>Please select a project folder to scan.</p>
                <button id="select-folder-button">${folderIcon} Select Folder</button>
            </div>
        `;
    } else if (summaryData.isReady) {
         contentHtml = `
             <div class="info-container">
                ${readyIcon}
                <p>Ready to scan your project.</p>
                <p><small>Use the ${playIcon} button in the view title.</small></p>
             </div>
        `;
    } else if (summaryData.scanInfo || typeof summaryData.total === 'number') {
        const total = summaryData.total ?? 0;
        const counts = summaryData.counts;
        const scanDate = summaryData.scanInfo?.createAt ? `Scan completed on ${new Date(summaryData.scanInfo.createAt).toLocaleString()}` : 'Scan completed';

        contentHtml = `
            <div class="summary-results">
                <div class="summary-header">
                    <h2>CybeDefend Scan Results</h2>
                    <div class="total-badge" title="Total Vulnerabilities Found">
                         ${bugIcon} ${total} Total
                    </div>
                </div>
                <p class="scan-date">${escape(scanDate)}</p>
                 ${counts ? `
                     <ul class="counts-list">
                         <li><span class="count-label">SAST:</span> <span class="count-value">${counts.sast}</span></li>
                         <li><span class="count-label">IaC:</span> <span class="count-value">${counts.iac}</span></li>
                         <li><span class="count-label">SCA:</span> <span class="count-value">${counts.sca}</span></li>
                     </ul>
                 ` : ''}
                ${total === 0 ? `<p class="no-vulns-message">${checkIcon} No vulnerabilities found.</p>` : ''}
             </div>
        `;
    } else {
        contentHtml = `<p>${readyIcon} Initializing...</p>`; // Fallback
    }

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>Scan Summary</title>
        <style>
            ${getCodiconStyleSheet(codiconsFontUri)}

            :root {
                --gradient-start: rgba(var(--vscode-button-background-rgb), 0.1);
                --gradient-end: rgba(var(--vscode-button-background-rgb), 0.3);
                --badge-shadow: 0 2px 5px rgba(0,0,0,0.2);
                --loader-color: var(--vscode-textLink-activeForeground);
            }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 20px;
                line-height: 1.6;
                font-size: var(--vscode-font-size);
                height: 100vh;
                margin: 0;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            }

            h2 { margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px; font-size: 1.2em; color: var(--vscode-sideBarTitle-foreground); }
            h3 { margin: 0 0 10px 0; }
            p { margin: 5px 0 15px 0; }
            small { color: var(--vscode-descriptionForeground); }
            ul { list-style: none; padding: 0; margin: 0; }

            button {
                 background: var(--vscode-button-background);
                 color: var(--vscode-button-foreground);
                 border: 1px solid var(--vscode-button-border, transparent);
                 padding: 8px 15px;
                 border-radius: 4px;
                 cursor: pointer;
                 margin-top: 15px;
                 display: inline-flex;
                 align-items: center;
                 gap: 6px;
                 font-weight: 600;
                 transition: background-color 0.2s ease, box-shadow 0.2s ease;
            }
             button:hover {
                 background: var(--vscode-button-hoverBackground);
                 box-shadow: 0 3px 8px rgba(0,0,0,0.15);
             }
             button .codicon { margin-right: 4px; }

            /* Loader Styles */
            .loading-container {
                 text-align: center;
                 margin: auto; /* Center vertically and horizontally */
                 padding: 30px;
            }
            .loader {
                margin-bottom: 20px;
                position: relative;
                display: inline-block; /* Needed for pseudo-element */
            }
            .loader .codicon-loading {
                font-size: 48px; /* Much larger loader */
                color: var(--loader-color);
                /* Animation is handled by Codicon CSS */
            }
            /* Optional: subtle background pulse */
             .loader::before {
                content: '';
                position: absolute;
                inset: -10px; /* Expand outside the icon */
                border-radius: 50%;
                background-color: rgba(var(--vscode-textLink-activeForeground-rgb), 0.1);
                 animation: pulse 2s infinite ease-out;
                 z-index: -1;
             }
             @keyframes pulse {
                 0% { transform: scale(0.8); opacity: 0.5; }
                 50% { opacity: 0.1; }
                 100% { transform: scale(1.2); opacity: 0; }
             }

            /* Results Styles */
            .summary-results { width: 100%; }
            .summary-header {
                 display: flex;
                 align-items: center;
                 justify-content: space-between; /* Pushes badge to the right */
                 padding-bottom: 10px;
                 margin-bottom: 10px;
                 border-bottom: 1px solid var(--vscode-panel-border);
            }
            .total-badge {
                 display: inline-flex;
                 align-items: center;
                 gap: 6px;
                 background-color: rgb(120, 69, 255); /* Couleur violette spécifiée */
                 background-image: none; /* Suppression du gradient */
                 color: var(--vscode-button-foreground);
                 padding: 6px 12px;
                 border-radius: 20px; /* Pill shape */
                 font-weight: 600; /* Bolder */
                 font-size: 0.95em;
                 box-shadow: var(--badge-shadow);
                 border: 1px solid rgba(120, 69, 255, 0.5); /* Bordure assortie à la couleur */
                 transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            .total-badge:hover {
                 transform: translateY(-1px);
                 box-shadow: 0 4px 8px rgba(120, 69, 255, 0.25); /* Ombre assortie à la couleur */
            }
             .total-badge .codicon { font-size: 1.1em; }

            .scan-date { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-bottom: 15px; }
            .counts-list { margin-bottom: 15px; }
            .counts-list li { display: flex; justify-content: space-between; padding: 3px 0; font-size: 1em; border-bottom: 1px dashed var(--vscode-editorWidget-border); }
            .counts-list li:last-child { border-bottom: none; }
            .count-label { color: var(--vscode-foreground); }
            .count-value { font-weight: bold; color:rgb(120, 69, 255); }

            .no-vulns-message { color: var(--vscode-charts-green); font-weight: bold; display: flex; align-items: center; gap: 5px; }

            /* Info/Error Containers */
             .info-container, .error-container {
                 text-align: center;
                 margin: auto;
                 padding: 20px;
             }
             .error-container .codicon { color: var(--vscode-errorForeground); font-size: 1.5em; margin-bottom: 10px; }
             .info-container .codicon { color:rgb(120, 69, 255); font-size: 1.5em; margin-bottom: 10px; }

        </style>
    </head>
    <body>
        ${contentHtml}
        <script nonce="${nonce}">
             const vscode = acquireVsCodeApi();
             const button = document.getElementById('select-folder-button');
             if (button) {
                 button.addEventListener('click', () => {
                     vscode.postMessage({ command: 'selectFolder' });
                 });
             }
        </script>
    </body>
    </html>`;
}