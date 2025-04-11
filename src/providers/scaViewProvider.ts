// src/providers/scaViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { ScaVulnerabilityWithCvssDto, DetailedVulnerability } from '../dtos/result/details'; // Importer aussi DetailedVulnerability
import { COMMAND_SHOW_DETAILS } from '../constants/constants';
import { ScanType } from '../api/apiService'; // Importer ScanType si besoin

/**
 * Provides the webview view for displaying SCA findings.
 */
export class ScaViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    /** Static identifier for this view type, must match the one in package.json */
    public static readonly viewType = 'cybedefendScanner.scaView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: ScaVulnerabilityWithCvssDto[] = []; // Stocke les résultats spécifiques SCA
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[ScaViewProvider] Initialized.");
    }

    /**
     * Called by VS Code when the view needs to be resolved.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[ScaViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            // Assurer que node_modules est inclus pour les ressources (Codicons)
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Si pertinent
                vscode.Uri.joinPath(this._extensionUri, 'node_modules') // Pour Codicons
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
            console.log(`[ScaViewProvider] Message received: ${data.command}`);
            if (data.command === 'triggerShowDetails' && data.vulnerabilityData && data.scanType) {
                vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
            } else if (data.command === 'triggerShowDetails') {
                console.warn("[ScaViewProvider] Invalid data received for triggerShowDetails:", data);
            }
        });

        // Gérer la destruction de la vue
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[ScaViewProvider] Webview view instance disposed.');
            if (this._view === webviewView) { this._view = undefined; }
             messageSubscription.dispose();
             disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        // Stocker les listeners
        this._disposables.push(messageSubscription, disposeSubscription);
        console.log("[ScaViewProvider] Webview view resolved.");
    }

    /**
     * Met à jour la liste des vulnérabilités SCA.
     */
    public updateFindings(findings: ScaVulnerabilityWithCvssDto[]): void {
        this._findings = findings || [];
        console.log(`[ScaViewProvider] Updating findings. Count: ${this._findings.length}`);
        this._updateViewHtml();
    }

    /**
     * Met à jour le HTML de la webview si elle est visible.
     */
    private _updateViewHtml(): void {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else {
             console.log("[ScaViewProvider] View not resolved/visible.");
        }
    }

    /**
     * Génère le HTML pour cette vue.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appelle la fonction importée depuis ../ui/html/findingsHtml.ts
        // Cast `this._findings` vers `DetailedVulnerability[]`.
        return getFindingsViewHtml(this._findings as DetailedVulnerability[], 'sca', webview, this._extensionUri);
    }

    /**
     * Nettoie les ressources.
     */
    public dispose(): void {
        console.log("[ScaViewProvider] Disposing provider.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}