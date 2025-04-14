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
import { getSeverityClass, getCommonAssetUris, getCodiconStyleSheet, severityColorMap, severityToIconMap } from './commonHtmlUtils'; // Importer depuis utils

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
        return '<div class="section"><div class="section-title"><span class="codicon codicon-history"></span> History</div><div style="color: var(--vscode-descriptionForeground); padding-left: 5px;">No history items available.</div></div>';
    }
     const itemsHtml = historyItems.map(item => `
        <div class="history-item">
            <strong>${escape(item.type)}:</strong> ${escape(item.value)}
            <small>On ${new Date(item.date).toLocaleString()} ${item.user ? `by ${escape(item.user.firstName)} ${escape(item.user.lastName)}` : ''}</small>
        </div>
    `).join('');
    return `<div class="section"><div class="section-title"><span class="codicon codicon-history"></span> History</div>${itemsHtml}</div>`;
}

function _generateDataFlowHtml(dataFlowItems: DataFlowItemDto[] | undefined): string {
    if (!dataFlowItems || dataFlowItems.length === 0) {
        return '<div style="color: var(--vscode-descriptionForeground); padding-left: 5px;">No data flow information available.</div>';
    }
    const itemsHtml = dataFlowItems.sort((a, b) => a.order - b.order).map(item => `
        <div class="data-flow-item">
            <strong title="Line ${item.line}"><span class="codicon codicon-arrow-right"></span> ${escape(item.type)} : ${escape(item.nameHighlight)}</strong>
            <pre class="code-block">${item.code.map(l => `<span class="line-number">${l.line}</span> ${escape(l.content)}`).join('\n')}</pre>
        </div>
    `).join('');
    return itemsHtml;
}


function _generateCodeSnippetsHtml(codeSnippets: CodeSnippetDto[] | undefined): string {
    if (!codeSnippets || codeSnippets.length === 0) {
        return '<div style="color: var(--vscode-descriptionForeground); padding-left: 5px;">No code snippets available.</div>';
    }
    const snippetsHtml = codeSnippets.map(snippet => `
        <div class="code-snippet">
            <div class="snippet-header">Lines ${snippet.startLine} - ${snippet.endLine} (Vulnerable: ${snippet.vulnerableStartLine === snippet.vulnerableEndLine ? snippet.vulnerableStartLine : `${snippet.vulnerableStartLine} - ${snippet.vulnerableEndLine}`})</div>
            <pre class="code-block">${snippet.code.map(line => {
                const isVulnerable = line.line >= snippet.vulnerableStartLine && line.line <= snippet.vulnerableEndLine;
                return `<span class="line ${isVulnerable ? 'line-vulnerable' : ''}"><span class="line-number">${line.line}</span><span class="line-content">${escape(line.content)}</span></span>`;
             }).join('\n')}</pre>
            ${snippet.fixAnalysis ? `<div class="fix-analysis"><strong>Fix Analysis:</strong> ${escape(snippet.fixAnalysis)}</div>` : ''}
            ${snippet.fixAnalysisDescription ? `<div class="fix-analysis-desc">${escape(snippet.fixAnalysisDescription)}</div>` : ''}
        </div>
    `).join('');
    return snippetsHtml;
}

function _generateScaReferencesHtml(references: VulnerabilityScaReferenceDto[] | undefined): string {
     if (!references || references.length === 0) {
        return '<div style="color: var(--vscode-descriptionForeground);">No references available.</div>';
    }
     const refsHtml = references.map(ref => `
        <li><a href="${escape(ref.url)}" title="${escape(ref.url)}"><span class="codicon codicon-link"></span> ${escape(ref.type || 'Link')}</a></li>
    `).join('');
    return `<ul class="references-list">${refsHtml}</ul>`;
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
    const severity = vulnerabilityObject.currentSeverity || 'UNKNOWN';
    const severityKey = severity.toUpperCase();
    const severityIconId = severityToIconMap[severityKey] || 'question';
    const severityColor = severityColorMap[severityKey] || severityColorMap['UNKNOWN']
    const severityStyle = `color: ${severityColor}; font-weight: bold;`;
    const severityClass = getSeverityClass(vulnerabilityObject.currentSeverity);
    const currentVulnType = commonMetadata.vulnerabilityType as ScanType | undefined;

    // CORRIGÉ: Déclarer les variables avant leur utilisation dans le template
    const description = escape(commonMetadata.description || 'No description available.');
    const recommendation = escape(commonMetadata.howToPrevent || 'No recommendation available.');
    const ruleOrCveId = escape((commonMetadata as VulnerabilityScaMetadataDto).cve || commonMetadata.id || 'N/A');
    const detectionId = escape(vulnerabilityObject.id);
    const currentState = escape(vulnerabilityObject.currentState || 'N/A');
    const currentPriority = escape(vulnerabilityObject.currentPriority || 'N/A');
    const createdAt = new Date(vulnerabilityObject.createdAt).toLocaleString();
    const updatedAt = new Date(vulnerabilityObject.updateAt).toLocaleString();

    let filePath = 'N/A';
    let lineNumber = 0;
    let specificDetailsHtml = '';
    let codeSnippetsHtml = '';
    let historyHtml = _generateHistoryHtml(vulnerabilityObject.historyItems);

    // --- Generate HTML specific to the vulnerability type ---
    if (isSastVulnerability(vulnerabilityObject)) {
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        specificDetailsHtml += `
            <div class="section">
                <div class="section-title"><span class="codicon codicon-graph"></span> Data Flow</div>
                ${_generateDataFlowHtml(vulnerabilityObject.dataFlowItems)}
            </div>
            <div class="section">
                <div class="section-title"><span class="codicon codicon-comment"></span> Contextual Explanation</div>
                <div class="explanation-content">${escape(vulnerabilityObject.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="section">
                 <div class="section-title"><span class="codicon codicon-symbol-field"></span> Language</div>
                 <code>${escape(vulnerabilityObject.language || 'N/A')}</code>
            </div>
        `;
        codeSnippetsHtml = `
            <div class="section">
                 <div class="section-title"><span class="codicon codicon-code"></span> Code Snippet(s)</div>
                 ${_generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets)}
            </div>
        `;
    } else if (isIacVulnerability(vulnerabilityObject)) {
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        const scannerType = (vulnerabilityObject as any).scannerType || 'N/A';
        specificDetailsHtml += `
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
         codeSnippetsHtml = `
            <div class="section">
                 <div class="section-title"><span class="codicon codicon-code"></span> Code Snippet(s)</div>
                 ${_generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets)}
            </div>
        `;
    } else if (isScaVulnerability(vulnerabilityObject)) {
        const scaVuln = vulnerabilityObject as VulnerabilityScaDto;
        const scaPackage = scaVuln.package;
        const scaMetadata = scaVuln.vulnerability;
        const cvssScore = scaVuln.cvssScore;
        filePath = scaPackage?.fileName || 'Manifest File';
        lineNumber = 0;

        specificDetailsHtml += `
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
        codeSnippetsHtml = ''; // Pas de snippets pour SCA
    } else {
        specificDetailsHtml = `<div class="section"><div class="section-title">Details</div><div>Could not determine vulnerability type. Type: ${escape(commonMetadata.vulnerabilityType || 'Unknown')}</div></div>`;
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
            /* Importe les styles de base et la font-face Codicon */
            ${getCodiconStyleSheet(codiconsFontUri)}
            
            /* Styles pour les lettres de sévérité (copié/adapté depuis findingsHtml) */
            .severity-icon {
                flex-shrink: 0;
                font-size: 0.9em;
                width: 20px; /* Légèrement plus grand */
                height: 20px;
                text-align: center;
                margin-right: 8px; /* Plus d'espace */
                font-weight: bold;
                border-radius: 50%;
                display: inline-flex; /* Aligner avec le titre */
                align-items: center;
                justify-content: center;
                background-color: rgba(255, 255, 255, 0.08);
                border: 1px solid currentColor;
                vertical-align: middle;
                position: relative;
                top: -1px; /* Ajustement vertical fin */
            }

            /* Couleurs de sévérité via variables CSS pour réutilisation */
            :root {
                /* CORRIGÉ: Utiliser severityColorMap au lieu de l'enum */
                --severity-color-critical: ${severityColorMap['CRITICAL']};
                --severity-color-high: ${severityColorMap['HIGH']};
                --severity-color-medium: ${severityColorMap['MEDIUM']};
                --severity-color-low: ${severityColorMap['LOW']};
                --severity-color-info: ${severityColorMap['INFO']};
                --severity-color-unknown: ${severityColorMap['UNKNOWN']};
                
                /* Variables de style globales */
                --detail-padding: 20px;
                --section-spacing: 25px;
                --section-border-color: var(--vscode-editorWidget-border, #444);
                --section-title-color: var(--vscode-sideBarTitle-foreground);
                --code-background: rgba(var(--vscode-editor-foreground-rgb), 0.05);
                --code-border-color: var(--vscode-panel-border);
                --vulnerable-line-background: rgba(var(--vscode-errorForeground-rgb), 0.1);
                --vulnerable-line-border-color: rgba(var(--vscode-errorForeground-rgb), 0.3);
                --interactive-color: var(--vscode-textLink-foreground, rgb(120, 69, 255));
                --interactive-hover-color: var(--vscode-textLink-activeForeground);
                --grid-item-background: rgba(var(--vscode-editorWidget-background-rgb), 0.5);
                --grid-item-border-color: var(--vscode-editorWidget-border, transparent);
            }

            body { 
                font-family: var(--vscode-font-family); 
                color: var(--vscode-foreground); 
                padding: var(--detail-padding); 
                font-size: var(--vscode-font-size); 
                line-height: 1.6; /* Améliorer lisibilité */
                background-color: var(--vscode-editor-background); /* Fond éditeur */
            }

            /* Titre principal */
            h1 {
                color: var(--vscode-editor-foreground);
                padding-bottom: 15px;
                margin: 0 0 var(--section-spacing) 0;
                font-size: 1.6em;
                display: flex;
                align-items: center;
                gap: 10px;
                border-bottom: 2px solid ${severityColor}; /* Couleur sévérité pour bordure */
                font-weight: 600; /* Plus marqué */
            }
            h1 .codicon-shield { 
                font-size: 1.2em; /* Icône plus grande */
                color: ${severityColor}; /* Couleur sévérité */
            }

            /* Structure générale des sections */
            .section {
                margin-bottom: var(--section-spacing);
                padding: 0; /* Padding géré par le contenu */
                background-color: transparent; /* Pas de fond par défaut */
                border-radius: 6px;
                border: none; /* Pas de bordure par défaut */
                box-shadow: none; /* Pas d'ombre par défaut */
            }
            .section-title {
                font-weight: 600;
                margin-bottom: 12px;
                padding-bottom: 8px; 
                font-size: 1.2em;
                color: var(--section-title-color);
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid var(--section-border-color);
                background-color: transparent; /* Pas de fond */
                border-radius: 0; /* Pas de coins arrondis */
            }
            .section-title .codicon { 
                font-size: 1.1em; 
                color: rgb(120,69,255); /* Couleur accent */
            }

            /* Grille d'infos (avec nouvelle structure) */
            .grid-container {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
                padding: 15px; /* Padding à l'intérieur de la grille */
                background-color: var(--grid-item-background);
                border-radius: 6px;
                border: 1px solid var(--grid-item-border-color);
            }
            
            /* Ces styles ne sont plus nécessaires avec la nouvelle structure */
            /* .grid-container.section {
                margin-bottom: var(--section-spacing);
                background-color: var(--grid-item-background);
                padding: 18px;
                border-radius: 6px;
                border: 1px solid var(--grid-item-border-color);
            }
             .grid-container .section-title {
                 margin: -18px -18px 15px -18px;
                 padding: 10px 18px;
                 border-bottom: 1px solid var(--section-border-color);
                 background-color: rgba(var(--vscode-panel-border-rgb), 0.1);
                 border-radius: 6px 6px 0 0;
             } */

            .grid-item {
                background-color: transparent; /* Fond fourni par le conteneur */
                padding: 10px;
                border-radius: 4px;
                font-size: 0.95em;
                border: 1px solid transparent; /* Bordure légère interne? */
                border-left: 3px solid; 
                transition: transform 0.1s ease, background-color 0.1s ease;
            }
            .grid-item:first-child { border-left-color: ${severityColor}; }
            .grid-item:not(:first-child) { border-left-color: rgb(120,69,255); }
            
            .grid-item:hover {
                transform: translateY(-1px);
                background-color: rgba(var(--vscode-list-hoverBackground-rgb), 0.5);
                /* box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); */
            }
            .grid-item strong {
                display: block;
                margin-bottom: 6px;
                color: var(--vscode-descriptionForeground); /* Plus discret */
                font-weight: 600;
                font-size: 0.85em;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .grid-item code {
                font-size: 1em;
                background-color: var(--code-background);
                padding: 3px 6px;
                border-radius: 3px;
                word-break: break-all; 
            }

            /* Section Localisation */
            .location {
                 padding: 5px 0; /* Padding vertical uniquement */
            }
            .location-link {
                color: rgb(120,69,255);
                text-decoration: none;
                cursor: pointer;
                font-weight: 600;
                font-family: var(--vscode-editor-font-family);
                font-size: 1.1em;
                display: inline-flex; /* Pour Codicon aligné */
                align-items: center;
                gap: 6px;
                padding: 5px 10px;
                background-color: var(--code-background);
                border-radius: 4px;
                border: 1px solid var(--code-border-color);
                transition: background-color 0.1s ease, color 0.1s ease;
            }
            .location-link:hover {
                color: var(--interactive-hover-color);
                background-color: rgba(var(--vscode-textLink-foreground-rgb), 0.1);
            }
             .location-link .codicon {
                 font-size: 1.1em; /* Taille adaptée */
             }

            /* Contenu textuel */
            .description-content, .recommendation-content, .explanation-content, .summary-content {
                padding: 5px 0 5px 5px; /* Padding ajusté */
                line-height: 1.7;
            }
            .description-content code, .recommendation-content code {
                 font-family: var(--vscode-editor-font-family);
                 background-color: var(--code-background);
                 padding: .1em .3em;
                 border-radius: 3px;
                 font-size: 0.95em;
            }

            /* Blocs de code & Snippets */
            pre.code-block {
                background-color: var(--code-background);
                padding: 15px;
                border-radius: 4px;
                overflow-x: auto;
                white-space: pre;
                font-family: var(--vscode-editor-font-family);
                font-size: var(--vscode-editor-font-size);
                border: 1px solid var(--code-border-color);
                margin-top: 10px;
                line-height: 1.45; /* Interligne code amélioré */
            }
            .line { display: block; }
            .line-number {
                display: inline-block;
                width: 3.5em;
                padding-right: 1.5em;
                text-align: right;
                color: var(--vscode-editorLineNumber-foreground);
                user-select: none;
                opacity: 0.6;
                font-style: italic;
            }
            .line-content { }
            .line-vulnerable {
                background-color: var(--vulnerable-line-background);
                outline: 1px solid var(--vulnerable-line-border-color);
                outline-offset: -1px;
                border-radius: 2px; /* Coins légèrement arrondis */
            }
            .line-vulnerable .line-number {
                opacity: 0.9;
                font-style: normal;
                font-weight: 600;
                color: var(--vscode-editorLineNumber-activeForeground);
            }

            /* Détails Spécifiques (SCA, Data Flow, History) */
            .package-details, .identifiers {
                padding-left: 5px;
            }
            .package-details div, .identifiers div {
                margin-bottom: 8px;
                font-size: 0.95em;
            }
            .cvss-score {
                font-weight: bold;
                color: var(--severity-color-high);
                background-color: var(--code-background);
                padding: 2px 6px;
                border-radius: 3px;
            }
            ul.references-list {
                list-style: none;
                padding-left: 5px;
                margin: 10px 0 0 0;
            }
            ul.references-list li {
                margin-bottom: 6px;
            }
            ul.references-list a {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                text-decoration: none;
                color: rgb(120,69,255);
                transition: color 0.1s ease;
                font-size: 0.95em;
            }
            ul.references-list a:hover {
                color: var(--interactive-hover-color);
                text-decoration: underline;
            }
            ul.references-list a .codicon {
                font-size: 1em;
            }

            .data-flow-item, .history-item {
                margin-bottom: 12px; /* Espacement réduit */
                padding: 12px 15px;
                background-color: var(--grid-item-background);
                border-radius: 4px;
                border-left: 3px solid rgb(120,69,255);
                position: relative;
                overflow: hidden;
            }
            .data-flow-item::before {
                /* Supprimé pour un look plus épuré */
            }
            .data-flow-item strong, .history-item strong {
                display: block;
                margin-bottom: 8px;
                font-weight: 600;
                color: var(--vscode-editor-foreground);
            }
            .history-item small {
                color: var(--vscode-descriptionForeground);
                margin-top: 5px;
                display: block;
                font-size: 0.9em;
            }
            .data-flow-item strong .codicon {
                font-size: 1em;
                margin-right: 4px;
                vertical-align: middle;
            }

            .code-snippet { margin-bottom: 15px; }
            .snippet-header {
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 8px;
                padding-left: 5px;
                border-left: 2px solid var(--section-border-color);
            }
            .fix-analysis { margin-top: 12px; font-weight: bold; }
            .fix-analysis-desc { font-size: 0.95em; color: var(--vscode-foreground); margin-top: 4px; }

        </style>
    </head>
    <body>
        <h1>
            <span class="severity-icon codicon codicon-${severityIconId}" style="${severityStyle}" title="Severity: ${severity}"></span>
            <span>${title}</span>
        </h1>
        
        <!-- Grille d'informations générales dans sa propre section stylisée -->
        <div class="section">
             <div class="section-title"><span class="codicon codicon-info"></span> General Information</div>
             <div class="grid-container">
                <div class="grid-item"><strong>State:</strong> ${currentState}</div>
                <div class="grid-item"><strong>Priority:</strong> ${currentPriority}</div>
                <div class="grid-item"><strong>Detected:</strong> ${createdAt}</div>
                <div class="grid-item"><strong>Last Seen:</strong> ${updatedAt}</div>
                <div class="grid-item"><strong>Detection ID:</strong> <code>${detectionId}</code></div>
                <div class="grid-item"><strong>Rule ID / CVE:</strong> <code>${ruleOrCveId}</code></div>
             </div>
        </div>

        <div class="section">
            <div class="section-title"><span class="codicon codicon-location"></span> Location</div>
            <div class="location">
                 ${filePath && filePath !== 'N/A' ?
                    `<a class="location-link" href="#" data-command="openFile" title="Click to open file ${escape(filePath)}">
                        <span class="codicon codicon-file-code"></span> ${escape(filePath)}${lineNumber > 0 ? `:${lineNumber}` : ''}
                    </a>`
                    : '<div style="color: var(--vscode-descriptionForeground); padding-left: 5px;">N/A</div>' // Message si pas de localisation
                 }
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