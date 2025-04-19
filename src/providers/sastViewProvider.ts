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
    public static readonly viewType = 'cybedefendScanner.sastView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: SastVulnerabilityDetectionDto[] = [];
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
    }

    /**
     * Called by VS Code when the view needs to be resolved (e.g., made visible).
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
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

        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: { command: string, vulnerabilityData?: any, scanType?: ScanType }) => {
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

        const disposeSubscription = webviewView.onDidDispose(() => {
            if (this._view === webviewView) {
                this._view = undefined;
            }
             messageSubscription.dispose();
             disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

         // Stocker les listeners
        this._disposables.push(messageSubscription, disposeSubscription);

    }

    /**
     * Met à jour la liste des vulnérabilités SAST.
     */
    public updateFindings(findings: SastVulnerabilityDetectionDto[]) {
        this._findings = findings || [];
        this._updateView();
    }

    /**
     * Met à jour le HTML de la webview si elle est visible.
     */
    private _updateView() {
        if (this._view) {
            this._view.show?.(true); // Assure la visibilité
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /**
     * Génère le HTML pour cette vue spécifique.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getFindingsViewHtml(this._findings as DetailedVulnerability[], 'sast', webview, this._extensionUri);
    }

    /**
     * Nettoie les ressources.
     */
    public dispose() {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}