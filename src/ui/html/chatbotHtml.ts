// src/ui/html/chatbotHtml.ts
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
// lodash escape est toujours utile ici pour échapper les données *avant* injection dans JSON
import { escape } from 'lodash';
import { MessageDto } from '../../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../../dtos/result/details';
import { getNonce } from '../../utilities/utils';
import { getCodiconStyleSheet, getCommonAssetUris } from './commonHtmlUtils';

/**
 * Represents the full state received from the ChatbotViewProvider.
 * Matches the InternalProviderState interface in the provider.
 */
export interface ProviderState {
    messages: MessageDto[];
    isLoading: boolean;
    isVulnListLoading: boolean;
    error: string | null;
    vulnerabilities: DetailedVulnerability[]; // Full list from provider
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null;
}

/**
 * Simplified vulnerability information prepared for the dropdown list in the webview.
 * Contains escaped HTML data.
 */
export interface VulnerabilityInfoForWebview {
    id: string;
    name: string; // Already HTML-escaped
    type: 'sast' | 'iac' | 'sca';
    fullPath: string; // Already HTML-escaped
    shortPath: string; // Already HTML-escaped
}

/**
 * Structure of the state prepared for initial injection into the webview's JavaScript.
 * Contains data ready for the JS environment.
 */
interface WebviewStateForJs {
    messages: MessageDto[]; // Raw messages, JS will format/escape content for display
    isLoading: boolean;
    isVulnListLoading: boolean;
    error: string | null; // Error message already HTML-escaped
    /** Simplified and escaped list for the dropdown */
    vulnerabilities: VulnerabilityInfoForWebview[];
    /** ID of the initially selected vulnerability */
    selectedVulnerabilityId: string | null;
    conversationId: string | null;
    projectId: string | null;
    // Note: vulnerabilitiesFull is injected separately as fullVulnerabilitiesDataJson
}

/**
 * Escapes special HTML characters in a string for safe rendering in the webview.
 * Uses lodash.escape on the extension side (Node.js context).
 * @param unsafe - The potentially unsafe string.
 * @returns The HTML-escaped string, or an empty string if input is not a string.
 */
function escapeHtmlForExtension(unsafe: string | undefined | null): string {
    if (typeof unsafe !== 'string') { return ''; }
    return escape(unsafe); // Utilise lodash.escape
}

/**
 * Generates the complete HTML content for the Chatbot webview by reading partial files
 * and injecting dynamic data.
 *
 * @param webview - The VS Code webview instance.
 * @param extensionUri - The URI of the extension's installation path.
 * @param state - The current state from the provider (`ProviderState`).
 * @returns The HTML string for the webview, or an error string if files cannot be read.
 */
export function getChatbotHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    state: ProviderState
): string {
    try {
        const nonce = getNonce();

        const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);

        // Get URIs for external libraries, ensuring they use the webview's scheme
        const markedScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'libs', 'marked.min.js')
        );
        const dompurifyScriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'dist', 'libs', 'purify.min.js')
        );

        // --- Define Paths to Partial Files ---
        // Assumes these files are relative to the extension's root directory
        // Adjust the path based on your actual project structure and build output
        const htmlTemplatePath = vscode.Uri.joinPath(extensionUri, 'dist', 'ui', 'html', 'partials', 'chatbot.template.html').fsPath;
        const cssPath = vscode.Uri.joinPath(extensionUri, 'dist', 'ui', 'html', 'partials', 'chatbot.css').fsPath;
        const jsPath = vscode.Uri.joinPath(extensionUri, 'dist', 'ui', 'html', 'partials', 'chatbot.js').fsPath;

        // --- Read File Contents ---
        let htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');
        let cssContent = fs.readFileSync(cssPath, 'utf8');
        let jsContent = fs.readFileSync(jsPath, 'utf8');

        // --- Prepare Dynamic Data for Injection ---

        // 1. Codicon Styles: Get the actual font styles
        const codiconsCss = getCodiconStyleSheet(codiconsFontUri);
        // Inject codicon font styles into the main CSS content
        cssContent = `${codiconsCss}\n\n${cssContent}`;

        // 2. Content Security Policy - CORRECTED (using unsafe-inline for styles temporarily, nonce removed from style-src)
        const cspPolicy = `
    default-src 'none';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
    img-src ${webview.cspSource} https: data:;
    script-src 'nonce-${nonce}' ${webview.cspSource};
    connect-src http://localhost:3000;
`.replace(/\s{2,}/g, ' ').trim(); // Keep connect-src as it was

        // 3. Prepare Initial State JSON for JS injection
        //    (Same logic as before to prepare the state object)
        const initialVulnListForJs: VulnerabilityInfoForWebview[] = (state.vulnerabilities || [])
            .filter(v => v?.vulnerability?.vulnerabilityType === 'sast' || v?.vulnerability?.vulnerabilityType === 'iac' || v?.vulnerability?.vulnerabilityType === 'sca')
            .map(vuln => {
                let fullPath = '';
                if (vuln && typeof vuln === 'object' && 'path' in vuln && vuln.path) {
                    fullPath = vuln.path;
                }
                // Note: path.basename might not be available if running in a pure web worker context later,
                // but it's fine in the main extension process here.
                const shortPath = fullPath ? path.basename(fullPath) : '(path unknown)';
                return {
                    id: vuln.id,
                    name: escapeHtmlForExtension(vuln.vulnerability?.name || vuln.id), // Escape here
                    type: vuln.vulnerability.vulnerabilityType as 'sast' | 'iac' | 'sca',
                    fullPath: escapeHtmlForExtension(fullPath), // Escape here
                    shortPath: escapeHtmlForExtension(shortPath) // Escape here
                };
            });

        const initialStateForJs = {
            messages: state.messages.map(m => ({ ...m, content: m.content || '' })),
            isLoading: state.isLoading,
            isVulnListLoading: state.isVulnListLoading,
            error: state.error ? escapeHtmlForExtension(state.error) : null, // Escape error
            vulnerabilities: initialVulnListForJs, // Simplified & escaped list
            selectedVulnerabilityId: state.selectedVulnerability?.id || null,
            conversationId: state.conversationId,
            projectId: state.projectId
        };

        const initialStateJsonString = JSON.stringify(JSON.stringify(initialStateForJs));
        const fullVulnerabilitiesDataJsonString = JSON.stringify(JSON.stringify(state.vulnerabilities || []));

        // --- Inject Data into HTML Template ---
        htmlTemplate = htmlTemplate
            .replace(/{{cspPolicy}}/g, cspPolicy)
            .replace(/{{codiconsUri}}/g, codiconsUri.toString()) // Ensure URI is string
            .replace(/{{nonce}}/g, nonce)
            .replace(/{{styles}}/g, cssContent) // Inject all CSS
            .replace(/{{markedScriptUri}}/g, markedScriptUri.toString())
            .replace(/{{dompurifyScriptUri}}/g, dompurifyScriptUri.toString())
            .replace("'{{initialStateJson}}'", initialStateJsonString)
            .replace("'{{fullVulnerabilitiesDataJson}}'", fullVulnerabilitiesDataJsonString)
            // Inject the main JS code
            .replace(/{{script}}/g, jsContent);

        return htmlTemplate;

    } catch (error: any) {
        console.error("Error generating chatbot HTML:", error);
        // Return a fallback error message HTML
        return `
            <!DOCTYPE html><html><body>
            <h1>Error loading Chatbot</h1>
            <p>Could not load the necessary files. Please check the extension installation and logs.</p>
            <pre>${escapeHtmlForExtension(error.message)}</pre>
            </body></html>`;
    }
}