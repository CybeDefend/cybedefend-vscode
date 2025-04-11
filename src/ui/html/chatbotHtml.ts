// src/ui/html/chatbotHtml.ts
import * as vscode from 'vscode';
import { escape } from 'lodash';
import { getNonce } from '../../utilities/utils';
import { MessageDto } from '../../dtos/ai/response/message.dto';
import { DetailedVulnerability, IacVulnerabilityDetectionDto, SastVulnerabilityDetectionDto } from '../../dtos/result/details';
import { getCommonAssetUris, getCodiconStyleSheet } from './commonHtmlUtils';
import path from 'path';

// Recréer WebviewState ici ou l'importer si défini globalement
interface WebviewState {
    messages: MessageDto[];
    isLoading: boolean;
    error: string | null;
    vulnerabilities: DetailedVulnerability[];
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null; // Ajouter projectId pour l'affichage initial
}

export function getChatbotHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    state: WebviewState
): string {
    const nonce = getNonce();
    const { codiconsUri, codiconsFontUri } = getCommonAssetUris(webview, extensionUri);

    // --- Générer HTML pour la liste des messages ---
    const messagesHtml = state.messages.map(msg => {
        const alignClass = msg.role === 'user' ? 'message-user' : 'message-ai';
        const icon = msg.role === 'user' ? 'codicon-account' : 'codicon-hubot'; // ou codicon-sparkle
        const formattedContent = escape(msg.content)
             .replace(/\n/g, '<br>')
             .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>') // Basic code block handling
             .replace(/`([^`]+)`/g, '<code>$1</code>'); // Basic inline code handling

        return `
            <div class="message ${alignClass}">
                <span class="codicon ${icon} message-icon"></span>
                <div class="message-content">
                    ${formattedContent}
                    <div class="message-timestamp">${new Date(msg.createdAt).toLocaleTimeString()}</div>
                </div>
            </div>
        `;
    }).join('');

    // --- Générer HTML pour la liste des vulnérabilités (simplifié pour l'instant) ---
    const vulnerabilitiesHtml = state.vulnerabilities
        // Double vérification : le provider devrait déjà avoir filtré, mais on assure ici
        .filter(vuln => vuln.vulnerability?.vulnerabilityType === 'sast' || vuln.vulnerability?.vulnerabilityType === 'iac')
        .map(vuln => {
            const isSelected = state.selectedVulnerability?.id === vuln.id;
            let displayPath = '(Path not available)'; // Fallback

            // Le type guard est plus sûr, mais ici on utilise le discriminateur
            if (vuln.vulnerability?.vulnerabilityType === 'sast' && 'path' in vuln) {
                 // On sait que c'est SastVulnerabilityDetectionDto
                 displayPath = (vuln as SastVulnerabilityDetectionDto).path || displayPath;
            } else if (vuln.vulnerability?.vulnerabilityType === 'iac' && 'path' in vuln) {
                 // On sait que c'est IacVulnerabilityDetectionDto
                 displayPath = (vuln as IacVulnerabilityDetectionDto).path || displayPath;
            }

            const shortPath = path.basename(displayPath); // Afficher seulement le nom du fichier

            return `
                <li class="vuln-item ${isSelected ? 'selected' : ''}" data-vuln-id="${vuln.id}" title="${escape(vuln.vulnerability?.name || vuln.id)}\n${escape(displayPath)}" tabindex="0">
                    <span class="vuln-name">${escape(vuln.vulnerability?.name || vuln.id)}</span>
                    <small class="vuln-path">${escape(shortPath)}</small>
                </li>
            `;
    }).join('');

    // --- Statut de chargement ---
    const loadingIndicatorHtml = state.isLoading
        ? `<div class="loading-indicator"><span class="codicon codicon-loading codicon-modifier-spin"></span> Thinking...</div>`
        : '';

    // --- Erreurs ---
     const errorHtml = state.error
         ? `<div class="error-message"><span class="codicon codicon-error"></span> ${escape(state.error)}</div>`
         : '';


    // --- HTML Complet ---
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri}" rel="stylesheet" />
        <title>Security Champion</title>
        <style>
            ${getCodiconStyleSheet(codiconsFontUri)}
             /* Styles de base et "high-tech" pour le chat */
            :root {
                 --input-background: rgba(var(--vscode-input-background-rgb), 0.8);
                 --border-color: var(--vscode-panel-border);
                 --user-message-bg: rgba(var(--vscode-editor-foreground-rgb), 0.05);
                 --ai-message-bg: rgba(var(--vscode-textLink-foreground-rgb), 0.08);
                 --selected-vuln-bg: var(--vscode-list-activeSelectionBackground);
                 --selected-vuln-fg: var(--vscode-list-activeSelectionForeground);
            }
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-sideBar-background);
                display: flex;
                flex-direction: column;
                height: 100vh;
                margin: 0;
                padding: 0;
                overflow: hidden; /* Empêche le body de scroller */
            }
             #chat-container {
                 display: flex;
                 flex-direction: column;
                 height: 100%;
                 padding: 10px;
                 box-sizing: border-box;
                 gap: 10px;
             }

             /* Section Vulnérabilités */
             #vuln-selector {
                 border: 1px solid var(--border-color);
                 border-radius: 4px;
                 padding: 8px;
                 background-color: var(--vscode-input-background);
                 flex-shrink: 0; /* Ne grandit/rétrécit pas facilement */
                 max-height: 35%; /* Limite la hauteur */
                 display: flex;
                 flex-direction: column;
             }
             #vuln-selector h4 { margin: 0 0 5px 0; font-size: 0.9em; font-weight: 600; color: var(--vscode-descriptionForeground); display: flex; align-items: center; gap: 5px;}
             #vuln-search {
                 width: 100%;
                 padding: 4px 6px;
                 border: 1px solid var(--vscode-input-border);
                 background-color: var(--vscode-input-background);
                 color: var(--vscode-input-foreground);
                 border-radius: 3px;
                 margin-bottom: 5px;
                 box-sizing: border-box;
             }
             #vuln-list {
                 list-style: none;
                 padding: 0;
                 margin: 0;
                 overflow-y: auto; /* Scroll pour la liste */
                 flex-grow: 1;
             }
             .vuln-item {
                 padding: 4px 8px;
                 border-radius: 3px;
                 cursor: pointer;
                 margin-bottom: 2px;
                 border: 1px solid transparent;
                 transition: background-color 0.1s ease;
             }
             .vuln-item:hover { background-color: var(--vscode-list-hoverBackground); }
             .vuln-item.selected { background-color: var(--selected-vuln-bg); color: var(--selected-vuln-fg); border-color: var(--vscode-focusBorder); }
             .vuln-item .vuln-name { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.95em; }
             .vuln-item .vuln-path { display: block; font-size: 0.85em; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
             .vuln-item.selected .vuln-path { color: var(--selected-vuln-fg); opacity: 0.8; }

             /* Section Messages */
             #messages {
                 flex-grow: 1; /* Prend l'espace restant */
                 overflow-y: auto; /* Scrollable */
                 padding: 5px;
                 border: 1px solid var(--border-color);
                 border-radius: 4px;
                 background-color: var(--vscode-editor-background);
             }
            .message { display: flex; gap: 8px; margin-bottom: 12px; max-width: 90%; }
            .message-icon { font-size: 1.2em; margin-top: 2px; flex-shrink: 0; }
             .message-user { margin-left: auto; flex-direction: row-reverse; } /* Aligne user à droite */
             .message-ai { margin-right: auto; } /* Aligne AI à gauche */

             .message-content {
                 padding: 8px 12px;
                 border-radius: 8px;
                 font-size: 0.95em;
                 line-height: 1.4;
             }
             .message-user .message-content { background-color: var(--user-message-bg); border-top-right-radius: 0; }
             .message-ai .message-content { background-color: var(--ai-message-bg); border-top-left-radius: 0; }
             .message-timestamp { font-size: 0.75em; color: var(--vscode-descriptionForeground); margin-top: 4px; text-align: right; }
             .message-user .message-timestamp { text-align: left; }

             .message-content pre { background-color: rgba(var(--vscode-editor-foreground-rgb), 0.08); padding: 8px; border-radius: 4px; overflow-x: auto; margin: 5px 0; font-family: var(--vscode-editor-font-family); font-size: 0.9em; }
             .message-content code:not(pre code) { background-color: rgba(var(--vscode-editor-foreground-rgb), 0.1); padding: 1px 3px; border-radius: 3px; font-family: var(--vscode-editor-font-family); }


            /* Section Input */
            #input-area { display: flex; gap: 8px; padding-top: 5px; flex-shrink: 0; }
            #message-input {
                flex-grow: 1;
                padding: 8px 10px;
                border: 1px solid var(--vscode-input-border);
                background-color: var(--input-background);
                color: var(--vscode-input-foreground);
                border-radius: 4px;
                resize: none; /* Empêche le redimensionnement manuel */
                font-family: var(--vscode-font-family);
                font-size: 1em;
            }
            #send-button {
                padding: 8px 12px;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: 1px solid var(--vscode-button-border);
                border-radius: 4px;
                cursor: pointer;
                display: flex; align-items: center; gap: 5px;
                font-weight: 600;
                transition: background-color 0.1s ease;
            }
            #send-button:hover { background-color: var(--vscode-button-hoverBackground); }
            #send-button:disabled { opacity: 0.6; cursor: not-allowed; }
            #send-button .codicon { font-size: 1.1em; }

            /* Indicateurs */
            .loading-indicator { text-align: center; padding: 5px; font-style: italic; color: var(--vscode-descriptionForeground); font-size: 0.9em; }
            .error-message { background-color: rgba(var(--vscode-errorForeground-rgb), 0.1); color: var(--vscode-errorForeground); padding: 8px; border-radius: 4px; margin-bottom: 5px; display: flex; align-items: center; gap: 5px; font-size: 0.9em;}

        </style>
    </head>
    <body>
        <div id="chat-container">

             <div id="vuln-selector">
                 <h4><span class="codicon codicon-link"></span> Link Vulnerability (Optional)</h4>
                 <input type="search" id="vuln-search" placeholder="Search SAST/IaC by name...">
                 <ul id="vuln-list">
                     ${vulnerabilitiesHtml.length === 0 && !state.isLoading ? '<li><small>No vulnerabilities found or loaded.</small></li>' : vulnerabilitiesHtml}
                 </ul>
             </div>

             <div id="messages">
                 ${messagesHtml}
                 ${loadingIndicatorHtml}
                 ${errorHtml}
             </div>

             <div id="input-area">
                 <textarea id="message-input" rows="3" placeholder="Ask the Security Champion... (max 512 chars)" maxlength="512"></textarea>
                 <button id="send-button" title="Send Message">
                     <span class="codicon codicon-send"></span> Send
                 </button>
             </div>

        </div>

        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            const messageInput = document.getElementById('message-input');
            const sendButton = document.getElementById('send-button');
            const messagesDiv = document.getElementById('messages');
            const vulnList = document.getElementById('vuln-list');
            const vulnSearch = document.getElementById('vuln-search');
            let selectedVulnId = ${state.selectedVulnerability ? JSON.stringify(state.selectedVulnerability.id) : 'null'};
            let vulnerabilitiesData = ${JSON.stringify(state.vulnerabilities)}; // Conserve les données complètes

            // Fonction pour scroller en bas
            function scrollToBottom() {
                if (messagesDiv) {
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            }

             // Scroll initial
             scrollToBottom();

            // Gestion de l'envoi
            function sendMessage() {
                const text = messageInput.value.trim();
                 if (text && text.length <= 512) {
                     const selectedVuln = selectedVulnId ? vulnerabilitiesData.find(v => v.id === selectedVulnId) : null;
                     vscode.postMessage({
                         command: 'sendMessage',
                         text: text,
                         vulnerability: selectedVuln // Envoyer l'objet complet ou juste l'ID/type si préféré par le provider
                     });
                     messageInput.value = ''; // Clear input
                     // selectedVulnId = null; // Réinitialiser la sélection après envoi ? A discuter
                     // updateSelectedVulnUI(); // Mettre à jour l'UI si on réinitialise
                 }
            }

            if (sendButton && messageInput) {
                sendButton.addEventListener('click', sendMessage);
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault(); // Prevent newline
                        sendMessage();
                    }
                });
            }

            // Gestion de la sélection de vulnérabilité
            function updateSelectedVulnUI() {
                document.querySelectorAll('.vuln-item').forEach(item => {
                    if(item.getAttribute('data-vuln-id') === selectedVulnId) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
                 // Optionnel: Afficher le nom de la vuln sélectionnée près de l'input ?
            }

             if (vulnList) {
                 vulnList.addEventListener('click', (e) => {
                     const target = e.target.closest('.vuln-item');
                     if (target) {
                         const newSelectedId = target.getAttribute('data-vuln-id');
                          // Désélectionner si on clique sur l'élément déjà sélectionné
                          if (selectedVulnId === newSelectedId) {
                             selectedVulnId = null;
                          } else {
                             selectedVulnId = newSelectedId;
                          }
                         updateSelectedVulnUI();
                         // Informer l'extension (optionnel, utile si l'état doit être synchro)
                          const selectedVuln = selectedVulnId ? vulnerabilitiesData.find(v => v.id === selectedVulnId) : null;
                          vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: selectedVuln });
                     }
                 });
                 // Ajout de la navigation clavier
                 vulnList.addEventListener('keydown', (e) => {
                     if (e.key === 'Enter' || e.key === ' ') {
                          const target = e.target.closest('.vuln-item');
                          if (target) {
                              e.preventDefault();
                              target.click(); // Simule le clic pour la sélection/désélection
                          }
                     }
                 });
             }

             // Gestion de la recherche de vulnérabilité
             if (vulnSearch && vulnList) {
                 vulnSearch.addEventListener('input', (e) => {
                     const searchTerm = e.target.value.toLowerCase();
                     document.querySelectorAll('.vuln-item').forEach(item => {
                         const vulnName = item.querySelector('.vuln-name')?.textContent?.toLowerCase() || '';
                         const vulnPath = item.querySelector('.vuln-path')?.textContent?.toLowerCase() || '';
                         if (vulnName.includes(searchTerm) || vulnPath.includes(searchTerm)) {
                             item.style.display = '';
                         } else {
                             item.style.display = 'none';
                         }
                     });
                 });
             }

            // Écouter les messages de l'extension (pour mettre à jour l'UI)
            window.addEventListener('message', event => {
                const message = event.data; // Données envoyées par le provider
                switch (message.command) {
                    case 'updateState': // Le provider envoie le nouvel état complet
                        // Remplace l'état local et réaffiche
                        // Note: Ceci est une approche simple, des mises à jour plus ciblées sont possibles
                         vulnerabilitiesData = message.state.vulnerabilities || [];
                         selectedVulnId = message.state.selectedVulnerability?.id || null;
                        // Recréer le HTML (ou idéalement, juste mettre à jour le DOM)
                         const newMessagesHtml = message.state.messages.map(/* ... recréer HTML ... */).join('');
                         const newVulnsHtml = vulnerabilitiesData.map(/* ... recréer HTML ... */).join('');
                         const newLoadingHtml = message.state.isLoading ? '...' : '';
                         const newErrorHtml = message.state.error ? '...' : '';

                         // Mise à jour DOM (simplifiée, recréation complète ici)
                         if(messagesDiv) messagesDiv.innerHTML = newMessagesHtml + newLoadingHtml + newErrorHtml;
                         if(vulnList) vulnList.innerHTML = newVulnsHtml.length === 0 && !message.state.isLoading ? '<li><small>No vulnerabilities found or loaded.</small></li>' : newVulnsHtml;
                         updateSelectedVulnUI(); // Appliquer la classe 'selected'
                        scrollToBottom();
                        break;
                    case 'updateMessages': // Le provider envoie juste les messages
                        const updatedMessagesHtml = message.messages.map(/* ... */).join('');
                         if(messagesDiv) messagesDiv.innerHTML = updatedMessagesHtml + (message.isLoading ? '...' : '') + (message.error ? '...' : '');
                        scrollToBottom();
                        break;
                     case 'updateVulnerabilities': // Le provider envoie la liste
                         vulnerabilitiesData = message.vulnerabilities || [];
                         const updatedVulnsHtml = vulnerabilitiesData.map(/* ... */).join('');
                         if(vulnList) vulnList.innerHTML = updatedVulnsHtml.length === 0 && !message.isLoading ? '...' : updatedVulnsHtml;
                         updateSelectedVulnUI();
                         break;
                     // Ajouter d'autres commandes si nécessaire
                }
            });

            // Demander les données initiales au provider
             // vscode.postMessage({ command: 'loadInitialData' }); // Déplacé à resolveWebviewView pour être sûr que le listener est prêt

        </script>
    </body>
    </html>`;
}