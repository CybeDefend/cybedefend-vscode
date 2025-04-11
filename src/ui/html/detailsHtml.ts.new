// src/ui/html/detailsHtml.ts
import * as vscode from 'vscode';
import { escape } from 'lodash';
import {
    GetProjectVulnerabilityByIdResponseDto,
    VulnerabilitySastDto, VulnerabilityIacDto, VulnerabilityScaDto,
    CodeSnippetDto, DataFlowItemDto, HistoryItemDto, CodeLineDto,
    VulnerabilityMetadataDto, VulnerabilityScaMetadataDto,
    ScaDetectedLibraryDto, VulnerabilityScaReferenceDto
} from '../../dtos/result/response/get-project-vulnerability-by-id-response.dto'; // Ajuster chemin
import { ScanType } from '../../api/apiService'; // Ajuster chemin
import { getNonce } from '../../utilities/utils'; // Ajuster chemin
import { getSeverityClass, getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils'; // Importer depuis utils

// Type Union based on Response DTO classes
type ApiVulnerabilityType = VulnerabilitySastDto | VulnerabilityIacDto | VulnerabilityScaDto;

// --- Type Guards (spécifiques à la structure reçue dans cette vue) ---
function isSastVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilitySastDto {
    return vuln.vulnerability?.vulnerabilityType === 'sast' && 'dataFlowItems' in vuln;
}

function isIacVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilityIacDto {
    return vuln.vulnerability?.vulnerabilityType === 'iac' && !isSastVulnerability(vuln);
}

function isScaVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilityScaDto {
    return vuln.vulnerability?.vulnerabilityType === 'sca' && 'package' in vuln;
}

// --- Helper Functions Specific to Details View ---

function _generateHistoryHtml(historyItems: HistoryItemDto[] | undefined): string {
     if (!historyItems || historyItems.length === 0) {
        return '<div class="section"><div class="section-title"><span class="codicon codicon-history"></span> History</div><div>No history items available.</div></div>';
    }
     const itemsHtml = historyItems.map(item => `
        <div class="history-item">
            <strong>${escape(item.type)}:</strong> ${escape(item.value)}<br>
            <small>On ${new Date(item.date).toLocaleString()} ${item.user ? `by ${escape(item.user.firstName)} ${escape(item.user.lastName)}` : ''}</small>
        </div>
    `).join('');
    return `<div class="section"><div class="section-title"><span class="codicon codicon-history"></span> History</div>${itemsHtml}</div>`;
}

function _generateDataFlowHtml(dataFlowItems: DataFlowItemDto[] | undefined): string {
    if (!dataFlowItems || dataFlowItems.length === 0) {
        return '<div>No data flow information available.</div>';
    }
    const itemsHtml = dataFlowItems.sort((a, b) => a.order - b.order).map(item => `
        <div class="data-flow-item">
            <strong title="Line ${item.line}"><span class="codicon codicon-arrow-right"></span> ${escape(item.type)} : ${escape(item.nameHighlight)}</strong>
            <pre class="code-block">${item.code.map(l => `<span class="line-number">${l.line}</span> ${escape(l.content)}`).join('\n')}</pre>
        </div>
    `).join('');
    return `<div class="section"><div class="section-title"><span class="codicon codicon-graph"></span> Data Flow</div>${itemsHtml}</div>`;
}


function _generateCodeSnippetsHtml(codeSnippets: CodeSnippetDto[] | undefined): string {
    if (!codeSnippets || codeSnippets.length === 0) {
        // Ne retourne rien si pas de snippet, la section ne sera pas affichée
        return '';
    }
    const snippetsHtml = codeSnippets.map(snippet => `
        <div class="code-snippet">
            <div class="snippet-header">Lines ${snippet.startLine} - ${snippet.endLine} (Vulnerable: ${snippet.vulnerableStartLine === snippet.vulnerableEndLine ? snippet.vulnerableStartLine : `${snippet.vulnerableStartLine} - ${snippet.vulnerableEndLine}`})</div>
            <pre class="code-block">${snippet.code.map(line => {
                const isVulnerable = line.line >= snippet.vulnerableStartLine && line.line <= snippet.vulnerableEndLine;
                return `<span class="line ${isVulnerable ? 'line-vulnerable' : ''}"><span class="line-number">${line.line}</span> <span class="line-content">${escape(line.content)}</span></span>`;
             }).join('\n')}</pre>
            ${snippet.fixAnalysis ? `<div class="fix-analysis"><strong>Fix Analysis:</strong> ${escape(snippet.fixAnalysis)}</div>` : ''}
            ${snippet.fixAnalysisDescription ? `<div class="fix-analysis-desc">${escape(snippet.fixAnalysisDescription)}</div>` : ''}
        </div>
    `).join('');
    return `<div class="section"><div class="section-title"><span class="codicon codicon-code"></span> Code Snippet(s)</div>${snippetsHtml}</div>`;
}

function _generateScaReferencesHtml(references: VulnerabilityScaReferenceDto[] | undefined): string {
     if (!references || references.length === 0) {
        return '<div>No references available.</div>';
    }
     const refsHtml = references.map(ref => `
        <li><a href="${escape(ref.url)}" title="${escape(ref.url)}"><span class="codicon codicon-link"></span> ${escape(ref.type)}</a></li>
    `).join('');
    return `<div><strong>References:</strong><ul class="references-list">${refsHtml}</ul></div>`;
}


/**
 * Generates HTML for the Vulnerability Details Webview View.
 */
export function getDetailsWebviewHtml(response: GetProjectVulnerabilityByIdResponseDto, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);
    const vulnerabilityObject = response.vulnerability;

    if (!vulnerabilityObject || !vulnerabilityObject.vulnerability) {
        console.error("Invalid vulnerability data received for details view:", response);
        return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Error</title><link href="${codiconsUri}" rel="stylesheet" /><style>${getCodiconStyleSheet(codiconsFontUri)} body { padding: 20px; font-family: var(--vscode-font-family); color: var(--vscode-errorForeground); }</style></head><body><h2><span class="codicon codicon-error"></span> Error</h2><p>Could not load vulnerability details. Invalid data received from API.</p></body></html>`;
    }

    const commonMetadata = vulnerabilityObject.vulnerability;
    const title = escape(commonMetadata.name || vulnerabilityObject.id || 'Unknown Vulnerability');
    const severity = escape(vulnerabilityObject.currentSeverity || 'UNKNOWN');
    const description = escape(commonMetadata.description || 'No description available.');
    const recommendation = escape(commonMetadata.howToPrevent || 'No recommendation available.');
    const ruleOrCveId = escape((commonMetadata as VulnerabilityScaMetadataDto).cve || commonMetadata.id || 'N/A');
    const detectionId = escape(vulnerabilityObject.id);
    const currentState = escape(vulnerabilityObject.currentState || 'N/A');
    const currentPriority = escape(vulnerabilityObject.currentPriority || 'N/A');
    const createdAt = new Date(vulnerabilityObject.createdAt).toLocaleString();
    const updatedAt = new Date(vulnerabilityObject.updateAt).toLocaleString();
    const severityClass = getSeverityClass(vulnerabilityObject.currentSeverity);
    const currentVulnType = commonMetadata.vulnerabilityType as ScanType | undefined;

    let filePath = 'N/A';
    let lineNumber = 0;
    let specificDetailsHtml = '';
    let codeSnippetsHtml = '';
    let historyHtml = _generateHistoryHtml(vulnerabilityObject.historyItems);

    // --- Generate HTML specific to the vulnerability type ---
    if (isSastVulnerability(vulnerabilityObject)) {
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        specificDetailsHtml = `
            ${_generateDataFlowHtml(vulnerabilityObject.dataFlowItems)}
            <div class="section">
                <div class="section-title"><span class="codicon codicon-comment"></span> Contextual Explanation</div>
                <div class="explanation-content">${escape(vulnerabilityObject.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="section">
                 <div class="section-title"><span class="codicon codicon-symbol-field"></span> Language</div>
                 <code>${escape(vulnerabilityObject.language || 'N/A')}</code>
            </div>
        `;
        codeSnippetsHtml = _generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets);
    } else if (isIacVulnerability(vulnerabilityObject)) {
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        const scannerType = (vulnerabilityObject as any).scannerType || 'N/A'; // Use assertion if needed
        specificDetailsHtml = `
            <div class="section">
                <div class="section-title"><span class="codicon codicon-comment"></span> Contextual Explanation</div>
                <div class="explanation-content">${escape(vulnerabilityObject.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
             <div class="section">
                  <div class="section-title"><span class="codicon codicon-server-process"></span> Scanner Type</div>
                  <code>${escape(scannerType)}</code>
             </div>
             <div class="section">
                  <div class="section-title"><span class="codicon codicon-symbol-field"></span> Language</div>
                  <code>${escape(vulnerabilityObject.language || 'N/A')}</code>
             </div>
        `;
        codeSnippetsHtml = _generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets);
    } else if (isScaVulnerability(vulnerabilityObject)) {
        const scaVuln = vulnerabilityObject as VulnerabilityScaDto;
        const scaPackage = scaVuln.package;
        const scaMetadata = scaVuln.vulnerability;
        const cvssScore = scaVuln.cvssScore;
        filePath = scaPackage?.fileName || 'Manifest File'; // Provide default text
        lineNumber = 0;

        specificDetailsHtml = `
            <div class="section">
                <div class="section-title"><span class="codicon codicon-package"></span> Package Details</div>
                <div class="package-details">
                    <div><strong>Name:</strong> ${escape(scaPackage?.packageName || 'N/A')}</div>
                    <div><strong>Version:</strong> ${escape(scaPackage?.packageVersion || 'N/A')}</div>
                    <div><strong>Ecosystem:</strong> ${escape(scaPackage?.ecosystem || 'N/A')}</div>
                    ${cvssScore !== undefined ? `<div><strong>CVSS Score:</strong> <span class="cvss-score">${cvssScore}</span></div>` : ''}
                </div>
            </div>
            <div class="section">
                 <div class="section-title"><span class="codicon codicon-key"></span> Identifiers & References</div>
                 <div class="identifiers">
                     <div><strong>CVE:</strong> <code>${escape(scaMetadata.cve || 'N/A')}</code></div>
                     <div><strong>Internal ID:</strong> <code>${escape(scaMetadata.internalId || 'N/A')}</code></div>
                 </div>
                 ${_generateScaReferencesHtml(scaMetadata.references)}
            </div>
            <div class="section">
                <div class="section-title"><span class="codicon codicon-note"></span> Summary</div>
                <div class="summary-content">${escape(scaMetadata.summary || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
        `;
        codeSnippetsHtml = ''; // No code snippets for SCA
    } else {
        specificDetailsHtml = `<div class="section"><div class="section-title">Details</div><div>Could not determine vulnerability type. Type: ${commonMetadata.vulnerabilityType}</div></div>`;
    }

    // --- Construct Final HTML ---
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>Vulnerability Detail</title>
        <style>
            ${getCodiconStyleSheet(codiconsFontUri)}

            :root {
                --detail-padding: 20px;
                --section-border: 1px solid var(--vscode-editorWidget-border, #CCCCCC);
                --code-background: rgba(var(--vscode-editor-foreground-rgb), 0.04);
                --vulnerable-line-background: rgba(var(--vscode-errorForeground-rgb), 0.15);
                --vulnerable-line-border: 1px solid rgba(var(--vscode-errorForeground-rgb), 0.4);
            }

            body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: var(--detail-padding); font-size: var(--vscode-font-size); line-height: 1.5; }
            h1 { color: var(--vscode-editor-foreground); padding-bottom: 10px; margin: 0 0 15px 0; font-size: 1.5em; display: flex; align-items: center; gap: 8px; border-bottom: var(--section-border); }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: 600; margin-bottom: 10px; font-size: 1.15em; color: var(--vscode-sideBar-foreground); display: flex; align-items: center; gap: 6px; padding-bottom: 5px; border-bottom: 1px dotted var(--vscode-editorWidget-border); }

            /* Severity Badge */
            .severity { display: inline-block; padding: 4px 12px; border-radius: 15px; font-weight: bold; color: white; margin-bottom: 20px; font-size: .9em; text-transform: uppercase; letter-spacing: 0.5px; }
            .severity-critical { background-color: var(--severity-color-critical, #D14949); }
            .severity-high { background-color: var(--severity-color-high, #E17D3A); }
            .severity-medium { background-color: var(--severity-color-medium, #007ACC); color: white; } /* Ensure contrast */
            .severity-low { background-color: var(--severity-color-low, #777777); }
            .severity-info { background-color: var(--severity-color-info, #999999); }
            .severity-unknown { background-color: var(--severity-color-unknown, #AAAAAA); }

            /* Grid Layout */
            .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 25px; }
            .grid-item { background-color: var(--vscode-input-background); padding: 12px; border-radius: 4px; font-size: 0.95em; border: 1px solid var(--vscode-input-border, transparent); }
            .grid-item strong { display: block; margin-bottom: 6px; color:rgb(120, 69, 255); font-weight: 600; }
            .grid-item code { font-size: 0.9em; background-color: var(--code-background); padding: 2px 4px; border-radius: 3px; }

            /* Location */
            .location { background-color: var(--code-background); padding: 10px; border-radius: 4px; margin-bottom: 5px; border: 1px solid var(--vscode-panel-border); }
            .location code { font-family: var(--vscode-editor-font-family); background-color: transparent; padding: 0; }
            .location-link { color:rgb(120, 69, 255); text-decoration: none; cursor: pointer; font-weight: 500; }
            .location-link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

             /* General Content Styles */
             .explanation-content, .summary-content, .description-content { padding-left: 5px; } /* Slight indent */

            /* Code Blocks & Snippets */
            pre.code-block { background-color: var(--code-background); padding: 12px; border-radius: 4px; overflow-x: auto; white-space: pre; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); border: 1px solid var(--vscode-panel-border); margin-top: 8px; }
            code:not(.grid-item code) { font-family: var(--vscode-editor-font-family); background-color: var(--code-background); padding: .2em .4em; border-radius: 3px; }
            .line { display: block; } /* Ensure each line is block */
            .line-number { display: inline-block; width: 3.5em; padding-right: 1em; text-align: right; color: var(--vscode-editorLineNumber-foreground); user-select: none; opacity: 0.7; }
            .line-content { }
            .line-vulnerable .line-content { background-color: var(--vulnerable-line-background); display: inline-block; width: calc(100% - 4.5em); /* Adjust based on line number width */ }
             .line-vulnerable { border-left: var(--vulnerable-line-border); }

            /* Specific Details Sections */
             .package-details div, .identifiers div { margin-bottom: 5px; }
             .cvss-score { font-weight: bold; color: var(--vscode-charts-red); } /* Highlight CVSS */
             ul.references-list { list-style: none; padding-left: 0; margin-top: 8px; }
             ul.references-list li { margin-bottom: 4px; }
             ul.references-list a { display: inline-flex; align-items: center; gap: 5px; text-decoration: none; }
             ul.references-list a .codicon { font-size: 0.9em; }

            /* Data Flow & History */
            .data-flow-item, .history-item { margin-bottom: 12px; padding: 12px; background-color: var(--vscode-input-background); border-radius: 4px; border-left: 3px solidrgb(120, 69, 255); }
            .data-flow-item strong, .history-item strong { display: block; margin-bottom: 5px; font-weight: 600; }
            .history-item small { color: var(--vscode-descriptionForeground); margin-top: 3px; display: block; }
            .data-flow-item strong .codicon { font-size: 0.9em; margin-right: 2px; }

            /* Code Snippet Specific */
            .code-snippet { margin-bottom: 15px; }
            .snippet-header { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-bottom: 5px; }
            .fix-analysis { margin-top: 10px; font-weight: bold; }
            .fix-analysis-desc { font-size: 0.95em; color: var(--vscode-foreground); }

        </style>
    </head>
    <body>
        <h1><span class="codicon codicon-shield"></span> ${title}</h1>
        <div class="severity ${severityClass}">${severity}</div>

        <div class="grid-container">
            <div class="grid-item"><strong>State:</strong> ${currentState}</div>
            <div class="grid-item"><strong>Priority:</strong> ${currentPriority}</div>
            <div class="grid-item"><strong>Detected:</strong> ${createdAt}</div>
            <div class="grid-item"><strong>Last Seen:</strong> ${updatedAt}</div>
            <div class="grid-item"><strong>Detection ID:</strong> <code>${detectionId}</code></div>
            <div class="grid-item"><strong>Rule ID / CVE:</strong> <code>${ruleOrCveId}</code></div>
        </div>

        <div class="section">
            <div class="section-title"><span class="codicon codicon-location"></span> Location</div>
            <div class="location">
                <code>
                    ${filePath && filePath !== 'N/A' ?
                        `<a class="location-link" href="#" data-command="openFile" title="Click to open file">${escape(filePath)}${lineNumber > 0 ? `:${lineNumber}` : ''}</a>`
                        : 'N/A'
                    }
                </code>
            </div>
        </div>

        <div class="section">
            <div class="section-title"><span class="codicon codicon-book"></span> Description</div>
            <div class="description-content">${description.replace(/\n/g, '<br>')}</div>
        </div>

        ${specificDetailsHtml}
        ${codeSnippetsHtml}

        <div class="section">
            <div class="section-title"><span class="codicon codicon-lightbulb"></span> Recommendation</div>
            <div class="recommendation-content">${recommendation.replace(/\n/g, '<br>')}</div>
        </div>

        ${historyHtml}

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const filePathForScript = ${JSON.stringify(filePath)};
            const lineNumberForScript = ${lineNumber};
            const vulnerabilityType = '${currentVulnType || ''}';

            document.querySelectorAll('.location-link').forEach(link => {
                link.addEventListener('click', event => {
                    event.preventDefault();
                    const targetPath = filePathForScript;
                    const targetLine = lineNumberForScript;
                    if (targetPath && targetPath !== 'N/A') {
                         const lineToSend = (vulnerabilityType === 'sca' || targetLine <= 0) ? 1 : targetLine;
                         vscode.postMessage({
                            command: 'triggerOpenFile',
                            filePath: targetPath,
                            lineNumber: lineToSend
                        });
                    } else {
                        console.warn("Open file link clicked, but path invalid.");
                    }
                });
            });
        </script>
    </body>
    </html>`;
}