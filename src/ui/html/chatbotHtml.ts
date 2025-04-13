// src/ui/html/chatbotHtml.ts
import * as vscode from 'vscode';
// lodash escape est utilisé seulement ici, dans la partie Node.js
import { escape } from 'lodash';
import { getNonce } from '../../utilities/utils'; // Adjust path if needed
import { MessageDto } from '../../dtos/ai/response/message.dto'; // Adjust path if needed
import { DetailedVulnerability } from '../../dtos/result/details'; // Adjust path if needed
import { getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils'; // Adjust path if needed
import path from 'path'; // Seulement utilisé ici pour basename

/**
 * State structure expected by the chatbot webview HTML.
 */
interface WebviewState {
    messages: MessageDto[];
    isLoading: boolean;
    isVulnListLoading: boolean;
    error: string | null;
    vulnerabilities: DetailedVulnerability[];
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null;
}

/**
 * State structure attendue par le script JS de la webview.
 * Contient des données préparées et échappées.
 */
interface WebviewStateForJs {
    messages: MessageDto[]; // Contenu brut, sera échappé/formaté par JS
    isLoading: boolean;
    isVulnListLoading: boolean;
    error: string | null; // Déjà échappé
    vulnerabilities: VulnerabilityInfoForWebview[]; // Liste simplifiée et échappée
    selectedVulnerabilityId: string | null;
    conversationId: string | null;
    projectId: string | null;
}

/**
 * Données simplifiées pour la liste déroulante des vulnérabilités.
 */
interface VulnerabilityInfoForWebview {
    id: string;
    name: string; // Already escaped
    type: 'sast' | 'iac';
    fullPath: string; // Already escaped
    shortPath: string; // Already escaped
}

/**
 * Helper pour échapper le HTML (version pour le contexte Node.js).
 */
function escapeHtmlForExtension(unsafe: string | undefined | null): string {
    if (typeof unsafe !== 'string') return '';
    // Utiliser lodash ici car disponible côté extension
    return escape(unsafe);
}


/**
 * Generates the HTML content for the Chatbot webview view.
 *
 * @param webview - The webview instance.
 * @param extensionUri - The URI of the extension installation path.
 * @param state - The current state from the provider (contient les objets DetailedVulnerability complets).
 * @returns The HTML string for the webview.
 */
export function getChatbotHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    state: WebviewState // Reçoit l'état complet du provider
): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);

    // --- Préparer l'état initial pour le script JS ---
    const initialVulnListForJs: VulnerabilityInfoForWebview[] = state.vulnerabilities
        .filter((v: DetailedVulnerability) => v.vulnerability?.vulnerabilityType === 'sast' || v.vulnerability?.vulnerabilityType === 'iac')
        .map((vuln: DetailedVulnerability) => {
            let fullPath = '';
            if ('path' in vuln && vuln.path) fullPath = vuln.path;
            const shortPath = fullPath ? path.basename(fullPath) : '(path unknown)';
             return {
                 id: vuln.id,
                 name: escapeHtmlForExtension(vuln.vulnerability?.name || vuln.id), // Echapement ici
                 type: vuln.vulnerability.vulnerabilityType as 'sast' | 'iac',
                 fullPath: escapeHtmlForExtension(fullPath), // Echapement ici
                 shortPath: escapeHtmlForExtension(shortPath) // Echapement ici
             };
        });

     // Construire l'état à injecter dans le script JS
     const initialStateForJs: WebviewStateForJs = {
         // Cloner les messages pour éviter les références partagées
         messages: state.messages.map((m: MessageDto) => ({...m, content: m.content || ''})),
         isLoading: state.isLoading,
         isVulnListLoading: state.isVulnListLoading,
         error: state.error ? escapeHtmlForExtension(state.error) : null, // Echapement ici
         vulnerabilities: initialVulnListForJs, // Utiliser la liste préparée
         selectedVulnerabilityId: state.selectedVulnerability?.id || null,
         conversationId: state.conversationId,
         projectId: state.projectId
     };
     // Stocker également les données complètes séparément pour le script JS (nécessaire pour `sendMessage`)
     const fullVulnerabilitiesDataJson = JSON.stringify(state.vulnerabilities || [])
         .replace(/\\/g, '\\\\') // Echapement des backslashes pour JS
         .replace(/'/g, "\\'") // Echapement des apostrophes pour JS
         .replace(/`/g, "\\`"); // Echapement des backticks pour JS (sécurité)

     const initialStateJson = JSON.stringify(initialStateForJs)
         .replace(/\\/g, '\\\\')
         .replace(/'/g, "\\'")
         .replace(/`/g, "\\`");

     // Create script section with the regex code
     const scriptSection = `
<script nonce="${nonce}">
    (function() {
        const vscode = acquireVsCodeApi();
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const messagesDiv = document.getElementById('messages');
        const vulnSelect = document.getElementById('vuln-select');
        const vulnSelectorDiv = document.getElementById('vuln-selector');

        // Initialiser l'état local JS
        let currentState = {};
        let fullVulnerabilitiesData = []; // Pour stocker les objets complets
        try {
             // Parser l'état initial injecté par le provider
             currentState = JSON.parse('${initialStateJson}');
             // Stocker les données complètes (si envoyées par le provider)
             fullVulnerabilitiesData = JSON.parse('${fullVulnerabilitiesDataJson}');
             console.log('[ChatbotView] Initial state parsed:', currentState);
         } catch (e) {
             console.error("Error parsing initial state:", e);
             currentState = { messages: [], isLoading: false, isVulnListLoading: false, error: "Failed to load initial state", vulnerabilities: [], selectedVulnerabilityId: null, conversationId: null, projectId: null };
         }
        // La liste simplifiée pour l'affichage est dans currentState.vulnerabilities

        // --- Helper Functions ---
        function scrollToBottom() { if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight; }

        function escapeHtml(unsafe) {
             if (typeof unsafe !== 'string') return '';
             return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function formatMessageContent(rawContent) {
            let formatted = escapeHtml(rawContent || '');
            try {
                 // Fenced code blocks - using regex literals with Unicode escape sequences
                 formatted = formatted.replace(
                    /\\u0060\\u0060\\u0060(\\w*)\\n?([\\s\\S]*?)\\n?\\u0060\\u0060\\u0060/g,
                    function(match, lang, code) { 
                        return '<pre><code class="language-' + escapeHtml(lang || '') + '">' + escapeHtml(code) + '</code></pre>'; 
                    }
                 );
                 
                 // Inline code - using regex literals with Unicode escape sequence
                 formatted = formatted.replace(
                    /\\u0060([^\\u0060]+)\\u0060/g,
                    function(match, code) { 
                        return '<code>' + escapeHtml(code) + '</code>'; 
                    }
                 );
                 
                 // Newlines - using regex literal
                 formatted = formatted.replace(/\\n/g, '<br>');
            } catch (e) { 
                console.error("Error formatting message content:", e); 
                formatted = escapeHtml(rawContent || '').replace(/\\n/g, '<br>'); 
            }
            return formatted;
        }
`;


    // --- Structure HTML (statique) ---
    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>Security Champion</title>
        <style nonce="${nonce}">
            ${getCodiconStyleSheet(codiconsFontUri)}
            /* Styles (inchangés) */
             :root {
                 --border-color: var(--vscode-panel-border);
                 --input-background: var(--vscode-input-background);
                 --input-border: var(--vscode-input-border);
                 --user-message-bg: var(--vscode-editorWidget-background);
                 --ai-message-bg: var(--vscode-sideBar-background);
                 --selected-vuln-bg: var(--vscode-inputOption-activeBackground);
                 --selected-vuln-fg: var(--vscode-inputOption-activeForeground);
             }
             html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
             body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background-color: var(--vscode-sideBar-background); display: flex; flex-direction: column; font-size: var(--vscode-font-size); }
             #chat-container { display: flex; flex-direction: column; flex-grow: 1; padding: 10px; box-sizing: border-box; gap: 10px; overflow: hidden; }
             #vuln-selector { border: 1px solid var(--border-color); border-radius: 4px; padding: 8px; background-color: var(--vscode-input-background); flex-shrink: 0; max-height: 35%; display: flex; flex-direction: column; gap: 5px; }
             #vuln-selector.hidden { display: none !important; } /* Pour masquer */
             #vuln-selector h4 { margin: 0 0 5px 0; font-size: 0.9em; font-weight: 600; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 5px; }
             #vuln-select { width: 100%; padding: 6px 8px; border: 1px solid var(--input-border); background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border-radius: 4px; font-family: var(--vscode-font-family); font-size: 0.95em; cursor: pointer; }
             #vuln-select:focus { border-color: var(--vscode-focusBorder); outline: none; }
             #vuln-select optgroup { font-weight: bold; font-style: italic; }
             #vuln-select option:disabled { color: var(--vscode-descriptionForeground); font-style: italic; }
             #messages { flex-grow: 1; overflow-y: auto; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background-color: var(--vscode-textBlockQuote-background); margin-bottom: 5px; }
            .message { display: flex; gap: 8px; margin-bottom: 12px; max-width: 95%; }
            .message-icon { font-size: 1.1em; margin-top: 4px; flex-shrink: 0; opacity: 0.8; }
            .message-user { margin-left: auto; flex-direction: row-reverse; }
            .message-ai { margin-right: auto; }
            .message-content { padding: 8px 12px; border-radius: 10px; font-size: 0.95em; line-height: 1.5; word-wrap: break-word; position: relative; }
            .message-user .message-content { background-color: var(--user-message-bg); border-top-right-radius: 2px; }
            .message-ai .message-content { background-color: var(--ai-message-bg); border-top-left-radius: 2px; border: 1px solid var(--vscode-panel-border); }
            .message-timestamp { font-size: 0.7em; color: var(--vscode-descriptionForeground); margin-top: 4px; text-align: right; }
            .message-user .message-timestamp { text-align: left; }
            pre { background-color: rgba(var(--vscode-editor-foreground-rgb), 0.06); padding: 10px; border-radius: 4px; overflow-x: auto; margin: 8px 0; font-family: var(--vscode-editor-font-family); font-size: 0.9em; border: 1px solid var(--vscode-panel-border); }
            pre > code { background-color: transparent !important; padding: 0 !important; font-family: var(--vscode-editor-font-family) !important; font-size: inherit !important; white-space: pre-wrap !important; /* Retour à la ligne dans PRE */ word-wrap: break-word !important; }
            code:not(pre code) { background-color: rgba(var(--vscode-editor-foreground-rgb), 0.08); padding: 1px 4px; border-radius: 3px; font-family: var(--vscode-editor-font-family); }
            #input-area { display: flex; gap: 8px; flex-shrink: 0; border-top: 1px solid var(--border-color); padding-top: 10px; }
            #message-input { flex-grow: 1; padding: 8px 10px; border: 1px solid var(--input-border); background-color: var(--input-background); color: var(--vscode-input-foreground); border-radius: 4px; resize: none; font-family: var(--vscode-font-family); font-size: 1em; line-height: 1.4; }
            #message-input:focus { border-color: var(--vscode-focusBorder); outline: none; }
            #send-button { padding: 0 12px; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border); border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 600; transition: background-color 0.1s ease; flex-shrink: 0; }
            #send-button:hover { background-color: var(--vscode-button-hoverBackground); }
            #send-button:disabled { opacity: 0.5; cursor: not-allowed; }
            #send-button .codicon { font-size: 1.3em; }
            .loading-indicator { text-align: center; padding: 8px; font-style: italic; color: var(--vscode-descriptionForeground); font-size: 0.9em; opacity: 0.8; }
            .error-message { background-color: rgba(var(--vscode-errorForeground-rgb), 0.1); color: var(--vscode-errorForeground); padding: 8px 12px; border-radius: 4px; margin: 5px 0; display: flex; align-items: center; gap: 6px; font-size: 0.9em; border: 1px solid rgba(var(--vscode-errorForeground-rgb), 0.3); }
        </style>
    </head>
    <body>
        <div id="chat-container">
             <div id="vuln-selector" class="hidden">
                 <h4><span class="codicon codicon-link"></span> Link Vulnerability (Optional)</h4>
                 <select id="vuln-select">
                     <!-- Options peuplées par JS -->
                 </select>
             </div>
             <div id="messages">
                 <!-- Contenu initial ajouté par JS -->
             </div>
             <div id="input-area">
                 <textarea id="message-input" rows="2" placeholder="Ask the Security Champion..." maxlength="512"></textarea>
                 <button id="send-button" title="Send Message" disabled>
                     <span class="codicon codicon-send"></span>
                 </button>
             </div>
        </div>

        <!-- Placeholder for script section -->
        ${scriptSection}
        
        <!-- Rest of the script content -->
        /** Render messages in the DOM */
        function renderMessages(messages, isLoading, error) {
             if (!messagesDiv) return;
             messagesDiv.innerHTML = ''; // Clear
             if (!messages?.length && !isLoading && !error) {
                 messagesDiv.innerHTML = '<p style="text-align:center; color: var(--vscode-descriptionForeground);">Ask the Security Champion any security-related question...</p>';
                 return;
             }
             (messages || []).forEach(function(msg) {
                  const msgEl = document.createElement('div');
                  const alignClass = msg.role === 'user' ? 'message-user' : 'message-ai';
                  const icon = msg.role === 'user' ? 'codicon-account' : 'codicon-hubot';
                  const formattedContent = formatMessageContent(msg.content);
                  const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                  const fullTimestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
                  msgEl.className = 'message ' + alignClass;
                  msgEl.innerHTML = '<span class="codicon ' + icon + ' message-icon" title="' + (msg.role === 'user' ? 'You' : 'AI') + '"></span>' +
                                     '<div class="message-content">' +
                                     formattedContent +
                                     '<div class="message-timestamp" title="' + fullTimestamp + '">' + timestamp + '</div>' +
                                     '</div>';
                  messagesDiv.appendChild(msgEl);
              });
             
             if (isLoading) {
                  const loadingEl = document.createElement('div'); 
                  loadingEl.className = 'loading-indicator';
                  loadingEl.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Answering...';
                  messagesDiv.appendChild(loadingEl);
              }
             
             if (error) {
                 const errorEl = document.createElement('div'); 
                 errorEl.className = 'error-message';
                 errorEl.innerHTML = '<span class="codicon codicon-error"></span> ' + escapeHtml(error);
                 messagesDiv.appendChild(errorEl);
              }
             scrollToBottom();
        }

        /** Update vulnerability dropdown options AND visibility */
        function renderVulnSelect(vulnerabilities, selectedVulnId, isVulnListLoading, error, projectId) {
            // vulnerabilities ici est la liste simplifiée {id, name, type, fullPath, shortPath}
            const shouldShowSelector = !isVulnListLoading && vulnerabilities && vulnerabilities.length > 0;

            if (vulnSelectorDiv) {
                vulnSelectorDiv.classList.toggle('hidden', !shouldShowSelector);
            }
            if (!vulnSelect || !shouldShowSelector) {
                 // Si le sélecteur ne doit pas être montré, on s'assure qu'il est vide (sauf l'option par défaut)
                 if(vulnSelect) vulnSelect.innerHTML = '<option value="">Select vulnerability (Optional)...</option>';
                 return; // Pas besoin de peupler
             }

            vulnSelect.innerHTML = ''; // Clear previous

            const defaultOption = document.createElement('option');
            defaultOption.value = ""; 
            defaultOption.textContent = "Select vulnerability (Optional)...";
            vulnSelect.appendChild(defaultOption);

            // Group by type
            const groups = { sast: [], iac: [] };
             (vulnerabilities || []).forEach(function(v) {
                 if (v.type === 'sast') groups.sast.push(v);
                 else if (v.type === 'iac') groups.iac.push(v);
             });

            const createOptionElement = function(vuln) {
                 const option = document.createElement('option');
                 option.value = vuln.id;
                 // name, shortPath, fullPath sont déjà échappés par le provider
                 option.textContent = (vuln.name + ' (' + vuln.shortPath + ')').trim();
                 option.title = vuln.name + ' in ' + (vuln.fullPath || '(path unknown)');
                 return option;
             };

            if (groups.sast.length > 0) {
                const optgroup = document.createElement('optgroup'); 
                optgroup.label = "Code Vulnerabilities (SAST)";
                groups.sast.forEach(function(v) { 
                    optgroup.appendChild(createOptionElement(v)); 
                });
                vulnSelect.appendChild(optgroup);
            }
            if (groups.iac.length > 0) {
                const optgroup = document.createElement('optgroup'); 
                optgroup.label = "Infrastructure Vulnerabilities (IaC)";
                groups.iac.forEach(function(v) { 
                    optgroup.appendChild(createOptionElement(v)); 
                });
                vulnSelect.appendChild(optgroup);
            }
            // Pas besoin de l'option "vide" car on cache tout le sélecteur si vide

            vulnSelect.value = selectedVulnId || ""; // Restore selection
        }

        // --- Event Handlers ---
        function handleSendMessage() {
            const text = messageInput.value.trim();
            if (!text || text.length > 512 || currentState.isLoading) return;

            const selectedId = vulnSelect ? vulnSelect.value : null;
            // Retrouver l'objet *complet* dans les données complètes stockées localement
            const selectedVulnFull = selectedId ? fullVulnerabilitiesData.find(function(v) { return v.id === selectedId; }) : null;

            vscode.postMessage({ command: 'sendMessage', text: text, vulnerability: selectedVulnFull }); // Envoyer l'objet complet trouvé
            messageInput.value = '';
            sendButton.disabled = true;
            if(vulnSelect) vulnSelect.value = "";
            vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: null }); // Notifier désélection
        }

        // --- Initial Setup & Listeners ---
        if (sendButton && messageInput) {
            sendButton.addEventListener('click', handleSendMessage);
            messageInput.addEventListener('keypress', function(e) { 
                if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    handleSendMessage(); 
                } 
            });
            messageInput.addEventListener('input', function() { 
                sendButton.disabled = messageInput.value.trim().length === 0 || currentState.isLoading; 
            });
        }

        if (vulnSelect) {
            vulnSelect.addEventListener('change', function(e) {
                 const selectedId = e.target.value;
                 // Retrouver l'objet complet et le notifier au provider
                 const selectedVulnFull = selectedId ? fullVulnerabilitiesData.find(function(v) { return v.id === selectedId; }) : null;
                 vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: selectedVulnFull });
            });
        }

        // Listener for state updates from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.command === 'updateState') {
                 console.log("[Chatbot Webview] Received state update");
                 currentState = message.state;
                 // Mettre à jour les données locales pour le select et la recherche d'objet complet
                  vulnerabilitiesData = currentState.vulnerabilities || []; // Liste simplifiée/préparée
                  fullVulnerabilitiesData = currentState.vulnerabilitiesFull || []; // Liste complète

                 // Re-render UI
                 renderMessages(currentState.messages, currentState.isLoading, currentState.error);
                 renderVulnSelect(vulnerabilitiesData, currentState.selectedVulnerabilityId, currentState.isVulnListLoading, currentState.error, currentState.projectId);
                 if(sendButton && messageInput) sendButton.disabled = currentState.isLoading || messageInput.value.trim().length === 0;
             }
        });

        // --- Initial Render & Data Request ---
        console.log("[Chatbot Webview] Initializing UI with state:", currentState);
        renderMessages(currentState.messages, currentState.isLoading, currentState.error);
        renderVulnSelect(currentState.vulnerabilities, currentState.selectedVulnerabilityId, currentState.isVulnListLoading, currentState.error, currentState.projectId);
        if(sendButton && messageInput) sendButton.disabled = currentState.isLoading || messageInput.value.trim().length === 0;
        scrollToBottom();

        // Ask provider for initial data if needed (check if vulns are already loaded)
         if (vulnerabilitiesData && vulnerabilitiesData.length === 0 && !currentState.isVulnListLoading && currentState.projectId) {
             console.log("[Chatbot Webview] Requesting initial vulnerability load...");
             vscode.postMessage({ command: 'loadInitialData' });
         }

    }()); // Fin de l'IIFE
</script>
    </body>
    </html>`;

    return html;
}