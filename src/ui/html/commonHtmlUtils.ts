// src/ui/html/commonHtmlUtils.ts
import * as vscode from 'vscode';
import { VulnerabilitySeverityEnum } from '../../dtos/result/details'; // Ajuster le chemin si nécessaire

// --- Maps Sévérité ---
export const severityToIconMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'error',        // Codicon: $(error) - Rouge
    [VulnerabilitySeverityEnum.HIGH]: 'warning',      // Codicon: $(warning) - Orange/Jaune
    [VulnerabilitySeverityEnum.MEDIUM]: 'info',         // Codicon: $(info) - Bleu
    [VulnerabilitySeverityEnum.LOW]: 'issues',       // Codicon: $(issues) - Gris/Bleu clair (représente des problèmes mineurs)
    [VulnerabilitySeverityEnum.INFO]: 'comment-discussion', // Codicon: $(comment-discussion) - Gris (purement informatif)
    'UNKNOWN': 'question'     // Codicon: $(question)
};

export const severityToCssClassMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'severity-critical',
    [VulnerabilitySeverityEnum.HIGH]: 'severity-high',
    [VulnerabilitySeverityEnum.MEDIUM]: 'severity-medium',
    [VulnerabilitySeverityEnum.LOW]: 'severity-low',
    [VulnerabilitySeverityEnum.INFO]: 'severity-info',
    'UNKNOWN': 'severity-unknown'
};

/**
 * Génère une classe CSS basée sur la sévérité.
 */
export function getSeverityClass(severity: string | undefined | null): string {
    return severityToCssClassMap[severity?.toUpperCase() || 'UNKNOWN'] || 'severity-unknown';
}

/**
 * Convertit un chemin local en URI utilisable par la webview.
 */
export function getWebviewUri(webview: vscode.Webview, extensionUri: vscode.Uri, pathList: string[]): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathList));
}

/**
 * Génère les URIs pour les assets communs (Codicons).
 */
export function getCommonAssetUris(webview: vscode.Webview, extensionUri: vscode.Uri) {
     const codiconsUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.css']);
     const codiconsFontUri = getWebviewUri(webview, extensionUri, ['node_modules', '@vscode/codicons', 'dist', 'codicon.ttf']);
     return { codiconsUri, codiconsFontUri };
}

/**
 * Génère le CSS commun pour charger les Codicons.
 */
export function getCodiconStyleSheet(fontUri: vscode.Uri): string {
    return `
        @font-face {
            font-family: 'codicon';
            src: url('${fontUri}') format('truetype');
        }
         .codicon {
             display: inline-block;
             font: normal normal normal 16px/1 codicon;
             vertical-align: middle;
             text-decoration: none;
             zoom: 1; /* Pour IE */
             text-rendering: auto;
             background-repeat: no-repeat;
             background-position: center center;
             -webkit-font-smoothing: antialiased;
             -moz-osx-font-smoothing: grayscale;
             user-select: none; /* Empêche la sélection de l'icône */
         }
         /* Styles pour l'animation de chargement */
         .codicon-loading.codicon-modifier-spin {
             animation: codicon-spin 1.5s infinite linear;
         }
         @keyframes codicon-spin {
             100% { transform: rotate(360deg); }
         }
    `;
}