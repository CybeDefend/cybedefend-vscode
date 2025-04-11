// src/ui/html/commonHtmlUtils.ts
import * as vscode from 'vscode';
import { VulnerabilitySeverityEnum } from '../../dtos/result/details'; // Ajuster le chemin si nécessaire

// --- Maps Sévérité ---
export const severityToIconMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'letter-c',
    [VulnerabilitySeverityEnum.HIGH]: 'letter-h',
    [VulnerabilitySeverityEnum.MEDIUM]: 'letter-m',
    [VulnerabilitySeverityEnum.LOW]: 'letter-l',
    [VulnerabilitySeverityEnum.INFO]: 'letter-i',
    'UNKNOWN': 'question'
};

export const severityToCssClassMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'severity-critical',
    [VulnerabilitySeverityEnum.HIGH]: 'severity-high',
    [VulnerabilitySeverityEnum.MEDIUM]: 'severity-medium',
    [VulnerabilitySeverityEnum.LOW]: 'severity-low',
    [VulnerabilitySeverityEnum.INFO]: 'severity-info',
    'UNKNOWN': 'severity-unknown'
};

// Nouvelles couleurs personnalisées pour les lettres
export const severityColorMap: Record<string, string> = {
    [VulnerabilitySeverityEnum.CRITICAL]: 'rgb(153, 27, 27)',
    [VulnerabilitySeverityEnum.HIGH]: 'rgb(154, 52, 18)',
    [VulnerabilitySeverityEnum.MEDIUM]: 'rgb(133, 77, 14)',
    [VulnerabilitySeverityEnum.LOW]: 'rgb(29, 78, 216)',
    [VulnerabilitySeverityEnum.INFO]: 'rgb(100, 100, 100)',
    'UNKNOWN': 'rgb(128, 128, 128)'
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
     const codiconsUri = getWebviewUri(webview, extensionUri, ['dist', 'codicon.css']);
     const codiconsFontUri = getWebviewUri(webview, extensionUri, ['dist', 'codicon.ttf']);
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
         
         /* Styles pour les lettres de sévérité */
         .codicon.codicon-letter-c::before { content: "C"; }
         .codicon.codicon-letter-h::before { content: "H"; }
         .codicon.codicon-letter-m::before { content: "M"; }
         .codicon.codicon-letter-l::before { content: "L"; }
         .codicon.codicon-letter-i::before { content: "i"; }
         
         /* Styles pour l'animation de chargement */
         .codicon-loading.codicon-modifier-spin {
             animation: codicon-spin 1.5s infinite linear;
         }
         @keyframes codicon-spin {
             100% { transform: rotate(360deg); }
         }
    `;
}