// src/ui/webviewContent.ts
import * as vscode from 'vscode';
import { escape } from 'lodash'; // Assure-toi que lodash est installé

// --- Import DTOs ---
// Import Response DTOs (Classes used in the API response structure and type guards initially)
import {
    GetProjectVulnerabilityByIdResponseDto,
    VulnerabilitySastDto, // Class used in the union type
    VulnerabilityIacDto,  // Class used in the union type
    VulnerabilityScaDto,  // Class used in the union type
    CodeSnippetDto,
    DataFlowItemDto,
    HistoryItemDto,
    CodeLineDto,
    VulnerabilityMetadataDto,      // Base metadata class
    VulnerabilityScaMetadataDto, // Specific SCA metadata class
    ScaDetectedLibraryDto,
    VulnerabilityScaReferenceDto // Needed for SCA references stub
} from '../dtos/result/response/get-project-vulnerability-by-id-response.dto'; // Path to the response DTO for Get By ID

// Import Summary/List Response DTOs
import {
    ScanProjectInfoDto,
    CountVulnerabilitiesCountByType
} from '../dtos/result/response/get-project-vulnerabilities-response.dto'; // For the summary view

// Import Detail DTOs (Interfaces - might represent expected structure more accurately in some cases)
import {
    VulnerabilitySeverityEnum, // Importe l'enum depuis le fichier commun
    BaseVulnerabilityDetectionDto, // Base interface for detections
    SastVulnerabilityDetectionDto, // SAST detection interface
    IacVulnerabilityDetectionDto,  // IaC detection interface
    ScaVulnerabilityWithCvssDto,   // SCA detection interface
    DetailedVulnerability          // Import the Union type from details/index.ts
} from '../dtos/result/details';

// Other imports
import { ScanType } from '../api/apiService'; // Assure que le chemin est correct
import { getNonce } from '../utilities/utils'; // Importe depuis les utilitaires

// --- Type Union (Based on the RESPONSE DTO *CLASSES*) ---
// This union is what the getDetailsWebviewHtml function actually receives via response.vulnerability
type ApiVulnerabilityType = VulnerabilitySastDto | VulnerabilityIacDto | VulnerabilityScaDto;

// --- Fonctions Type Guard (Operating on ApiVulnerabilityType - the *classes*) ---
// These guards check properties potentially present on the objects at runtime,
// even if not strictly defined on the base classes in the union.

/** Checks if the vulnerability object *structurally resembles* a SAST vulnerability. */
function isSastVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilitySastDto {
    // Use the discriminator from the nested 'vulnerability' object
    // AND check for a property specific to the SAST class definition
    return vuln.vulnerability?.vulnerabilityType === 'sast' && 'dataFlowItems' in vuln;
}

/** Checks if the vulnerability object *structurally resembles* an IaC vulnerability. */
function isIacVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilityIacDto {
    // Use the discriminator AND check for a property expected in IaC details (even if not on the base class).
    // The `VulnerabilityIacDto` class itself doesn't add `scannerType`, but the data might have it.
    // Rely on the discriminator primarily, and runtime check if needed.
    return vuln.vulnerability?.vulnerabilityType === 'iac' && !isSastVulnerability(vuln); // Ensure it's not SAST which is more specific
    // We might need `'scannerType' in vuln` if just the type isn't enough distinction, but it caused TS errors.
}

/** Checks if the vulnerability object *structurally resembles* an SCA vulnerability. */
function isScaVulnerability(vuln: ApiVulnerabilityType): vuln is VulnerabilityScaDto {
    // Use the discriminator AND check for the 'package' property defined in the VulnerabilityScaDto class.
    // Note: The property is defined as `['package']?: ScaDetectedLibraryDto;`
    return vuln.vulnerability?.vulnerabilityType === 'sca' && 'package' in vuln;
}


// --- Map Sévérité -> Icône ---
const severityToIconMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'error', // $(error)
    [VulnerabilitySeverityEnum.HIGH]: 'warning',   // $(warning) - Using warning for High for visual distinction from Critical
    [VulnerabilitySeverityEnum.MEDIUM]: 'info',     // $(info)
    [VulnerabilitySeverityEnum.LOW]: 'issues',    // $(issues) - Represents general issues/less severe
    [VulnerabilitySeverityEnum.INFO]: 'comment',   // $(comment) - More informational
    'UNKNOWN': 'question' // $(question)
};

// --- Map Sévérité -> CSS Class ---
const severityToCssClassMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'severity-critical', // Match CSS class names
    [VulnerabilitySeverityEnum.HIGH]: 'severity-high',
    [VulnerabilitySeverityEnum.MEDIUM]: 'severity-medium',
    [VulnerabilitySeverityEnum.LOW]: 'severity-low',
    [VulnerabilitySeverityEnum.INFO]: 'severity-info',
    'UNKNOWN': 'severity-unknown'
};

// --- Fonctions Utilitaires ---

/** Converts a local file path to a webview-usable URI. */
function getWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

/**
 * Generates a CSS class string based on severity.
 * @param severity The severity string (e.g., 'HIGH', 'MEDIUM').
 * @returns A CSS class name like 'severity-high'.
 */
function _getSeverityClass(severity: string | undefined | null): string {
    return severityToCssClassMap[severity?.toUpperCase() || 'UNKNOWN'] || 'severity-unknown';
}

/** Placeholder function for generating HTML for history items. */
function _generateHistoryHtml(historyItems: HistoryItemDto[] | undefined): string {
    if (!historyItems || historyItems.length === 0) {
        return '<div class="section"><div class="section-title">History</div><div>No history items available.</div></div>';
    }
    // Basic implementation - Enhance as needed
    const itemsHtml = historyItems.map(item => `
        <div class="history-item">
            <strong>${escape(item.type)}:</strong> ${escape(item.value)}<br>
            <small>On ${new Date(item.date).toLocaleString()} ${item.user ? `by ${escape(item.user.firstName)} ${escape(item.user.lastName)}` : ''}</small>
        </div>
    `).join('');
    return `<div class="section"><div class="section-title">History</div>${itemsHtml}</div>`;
}

/** Placeholder function for generating HTML for data flow items. */
function _generateDataFlowHtml(dataFlowItems: DataFlowItemDto[] | undefined): string {
     if (!dataFlowItems || dataFlowItems.length === 0) {
        return '<div>No data flow information available.</div>';
    }
     // Basic implementation - Enhance as needed
    const itemsHtml = dataFlowItems.sort((a,b) => a.order - b.order).map(item => `
        <div class="data-flow-item">
            <strong>${escape(item.type)} (Line ${item.line}):</strong> ${escape(item.nameHighlight)}<br>
            <code>${item.code.map(l => escape(l.content)).join('\n')}</code>
        </div>
    `).join('');
    return itemsHtml;
}

/** Placeholder function for generating HTML for code snippets. */
function _generateCodeSnippetsHtml(codeSnippets: CodeSnippetDto[] | undefined): string {
    if (!codeSnippets || codeSnippets.length === 0) {
        return '<div class="section"><div class="section-title">Code Snippets</div><div>No code snippets available.</div></div>';
    }
    // Basic implementation - Enhance as needed
    const snippetsHtml = codeSnippets.map(snippet => `
        <div class="code-snippet">
            <strong>Lines ${snippet.startLine} - ${snippet.endLine} (Vulnerable: ${snippet.vulnerableStartLine} - ${snippet.vulnerableEndLine})</strong>
            <pre>${snippet.code.map(line => `<span class="line-number">${line.line}</span>${escape(line.content)}`).join('\n')}</pre>
            ${snippet.fixAnalysis ? `<div><strong>Fix Analysis:</strong> ${escape(snippet.fixAnalysis)}</div>` : ''}
            ${snippet.fixAnalysisDescription ? `<div>${escape(snippet.fixAnalysisDescription)}</div>` : ''}
        </div>
    `).join('');
    return `<div class="section"><div class="section-title">Code Snippets</div>${snippetsHtml}</div>`;
}

/** Placeholder function for generating HTML for SCA references. */
function _generateScaReferencesHtml(references: VulnerabilityScaReferenceDto[] | undefined): string {
     if (!references || references.length === 0) {
        return '<div>No references available.</div>';
    }
     // Basic implementation - Enhance as needed
    const refsHtml = references.map(ref => `
        <li><a href="${escape(ref.url)}">${escape(ref.type)}: ${escape(ref.url)}</a></li>
    `).join('');
    return `<div><strong>References:</strong><ul>${refsHtml}</ul></div>`;
}


// ============================================================================
// HTML Generation Functions for Specific Views
// ============================================================================

/** Generates HTML for the Settings Webview. */
export function getSettingsWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const isKeySetMessage = "API Key is configured securely. Update if needed.";
    // Inclut tout le HTML et le script pour la page des paramètres
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Scanner Settings</title><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:20px}button{background-color:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border);padding:5px 15px;cursor:pointer;border-radius:2px;margin-top:10px}button:hover{background-color:var(--vscode-button-hoverBackground)}p{margin-bottom:15px}</style></head><body><h1>CybeDefend scanner Settings</h1><p>${isKeySetMessage}</p><button id="update-key-button">Update API Key</button><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('update-key-button').addEventListener('click',()=>{vscode.postMessage({command:'triggerUpdateApiKey'})})</script></body></html>`;
}

/** Generates HTML for the Vulnerability Details Webview View. */
export function getDetailsWebviewHtml(response: GetProjectVulnerabilityByIdResponseDto, webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    // Use the 'vulnerability' property from the response DTO. Its type is ApiVulnerabilityType (the class union).
    const vulnerabilityObject = response.vulnerability;

    // Check if vulnerabilityObject is valid
     if (!vulnerabilityObject || !vulnerabilityObject.vulnerability) {
         console.error("Invalid vulnerability data received for details view:", response);
         // Provide fallback HTML
         return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Error</title></head><body><h1>Error</h1><p>Could not load vulnerability details. Invalid data received.</p></body></html>`;
     }

    // --- Extract common data ---
    // vulnerabilityObject.vulnerability holds the metadata (VulnerabilityMetadataDto or VulnerabilityScaMetadataDto)
    const commonMetadata = vulnerabilityObject.vulnerability;
    const title = escape(commonMetadata.name || vulnerabilityObject.id || 'Unknown Vulnerability');
    const severity = escape(vulnerabilityObject.currentSeverity || 'UNKNOWN');
    const description = escape(commonMetadata.description || 'No description available.');
    const recommendation = escape(commonMetadata.howToPrevent || 'No recommendation available.');
    // Use 'id' from metadata for Rule ID (common) or 'cve' for SCA if available
    const ruleOrCveId = escape( (commonMetadata as VulnerabilityScaMetadataDto).cve || commonMetadata.id || 'N/A');
    const detectionId = escape(vulnerabilityObject.id); // ID of the specific finding
    const currentState = escape(vulnerabilityObject.currentState || 'N/A');
    const currentPriority = escape(vulnerabilityObject.currentPriority || 'N/A');
    const createdAt = new Date(vulnerabilityObject.createdAt).toLocaleString();
    const updatedAt = new Date(vulnerabilityObject.updateAt).toLocaleString();
    const severityClass = _getSeverityClass(vulnerabilityObject.currentSeverity); // Use helper
    const currentVulnType = commonMetadata.vulnerabilityType as ScanType | undefined; // 'sast', 'iac', 'sca'

    let filePath = 'N/A';
    let lineNumber = 0;
    let specificDetailsHtml = '';
    let codeSnippetsHtml = ''; // To be populated by helper
    let historyHtml = _generateHistoryHtml(vulnerabilityObject.historyItems); // Use helper

    // --- Generate HTML specific to the vulnerability type ---
    // We use the type guards defined earlier, operating on ApiVulnerabilityType
    if (isSastVulnerability(vulnerabilityObject)) {
        // Type is narrowed to VulnerabilitySastDto (the class)
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        specificDetailsHtml = `
            <div class="section">
                <div class="section-title">Data Flow</div>
                ${_generateDataFlowHtml(vulnerabilityObject.dataFlowItems)}
            </div>
            <div class="section">
                <div class="section-title">Contextual Explanation</div>
                <div>${escape(vulnerabilityObject.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
            <div class="section">
                 <div class="section-title">Language</div>
                 <code>${escape(vulnerabilityObject.language || 'N/A')}</code>
            </div>
        `;
        // Use the helper to generate code snippets HTML
        codeSnippetsHtml = _generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets);

    } else if (isIacVulnerability(vulnerabilityObject)) {
        // Type is narrowed to VulnerabilityIacDto (the class)
        filePath = vulnerabilityObject.path || '';
        lineNumber = vulnerabilityObject.vulnerableStartLine || 0;
        // Access scannerType using assertion if needed, assuming it exists based on runtime checks/API contract
        const scannerType = (vulnerabilityObject as any).scannerType || 'N/A'; // Using 'any' for simplicity here

        specificDetailsHtml = `
            <div class="section">
                <div class="section-title">Contextual Explanation</div>
                <div>${escape(vulnerabilityObject.contextualExplanation || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
             <div class="section">
                  <div class="section-title">Scanner Type</div>
                  <code>${escape(scannerType)}</code>
             </div>
             <div class="section">
                  <div class="section-title">Language</div>
                  <code>${escape(vulnerabilityObject.language || 'N/A')}</code>
             </div>
        `;
        // Use the helper to generate code snippets HTML
        codeSnippetsHtml = _generateCodeSnippetsHtml(vulnerabilityObject.codeSnippets);

    } else if (isScaVulnerability(vulnerabilityObject)) {
        // Type is narrowed to VulnerabilityScaDto (the class)
        // This class *does* declare 'package', 'vulnerability' (as ScaMetadata), and 'cvssScore'

         // Use type assertion to help TypeScript understand the narrowed type
        const scaVuln = vulnerabilityObject as VulnerabilityScaDto;

        // Access properties safely via the narrowed type
        const scaPackage = scaVuln.package; // Type ScaDetectedLibraryDto | undefined
        const scaMetadata = scaVuln.vulnerability; // Type VulnerabilityScaMetadataDto
        const cvssScore = scaVuln.cvssScore; // Type number | undefined

        filePath = scaPackage?.fileName || ''; // Use 'package' property
        lineNumber = 0; // No specific line number for SCA package vulnerability

        specificDetailsHtml = `
            <div class="section">
                <div class="section-title">Package Details</div>
                <div><strong>Name:</strong> ${escape(scaPackage?.packageName || 'N/A')}</div>
                <div><strong>Version:</strong> ${escape(scaPackage?.packageVersion || 'N/A')}</div>
                <div><strong>Ecosystem:</strong> ${escape(scaPackage?.ecosystem || 'N/A')}</div>
                ${cvssScore !== undefined ? `<div><strong>CVSS Score:</strong> ${cvssScore}</div>` : ''}
            </div>
            <div class="section">
                 <div class="section-title">Identifiers & References</div>
                 <div><strong>CVE:</strong> ${escape(scaMetadata.cve || 'N/A')}</div>
                 <div><strong>Internal ID:</strong> ${escape(scaMetadata.internalId || 'N/A')}</div>
                 ${_generateScaReferencesHtml(scaMetadata.references)}
            </div>
            <div class="section">
                <div class="section-title">SCA Summary</div>
                <div>${escape(scaMetadata.summary || 'N/A').replace(/\n/g, '<br>')}</div>
            </div>
        `;
        codeSnippetsHtml = ''; // No code snippets for SCA findings

    } else {
        // Fallback for unknown or unidentifiable type
        console.warn("Could not determine vulnerability type for details view:", vulnerabilityObject);
        specificDetailsHtml = `<div class="section"><div class="section-title">Details</div><div>Could not determine vulnerability type. Please check API response structure. Type received: ${commonMetadata.vulnerabilityType}</div></div>`;
        // Keep severityClass as calculated earlier
    }

    // Get URIs for assets
    const codiconsUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.css']);
    const codiconsFontUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.ttf']);

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
             /* Import Codicons font */
             @font-face {
                 font-family: 'codicon';
                 src: url('${codiconsFontUri}') format('truetype');
             }
            body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 20px; font-size: var(--vscode-font-size); }
            h1 { color: var(--vscode-editor-foreground); border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 15px; font-size: 1.4em; }
            .section { margin-bottom: 20px; }
            .section-title { font-weight: bold; margin-bottom: 8px; font-size: 1.1em; color:rgb(120, 69, 255); }

            /* Severity Badges */
            .severity { display: inline-block; padding: 3px 10px; border-radius: 15px; font-weight: bold; color: white; margin-bottom: 15px; font-size: .9em; text-transform: uppercase; }
            .severity-critical { background-color: var(--vscode-errorForeground); }
            .severity-high { background-color: var(--vscode-errorForeground); opacity: 0.85; }
            .severity-medium { background-color: #FFA500; } /* Orange */
            .severity-low { background-color: var(--vscode-charts-blue); } /* Using charts blue for Low */
            .severity-info { background-color: var(--vscode-textSeparator-foreground); } /* Neutral grey */
            .severity-unknown { background-color: var(--vscode-disabledForeground); }

            /* Location Link */
            .location { background-color: var(--vscode-textCodeBlock-background); padding: 8px; border-radius: 4px; margin-bottom: 5px; }
            .location code { font-family: var(--vscode-editor-font-family); background-color: transparent; padding: 0; }
            .location-link { color:rgb(120, 69, 255); text-decoration: none; cursor: pointer; }
            .location-link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }

            /* Code Blocks & Snippets */
            pre { background-color: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; overflow-x: auto; white-space: pre; word-wrap: normal; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
            code { font-family: var(--vscode-editor-font-family); background-color: var(--vscode-textCodeBlock-background); padding: .2em .4em; border-radius: 3px; }
            .line-number { display: inline-block; width: 3.5em; padding-right: 1em; text-align: right; color: var(--vscode-editorLineNumber-foreground); user-select: none; }

             /* Grid Layout for Metadata */
            .grid-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px; }
            .grid-item { background-color: var(--vscode-sideBar-background); padding: 10px; border-radius: 4px; font-size: 0.95em; border: 1px solid var(--vscode-panel-border); }
            .grid-item strong { display: block; margin-bottom: 5px; color:rgb(120, 69, 255); font-weight: bold; }
            .grid-item code { font-size: 0.9em; }

             /* Data Flow, History, Code Snippets Items */
            .data-flow-item, .history-item, .code-snippet { margin-bottom: 10px; padding: 10px; background-color: var(--vscode-input-background); border-radius: 4px; border-left: 3px solidrgb(120, 69, 255); }
            .data-flow-item strong, .history-item strong { display: block; margin-bottom: 4px; color: var(--vscode-editor-foreground); font-weight: bold; }
            .data-flow-item code { display: block; background-color: var(--vscode-textCodeBlock-background); padding: 5px; margin-top: 5px; border-radius: 3px; white-space: pre; }
            .history-item small { color: var(--vscode-descriptionForeground); }
             ul { padding-left: 20px; margin-top: 5px; }
             li { margin-bottom: 5px; }
             a { color:rgb(120, 69, 255); text-decoration: none; }
             a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
             .codicon { vertical-align: middle; margin-right: 4px; }
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
            <div>${description.replace(/\n/g, '<br>')}</div>
        </div>

        ${specificDetailsHtml}
        ${codeSnippetsHtml}

        <div class="section">
            <div class="section-title"><span class="codicon codicon-lightbulb"></span> Recommendation</div>
            <div>${recommendation.replace(/\n/g, '<br>')}</div>
        </div>

        ${historyHtml}

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            // Pass necessary info for opening file to the script
            const filePathForScript = ${JSON.stringify(filePath)}; // Ensure path is correctly JSON stringified
            const lineNumberForScript = ${lineNumber}; // Number, no quotes needed
            const vulnerabilityType = '${currentVulnType || ''}'; // String

            document.querySelectorAll('.location-link').forEach(link => {
                link.addEventListener('click', event => {
                    event.preventDefault();
                    // Use the variables defined above
                    const targetPath = filePathForScript;
                    const targetLine = lineNumberForScript;

                    // Check if path is valid and if line number is needed (not for SCA summary link)
                    if (targetPath && targetPath !== 'N/A' && (targetLine > 0 || vulnerabilityType !== 'sca')) {
                         vscode.postMessage({
                            command: 'triggerOpenFile',
                            filePath: targetPath,
                            lineNumber: targetLine > 0 ? targetLine : 1 // Default to line 1 if 0
                        });
                    } else if (targetPath && targetPath !== 'N/A' && vulnerabilityType === 'sca') {
                         // For SCA, open the manifest file without a specific line if line is 0
                         vscode.postMessage({
                            command: 'triggerOpenFile',
                            filePath: targetPath,
                            lineNumber: 1 // Open at the top
                        });
                    } else {
                        console.warn("Open file link clicked, but path/line invalid or not applicable.", { targetPath, targetLine, vulnerabilityType });
                    }
                });
            });
        </script>
    </body>
    </html>`;
}


/**
 * Generates the HTML content for the Summary webview view.
 * @param summaryData Current summary state data.
 * @param webview The webview instance.
 * @param extensionUri The extension's URI.
 */
export function getSummaryViewHtml(
    summaryData: {
        total?: number;
        counts?: CountVulnerabilitiesCountByType;
        scanInfo?: ScanProjectInfoDto;
        error?: string | null;
        isLoading?: boolean;
        isReady?: boolean;
        noWorkspace?: boolean;
        statusMessage?: string; // Message pendant le chargement/scan
    },
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    // Icons
    const loadingIcon = `<span class="codicon codicon-loading codicon-modifier-spin"></span>`;
    const errorIcon = `<span class="codicon codicon-error"></span>`;
    const readyIcon = `<span class="codicon codicon-info"></span>`;
    const checkIcon = `<span class="codicon codicon-check"></span>`;
    const playIcon = `<span class="codicon codicon-play"></span>`;
    const folderIcon = `<span class="codicon codicon-folder"></span>`;
    const shieldIcon = `<span class="codicon codicon-shield"></span>`;

    let contentHtml = '';

    // --- Determine content based on state ---
    if (summaryData.isLoading) {
        // **MODIFICATION: Improved Loading State**
        contentHtml = `
            <div class="loading-container">
                <p>${loadingIcon}</p>
                <p>CybeDefend is scanning for issues...</p>
                <p><small>${escape(summaryData.statusMessage || 'Please wait...')}</small></p>
            </div>
        `;
    } else if (summaryData.error) {
        contentHtml = `<p>${errorIcon} Scan Failed: ${escape(summaryData.error)}</p>`;
    } else if (summaryData.noWorkspace) {
        contentHtml = `
            <p>${readyIcon} Please select a project folder to scan.</p>
            <button id="select-folder-button">${folderIcon} Select Folder</button>
        `;
    } else if (summaryData.isReady) {
        contentHtml = `<p>${readyIcon} Ready to scan. Use the ${playIcon} button above.</p>`;
    } else if (summaryData.scanInfo || typeof summaryData.total === 'number') {
        // **MODIFICATION: Improved Results State**
        const total = summaryData.total ?? 0;
        const counts = summaryData.counts;
        const scanDate = summaryData.scanInfo?.createAt ? `on ${new Date(summaryData.scanInfo.createAt).toLocaleString()}` : '';
        const status = summaryData.scanInfo?.state?.toUpperCase() || (total === 0 ? 'COMPLETED' : 'COMPLETED');

        contentHtml = `
            <div class="summary-header">
                ${shieldIcon} <h4>CybeDefend found the following issues:</h4>
                <div class="total-count-badge" title="Total Vulnerabilities Found">
                     <span class="codicon codicon-bug"></span> ${total}
                </div>
            </div>
            <div class="scan-details">
                <p><small>Status: ${escape(status)} ${escape(scanDate)}</small></p>
                 ${counts ? `
                     <ul class="counts-list">
                         <li>SAST: ${counts.sast}</li>
                         <li>IaC: ${counts.iac}</li>
                         <li>SCA: ${counts.sca}</li>
                     </ul>
                 ` : ''}
                ${total === 0 && status.includes('COMPLETED') ? `<p>${checkIcon} No vulnerabilities found in the last scan.</p>` : ''}
             </div>
        `;
    } else {
        contentHtml = `<p>${readyIcon} Initializing scanner...</p>`;
    }

    // Get URIs for assets
    const codiconsUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.css']);
    const codiconsFontUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.ttf']);

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>Scan Summary</title>
        <style>
             @font-face { font-family: 'codicon'; src: url('${codiconsFontUri}') format('truetype'); }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 15px; /* Increased padding */
                line-height: 1.6;
                font-size: var(--vscode-font-size);
            }
            h4 { margin: 0 0 10px 0; font-weight: bold; display: inline-block; vertical-align: middle; }
            ul.counts-list { list-style: none; padding: 0; margin: 5px 0 10px 5px; font-size: 0.95em; }
            li { margin-bottom: 2px; color: var(--vscode-descriptionForeground); }
            p { margin: 5px 0; }
            button {
                 background-color: var(--vscode-button-background);
                 color: var(--vscode-button-foreground);
                 border: 1px solid var(--vscode-button-border);
                 padding: 6px 10px; border-radius: 3px; cursor: pointer; /* Slightly rounded */
                 margin-top: 10px;
                 display: inline-flex; /* Use inline-flex */
                 align-items: center;
                 gap: 5px;
            }
             button:hover { background-color: var(--vscode-button-hoverBackground); }
            .codicon { vertical-align: middle; }

            /* ** MODIFICATION: Loading State Style ** */
            .loading-container {
                 text-align: center;
                 padding: 20px;
                 display: flex;
                 flex-direction: column;
                 align-items: center;
                 justify-content: center;
                 height: 100%; /* Try to fill height */
            }
             .loading-container .codicon-loading {
                 font-size: 2.5em; /* Larger loader */
                 margin-bottom: 15px;
                 color:rgb(120, 69, 255); /* Use accent color */
             }
             .loading-container p {
                 margin-bottom: 5px;
             }
             .loading-container p small {
                 color: var(--vscode-descriptionForeground);
             }

            /* ** MODIFICATION: Results State Style ** */
             .summary-header {
                 display: flex;
                 align-items: center;
                 gap: 10px;
                 margin-bottom: 15px;
                 padding-bottom: 10px;
                 border-bottom: 1px solid var(--vscode-panel-border);
             }
             .summary-header .codicon-shield {
                 font-size: 1.5em;
                 color:rgb(120, 69, 255);
             }
             .total-count-badge {
                 display: inline-flex;
                 align-items: center;
                 gap: 5px;
                 background-color: var(--vscode-badge-background);
                 color: var(--vscode-badge-foreground);
                 padding: 4px 8px;
                 border-radius: 15px; /* Pill shape */
                 font-weight: bold;
                 font-size: 0.9em;
                 margin-left: auto; /* Push badge to the right */
             }
             .total-count-badge .codicon-bug {
                 font-size: 1.1em;
             }

             .scan-details {
                 padding-left: 5px; /* Slight indent for details */
             }
             .scan-details p small {
                 color: var(--vscode-descriptionForeground);
             }


            @keyframes codicon-spin { 100% { transform: rotate(360deg); } }
            .codicon-loading.codicon-modifier-spin { animation: codicon-spin 1.5s infinite linear; }
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


/** Generates HTML for the Findings Webview View (SAST, IAC, SCA). */
export function getFindingsViewHtml(
    findings: DetailedVulnerability[], // Use the Union type from details/index.ts
    scanType: ScanType,
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    let findingsHtml = '';
    const findingsCount = findings?.length ?? 0; // Calculate count safely

    // Get URIs for assets (Codicons)
    const codiconsUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.css']);
    const codiconsFontUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.ttf']);

    // --- Build Findings List ---
    if (findingsCount === 0) {
        findingsHtml = '<p class="no-findings">No findings of this type were detected in the last scan.</p>';
    } else {
        const listItems = findings.map(vuln => {
            // Ensure vuln and vuln.vulnerability exist before accessing properties
            if (!vuln || !vuln.vulnerability) {
                 console.warn("Skipping rendering finding due to missing data:", vuln);
                 return ''; // Skip rendering this item
             }

            const severity = vuln.currentSeverity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN;
            // **MODIFICATION: Use updated severityToIconMap for potentially better icons**
            const iconId = severityToIconMap[severity] || 'question'; // Default icon
            const severityClass = _getSeverityClass(severity).replace('severity-', 'color-'); // Use severity class for color var

            // Access metadata safely
            const meta = vuln.vulnerability;
            const title = escape(meta.name || vuln.id); // Use finding ID as fallback title
            let location = '';

            // Determine location based on type (using structure checks)
             if (vuln.vulnerability.vulnerabilityType === 'sast' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                 const sastVuln = vuln as SastVulnerabilityDetectionDto;
                 location = `${escape(sastVuln.path?.split(/[\\/]/).pop() || sastVuln.path || '?')}:${sastVuln.vulnerableStartLine ?? 'N/A'}`;
             } else if (vuln.vulnerability.vulnerabilityType === 'iac' && 'path' in vuln && 'vulnerableStartLine' in vuln) {
                 const iacVuln = vuln as IacVulnerabilityDetectionDto;
                 location = `${escape(iacVuln.path?.split(/[\\/]/).pop() || iacVuln.path || '?')}:${iacVuln.vulnerableStartLine ?? 'N/A'}`;
             } else if (vuln.vulnerability.vulnerabilityType === 'sca' && 'scaDetectedPackage' in vuln) {
                 const scaVuln = vuln as ScaVulnerabilityWithCvssDto;
                 location = `${escape(scaVuln.scaDetectedPackage?.packageName || '?')} ${escape(scaVuln.scaDetectedPackage?.packageVersion || '?')}`;
             } else {
                 location = 'Location N/A';
             }

            // Encode data for message passing
            let vulnDataString = '';
             try {
                 vulnDataString = escape(JSON.stringify(vuln));
             } catch(e) {
                 console.error("Failed to stringify vulnerability data for list item:", e, vuln.id);
                 vulnDataString = escape(JSON.stringify({ id: vuln.id, error: 'Data too complex' }));
             }

            // **MODIFICATION: Ensure icon is clearly on the left**
            return `
                <li class="finding-item" data-vulnerability='${vulnDataString}' data-scan-type='${scanType}' title="${escape(vuln.id)} - Click for details" tabindex="0">
                    <span class="codicon codicon-${iconId} severity-icon ${severityClass}" aria-label="Severity: ${severity}"></span>
                    <div class="finding-details">
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
             @font-face { font-family: 'codicon'; src: url('${codiconsFontUri}') format('truetype'); }

            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                padding: 0 5px 5px 5px; /* Adjust padding */
                font-size: var(--vscode-font-size);
            }

             /* ** MODIFICATION: Findings Count Header ** */
             .findings-header {
                 padding: 8px 10px;
                 font-weight: bold;
                 color: var(--vscode-sideBarTitle-foreground); /* Use title color */
                 background-color: var(--vscode-sideBar-background); /* Match sidebar bg */
                 border-bottom: 1px solid var(--vscode-panel-border);
                 position: sticky; /* Keep header visible */
                 top: 0;
                 z-index: 1;
             }

             /* Findings List */
            ul.findings-list {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            li.finding-item {
                padding: 6px 8px; /* Slightly more padding */
                margin-bottom: 2px;
                border-radius: 3px;
                cursor: pointer;
                display: flex;
                align-items: center; /* Vertically center icon and text */
                gap: 8px;
                border: 1px solid transparent;
            }
            li.finding-item:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            li.finding-item:focus { /* Focus style for accessibility */
                 outline: 1px solid var(--vscode-focusBorder);
                 background-color: var(--vscode-list-focusBackground);
            }

            /* ** MODIFICATION: Icon Styling ** */
            .severity-icon {
                 flex-shrink: 0; /* Prevent icon from shrinking */
                 font-size: 1.2em; /* Slightly larger icon */
            }

             .finding-details {
                 flex-grow: 1;
                 overflow: hidden; /* Prevent text overflow */
                 display: flex;
                 flex-direction: column; /* Stack title and location */
             }

            .finding-title {
                font-weight: normal;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                display: block; /* Ensure it takes full width */
            }
            .finding-location {
                font-size: 0.9em;
                color: var(--vscode-descriptionForeground);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                display: block; /* Ensure it takes full width */
            }
            p.no-findings {
                 padding: 15px; /* More padding */
                 text-align: center;
                 color: var(--vscode-descriptionForeground);
             }

            /* Define color variables for severity icons */
             /* These map severity classes to actual colors */
             .color-critical { color: var(--vscode-errorForeground); }
             .color-high { color: #E17D3A; } /* Orange-Red for High */
             .color-medium { color: var(--vscode-testing-iconQueued); } /* Yellow/Gold */
             .color-low { color: var(--vscode-testing-iconSkipped); } /* Blueish */
             .color-info { color: var(--vscode-descriptionForeground); }
             .color-unknown { color: var(--vscode-disabledForeground); }
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
                 item.setAttribute('tabindex', '0'); // Already present, ensure it's there

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
                            console.error("Failed to parse vulnerability data:", e, "Raw data:", item.getAttribute('data-vulnerability'));
                         }
                    } else {
                         console.warn("Missing data attributes on list item for triggering details.");
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