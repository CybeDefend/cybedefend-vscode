// src/providers/sastViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { SastVulnerabilityDetectionDto, DetailedVulnerability } from '../dtos/result/details'; // Importer aussi DetailedVulnerability
import { COMMAND_SHOW_DETAILS } from '../constants/constants';
import { ScanType } from '../api/apiService'; // Importer ScanType si besoin

/**
 * Provider pour la vue Webview affichant les résultats SAST.
 */
export class SastViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    /** Static identifier for this view type, must match the one in package.json */
    public static readonly viewType = 'cybedefendScanner.sastView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: SastVulnerabilityDetectionDto[] = []; // Stocke les résultats spécifiques SAST
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[SastViewProvider] Initialized.");
    }

    /**
     * Called by VS Code when the view needs to be resolved (e.g., made visible).
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[SastViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            // Mise à jour des localResourceRoots pour inclure dist
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Si pertinent
                vscode.Uri.joinPath(this._extensionUri, 'dist'),  // Pour Codicons copiés
                vscode.Uri.joinPath(this._extensionUri, 'node_modules') // Garder pour compatibilité
            ]
        };

        // Définir le contenu HTML initial
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Nettoyer les anciens listeners
        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        // Écouter les messages
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: { command: string, vulnerabilityData?: any, scanType?: ScanType }) => {
            console.log("[SastViewProvider] Message received:", data.command);
            switch (data.command) {
                case 'triggerShowDetails':
                    if (data.vulnerabilityData && data.scanType) {
                        vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
                    } else {
                        console.warn("[SastViewProvider] Invalid data received for triggerShowDetails:", data);
                    }
                    return;
            }
        });

        // Gérer la destruction de la vue
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log("[SastViewProvider] Webview view instance disposed.");
            if (this._view === webviewView) {
                this._view = undefined;
            }
             messageSubscription.dispose();
             disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

         // Stocker les listeners
        this._disposables.push(messageSubscription, disposeSubscription);

        console.log("[SastViewProvider] Webview view resolved.");
    }

    /**
     * Met à jour la liste des vulnérabilités SAST.
     */
    public updateFindings(findings: SastVulnerabilityDetectionDto[]) {
        this._findings = findings || [];
        console.log(`[SastViewProvider] Updating findings. Count: ${this._findings.length}`);
        this._updateView();
    }

    /**
     * Met à jour le HTML de la webview si elle est visible.
     */
    private _updateView() {
        if (this._view) {
            this._view.show?.(true); // Assure la visibilité
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else {
             console.log("[SastViewProvider] View not visible, update skipped.");
        }
    }

    /**
     * Génère le HTML pour cette vue spécifique.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appelle la fonction importée depuis ../ui/html/findingsHtml.ts
        // Cast `this._findings` vers `DetailedVulnerability[]`.
        return getFindingsViewHtml(this._findings as DetailedVulnerability[], 'sast', webview, this._extensionUri);
    }

    /**
     * Nettoie les ressources.
     */
    public dispose() {
        console.log("[SastViewProvider] Disposing.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}