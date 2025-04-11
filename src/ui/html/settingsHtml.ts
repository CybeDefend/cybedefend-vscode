// src/ui/html/settingsHtml.ts
import * as vscode from 'vscode';
import { getNonce } from '../../utilities/utils'; // Ajuster chemin

export function getSettingsWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const isKeySetMessage = "API Key is configured securely. Update if needed.";
    // Inclut tout le HTML et le script pour la page des paramètres
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Scanner Settings</title><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:20px}button{background-color:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border);padding:5px 15px;cursor:pointer;border-radius:2px;margin-top:10px}button:hover{background-color:var(--vscode-button-hoverBackground)}p{margin-bottom:15px}</style></head><body><h1>CybeDefend scanner Settings</h1><p>${isKeySetMessage}</p><button id="update-key-button">Update API Key</button><script nonce="${nonce}">const vscode=acquireVsCodeApi();document.getElementById('update-key-button').addEventListener('click',()=>{vscode.postMessage({command:'triggerUpdateApiKey'})})</script></body></html>`;
}