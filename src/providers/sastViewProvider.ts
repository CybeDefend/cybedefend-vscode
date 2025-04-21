// src/providers/sastViewProvider.ts
import * as vscode from 'vscode';
import { getFindingsViewHtml } from '../ui/html';
import { SastVulnerabilityDetectionDto, DetailedVulnerability } from '../dtos/result/details'; 
import { COMMAND_OPEN_FILE_LOCATION, COMMAND_SHOW_DETAILS } from '../constants/constants';
import { ApiService, ScanType } from '../api/apiService'; 

/**
 * Provider pour la vue Webview affichant les résultats SAST.
 */
export class SastViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'cybedefendScanner.sastView';
    private readonly scanType: ScanType = 'sast'; 

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: SastVulnerabilityDetectionDto[] = [];
    private _disposables: vscode.Disposable[] = [];
    private _isLoading: boolean = false; 
    private _error: string | null = null;

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

        while(this._disposables.length > 0) { this._disposables.pop()?.dispose(); }

        const messageSubscription = webviewView.webview.onDidReceiveMessage(
            (data: { command: string, vulnerabilityData?: any, scanType?: ScanType, filePath?: string, lineNumber?: number }) => {
            switch (data.command) {
                case 'triggerShowDetails':
                    if (data.vulnerabilityData && data.scanType) {
                        vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
                    } else { console.warn(`[${this.scanType}ViewProvider] Invalid data for triggerShowDetails`, data); }
                    return;

                // NOUVEAU : Gérer le clic pour ouvrir le fichier
                case 'triggerOpenFileLocation':
                    if (data.filePath && typeof data.lineNumber === 'number') {
                        console.log(`[${this.scanType}ViewProvider] Opening file: ${data.filePath} at line ${data.lineNumber}`);
                        vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, data.filePath, data.lineNumber);
                    } else { console.warn(`[${this.scanType}ViewProvider] Invalid data for triggerOpenFileLocation`, data); }
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
     * Rafraîchit la vue.
     */
    public refresh(): void {
        this._updateView();
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