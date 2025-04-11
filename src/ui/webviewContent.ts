// src/ui/webviewContent.ts
import * as vscode from 'vscode';
// Importe le type de *réponse* de l'API depuis son fichier original
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto'; // Chemin correct
// Importe les *interfaces/types internes* définis dans notre dossier details
import {
    SastVulnerabilityDetectionDto,
    IacVulnerabilityDetectionDto,
    ScaVulnerabilityWithCvssDto,
    CodeSnippetDto,
    DataFlowItemDto,
    HistoryItemDto,
    CodeLineDto,
    VulnerabilitySeverityEnum,
    DetailedVulnerability // Importe l'union type aussi
} from '../dtos/result/details'; // Importe depuis l'index du dossier 'details'
import { escape } from 'lodash';

// --- Fonctions Utilitaires (getNonce, getWebviewUri) ---
// (Ces fonctions restent inchangées par rapport à la version précédente)
function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
function getWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}


// --- HTML Settings Webview (Inchangé) ---
export function getSettingsWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const isKeySetMessage = "API Key is configured securely. Update if needed.";
    // Code HTML/CSS/JS pour les settings (identique à la version précédente)
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Scanner Settings</title><style>body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; } button { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border); padding: 5px 15px; cursor: pointer; border-radius: 2px; margin-top: 10px; } button:hover { background-color: var(--vscode-button-hoverBackground); } p { margin-bottom: 15px; }</style></head><body><h1>Cybex Scanner Settings</h1><p>${isKeySetMessage}</p><button id="update-key-button">Update API Key</button><script nonce="${nonce}">const vscode = acquireVsCodeApi(); document.getElementById('update-key-button').addEventListener('click', () => { vscode.postMessage({ command: 'triggerUpdateApiKey' }); });</script></body></html>`;
}


// --- HTML Details Webview (Corrigé avec re-cast explicite dans chaque case) ---
export function getDetailsWebviewHtml(response: GetProjectVulnerabilityByIdResponseDto, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    // response.vulnerability est notre objet DetailedVulnerability (l'union)
    const vulnerabilityObject = response.vulnerability;

    // Extraire données communes (échappées)
    // Accéder à la propriété 'vulnerability' imbriquée pour les métadonnées générales
    const commonMetadata = vulnerabilityObject.vulnerability; // Soit VulnerabilityMetadataDto, soit VulnerabilityScaMetadataDto
    const title = escape(commonMetadata?.name || vulnerabilityObject.id || 'Unknown Vulnerability');
    const severity = escape(vulnerabilityObject.currentSeverity || 'UNKNOWN');
    const description = escape(commonMetadata?.description || 'No description available.');
    const recommendation = escape(commonMetadata?.howToPrevent || 'No recommendation available.');
    const ruleId = escape(commonMetadata?.id || 'N/A');
    const detectionId = escape(vulnerabilityObject.id);
    const currentState = escape(vulnerabilityObject.currentState || 'N/A');
    const currentPriority = escape(vulnerabilityObject.currentPriority || 'N/A');
    const createdAt = new Date(vulnerabilityObject.createdAt).toLocaleString();
    const updatedAt = new Date(vulnerabilityObject.updateAt).toLocaleString();

    let filePath = 'N/A';
    let lineNumber = 0;
    let specificDetailsHtml = '';
    let codeSnippetsHtml = '';
    // L'historique est commun, on peut le générer ici
    let historyHtml = generateHistoryHtml(vulnerabilityObject.historyItems);
    let severityClass = getSeverityClass(vulnerabilityObject.currentSeverity);

    // --- Générer HTML spécifique en utilisant le type discriminant et un cast ---
    switch (commonMetadata?.vulnerabilityType) {
        case 'sast':
            // Cast explicite pour aider TypeScript
            const sastVuln = vulnerabilityObject as unknown as SastVulnerabilityDetectionDto;
            filePath = sastVuln.path || '';
            lineNumber = sastVuln.vulnerableStartLine || 0;
            specificDetailsHtml = `
                <div class="section">
                    <div class="section-title">Data Flow</div>
                    ${generateDataFlowHtml(sastVuln.dataFlowItems)}
                </div>
                <div class="section">
                    <div class="section-title">Contextual Explanation</div>
                    <div>${escape(sastVuln.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
                </div>
            `;
            codeSnippetsHtml = generateCodeSnippetsHtml(sastVuln.codeSnippets);
            break;

        case 'iac':
            // Cast explicite
            const iacVuln = vulnerabilityObject as unknown as IacVulnerabilityDetectionDto;
            filePath = iacVuln.path || '';
            lineNumber = iacVuln.vulnerableStartLine || 0;
            specificDetailsHtml = `
                <div class="section">
                    <div class="section-title">Contextual Explanation</div>
                    <div>${escape(iacVuln.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
                </div>
                 <div class="section">
                     <div class="section-title">Scanner Type</div>
                     <code>${escape(iacVuln.scannerType || 'N/A')}</code>
                 </div>
            `;
            codeSnippetsHtml = generateCodeSnippetsHtml(iacVuln.codeSnippets);
            break;

        case 'sca':
            // Cast explicite
            const scaVuln = vulnerabilityObject as ScaVulnerabilityWithCvssDto;
            // Ici, scaVuln.vulnerability est de type VulnerabilityScaMetadataDto
            filePath = scaVuln.scaDetectedPackage?.fileName || ''; // Fichier où le package a été détecté
            lineNumber = 0; // Non pertinent
            specificDetailsHtml = `
                <div class="section">
                    <div class="section-title">Package Details</div>
                    <div><strong>Name:</strong> ${escape(scaVuln.scaDetectedPackage?.packageName || 'N/A')}</div>
                    <div><strong>Version:</strong> ${escape(scaVuln.scaDetectedPackage?.packageVersion || 'N/A')}</div>
                    <div><strong>Ecosystem:</strong> ${escape(scaVuln.scaDetectedPackage?.ecosystem || 'N/A')}</div>
                    ${scaVuln.cvssScore !== undefined ? `<div><strong>CVSS Score:</strong> ${scaVuln.cvssScore}</div>` : ''}
                </div>
                <div class="section">
                     <div class="section-title">Identifiers</div>
                     <div><strong>CVE:</strong> ${escape(scaVuln.vulnerability?.cve || 'N/A')}</div>
                     <div><strong>Internal ID:</strong> ${escape(scaVuln.vulnerability?.internalId || 'N/A')}</div>
                     </div>
                <div class="section">
                    <div class="section-title">SCA Summary</div>
                    <div>${escape(scaVuln.vulnerability?.summary || 'N/A').replace(/\n/g, '<br>')}</div>
                </div>
            `;
            // Pas de snippets/data flow pour SCA
            codeSnippetsHtml = ''; // Assurer que c'est vide
            break;
        default:
            console.warn("Could not determine vulnerability type for details view:", vulnerabilityObject);
            specificDetailsHtml = `<div class="section"><div class="section-title">Details</div><div>Could not determine vulnerability type.</div></div>`;
            severityClass = 'severity-unknown';
    }

    // --- Construction HTML Final ---
    // Utilise les variables (title, severity, etc.) et les sections HTML générées (specificDetailsHtml, etc.)
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vulnerability Detail</title>
        <style>
          /* Styles CSS (identiques à la version précédente) */
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; }
          h1 { color: var(--vscode-editor-foreground); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 15px; font-size: 1.4em; }
          .section { margin-bottom: 20px; }
          .section-title { font-weight: bold; margin-bottom: 8px; font-size: 1.1em; color: var(--vscode-textLink-foreground); }
          .severity { display: inline-block; padding: 3px 10px; border-radius: 15px; font-weight: bold; color: white; margin-bottom: 15px; font-size: 0.9em;}
          .severity-high { background-color: var(--vscode-errorForeground); }
          .severity-medium { background-color: #FFA500; }
          .severity-low { background-color: var(--vscode-list-activeSelectionBackground); }
          .severity-unknown { background-color: var(--vscode-disabledForeground); }
          .location { background-color: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; margin-bottom: 5px; }
          .location code { font-family: var(--vscode-editor-font-family); }
          .location-link { color: var(--vscode-textLink-foreground); text-decoration: none; cursor: pointer; }
          .location-link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
          pre { background-color: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; font-family: var(--vscode-editor-font-family); }
          code { font-family: var(--vscode-editor-font-family); background-color: var(--vscode-textCodeBlock-background); padding: 0.2em 0.4em; border-radius: 3px;}
          .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 15px;}
          .grid-item { background-color: var(--vscode-sideBar-background); padding: 10px; border-radius: 4px; }
          .grid-item strong { display: block; margin-bottom: 5px; color: var(--vscode-textLink-foreground); }
          .data-flow-item, .history-item, .code-snippet { margin-bottom: 10px; padding: 10px; background-color: var(--vscode-sideBar-background); border-radius: 4px; border-left: 3px solid var(--vscode-textLink-foreground); }
          .data-flow-item strong, .history-item strong { display: block; margin-bottom: 4px; color: var(--vscode-editor-foreground); }
          .line-number { display: inline-block; width: 3em; text-align: right; margin-right: 1em; color: var(--vscode-editorLineNumber-foreground); }
        </style>
    </head>
    <body>
        <h1>${title}</h1>
        <div class="severity ${severityClass}">${severity}</div>

        <div class="grid-container">
             <div class="grid-item"><strong>State:</strong> ${currentState}</div>
             <div class="grid-item"><strong>Priority:</strong> ${currentPriority}</div>
             <div class="grid-item"><strong>Detected:</strong> ${createdAt}</div>
             <div class="grid-item"><strong>Last Seen:</strong> ${updatedAt}</div>
             <div class="grid-item"><strong>Detection ID:</strong> <code>${detectionId}</code></div>
              <div class="grid-item"><strong>Rule ID / CVE:</strong> <code>${ruleId}</code></div>
         </div>

        <div class="section">
            <div class="section-title">Location</div>
            <div class="location">
                <code>
                     ${filePath && (lineNumber > 0 || commonMetadata?.vulnerabilityType !== 'sca')
                         ? `<a class="location-link" href="#" data-command="openFile" title="Click to open file">${escape(filePath)}:${lineNumber}</a>`
                         : escape(filePath) || 'N/A'
                     }
                </code>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Description</div>
            <div>${description.replace(/\n/g, '<br>')}</div>
        </div>

        ${specificDetailsHtml}
        ${codeSnippetsHtml}

        <div class="section">
            <div class="section-title">Recommendation</div>
            <div>${recommendation.replace(/\n/g, '<br>')}</div>
        </div>

        ${historyHtml}

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const vulnerabilityType = '${commonMetadata?.vulnerabilityType || ''}'; // Pass type to script

            document.querySelectorAll('.location-link').forEach(link => {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    const targetPath = '${filePath.replace(/\\/g, '\\\\')}';
                    const targetLine = ${lineNumber};

                    // Only trigger open file if path exists and line is valid or if it's not SCA
                    if (targetPath && (targetLine > 0 || vulnerabilityType !== 'sca')) {
                         vscode.postMessage({
                             command: 'triggerOpenFile',
                             filePath: targetPath,
                             lineNumber: targetLine > 0 ? targetLine : 1 // Default to line 1 if 0
                         });
                    } else {
                        console.warn("Open file link clicked, but path/line invalid or not applicable for this type.");
                    }
                });
            });
        </script>
    </body>
    </html>`;
}


// --- Fonctions Helper (getSeverityClass, generateCodeSnippetsHtml, generateDataFlowHtml, generateHistoryHtml) ---
// (Ces fonctions restent inchangées, assure-toi qu'elles sont présentes et correctes)
function getSeverityClass(severity?: string): string {
    const upperSeverity = severity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN;
    switch (upperSeverity) {
        case VulnerabilitySeverityEnum.CRITICAL:
        case VulnerabilitySeverityEnum.HIGH: return 'severity-high';
        case VulnerabilitySeverityEnum.MEDIUM: return 'severity-medium';
        case VulnerabilitySeverityEnum.LOW:
        case VulnerabilitySeverityEnum.INFO: return 'severity-low';
        default: return 'severity-unknown';
    }
}

function generateCodeSnippetsHtml(snippets?: CodeSnippetDto[]): string {
    if (!snippets || snippets.length === 0) return '';
    let html = '<div class="section"><div class="section-title">Code Snippets</div>';
    snippets.forEach((snippet, index) => {
        let codeContent = 'Error parsing code';
        try {
             if (Array.isArray(snippet.code)) {
                 codeContent = snippet.code.map(line => `<span class="line-number">${line.line}</span> ${escape(line.content)}`).join('\n');
             } else if (typeof snippet.code === 'string') { codeContent = escape(snippet.code); }
             else { codeContent = '// Code content format not recognized'; }
        } catch (e) { console.error("Failed to process code snippet", e); codeContent = '// Error processing code snippet'; }
        html += `<div class="code-snippet"><strong>Snippet ${index + 1} (${snippet.language})</strong><div>Lines ${snippet.startLine}-${snippet.endLine} (Vulnerable: ${snippet.vulnerableStartLine}-${snippet.vulnerableEndLine})</div><pre><code>${codeContent}</code></pre>${snippet.fixAnalysis ? `<div><strong>Fix Analysis:</strong> ${escape(snippet.fixAnalysis)}</div>` : ''}${snippet.fixAnalysisDescription ? `<div>${escape(snippet.fixAnalysisDescription).replace(/\n/g, '<br>')}</div>` : ''}</div>`;
    });
    html += '</div>';
    return html;
}

function generateDataFlowHtml(dataFlows?: DataFlowItemDto[]): string {
    if (!dataFlows || dataFlows.length === 0) return '';
    dataFlows.sort((a, b) => a.order - b.order);
    let html = '<div class="section"><div class="section-title">Data Flow</div>';
    dataFlows.forEach(item => {
        let codeContent = 'Error parsing code';
         try {
             if (Array.isArray(item.code)) { codeContent = item.code.map(line => `<span class="line-number">${line.line}</span> ${escape(line.content)}`).join('\n');}
             else if (typeof item.code === 'string') { codeContent = escape(item.code); }
             else { codeContent = '// Code content format not recognized';}
         } catch (e) { console.error("Failed to process data flow code", e); codeContent = '// Error processing code'; }
        html += `<div class="data-flow-item"><strong>${escape(item.type)} at Line ${item.line} (Order: ${item.order})</strong><div>Highlight: ${escape(item.nameHighlight)}</div><pre><code>${codeContent}</code></pre></div>`;
    });
    html += '</div>';
    return html;
}

function generateHistoryHtml(historyItems?: HistoryItemDto[]): string {
    if (!historyItems || historyItems.length === 0) return '';
    historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    let html = '<div class="section"><div class="section-title">History</div>';
    historyItems.forEach(item => {
        const formattedDate = new Date(item.date).toLocaleString();
        const userName = item.user ? `${escape(item.user.firstName)} ${escape(item.user.lastName)}` : 'System/Unknown';
        html += `<div class="history-item"><strong>${escape(item.type)} on ${formattedDate} by ${userName}</strong><div>${escape(item.value).replace(/\n/g, '<br>')}</div></div>`;
    });
    html += '</div>';
    return html;
}