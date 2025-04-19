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
    }

    /**
     * Called by VS Code when the view needs to be resolved.
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules')
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Nettoyer les anciens listeners
        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        // Écouter les messages
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: { command: string, vulnerabilityData?: any, scanType?: ScanType }) => {
            if (data.command === 'triggerShowDetails' && data.vulnerabilityData && data.scanType) {
                vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
            } else if (data.command === 'triggerShowDetails') {
                console.warn("[ScaViewProvider] Invalid data received for triggerShowDetails:", data);
            }
        });

        // Gérer la destruction de la vue
        const disposeSubscription = webviewView.onDidDispose(() => {
            if (this._view === webviewView) { this._view = undefined; }
             messageSubscription.dispose();
             disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        // Stocker les listeners
        this._disposables.push(messageSubscription, disposeSubscription);
    }

    /**
     * Met à jour la liste des vulnérabilités SCA.
     */
    public updateFindings(findings: ScaVulnerabilityWithCvssDto[]): void {
        this._findings = findings || [];
        this._updateViewHtml();
    }

    /**
     * Met à jour le HTML de la webview si elle est visible.
     */
    private _updateViewHtml(): void {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /**
     * Génère le HTML pour cette vue.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getFindingsViewHtml(this._findings as DetailedVulnerability[], 'sca', webview, this._extensionUri);
    }

    /**
     * Nettoie les ressources.
     */
    public dispose(): void {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}