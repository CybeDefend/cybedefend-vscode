// src/providers/scaViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { ScaVulnerabilityWithCvssDto } from '../dtos/result/details'; // DTO spécifique SCA
import { COMMAND_SHOW_DETAILS } from '../constants/constants';

/**
 * Provides the webview view for displaying SCA findings.
 */
export class ScaViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.scaView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: ScaVulnerabilityWithCvssDto[] = [];
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[ScaViewProvider] Initialized.");
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[ScaViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
             // MODIFIÉ: Inclure 'node_modules' pour Codicons
             localResourceRoots: [
                 vscode.Uri.joinPath(this._extensionUri, 'media'), // Si vous avez un dossier media
                 vscode.Uri.joinPath(this._extensionUri, 'node_modules') // Pour les Codicons
             ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Clear previous listeners
        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        // Message listener
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: any) => {
            console.log(`[ScaViewProvider] Message received: ${data.command}`);
            if (data.command === 'triggerShowDetails' && data.vulnerabilityData && data.scanType) {
                vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
            }
        });

        // Dispose listener
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[ScaViewProvider] Webview view instance disposed.');
            if (this._view === webviewView) { this._view = undefined; }
            messageSubscription.dispose();
            disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        this._disposables.push(messageSubscription, disposeSubscription);
        console.log("[ScaViewProvider] Webview view resolved.");
    }

    public updateFindings(findings: ScaVulnerabilityWithCvssDto[]): void {
        this._findings = findings || [];
        console.log(`[ScaViewProvider] Updating findings. Count: ${this._findings.length}`);
        this._updateViewHtml();
    }

    private _updateViewHtml(): void {
        if (this._view) {
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else {
             console.log("[ScaViewProvider] View not resolved/visible.");
        }
    }

    /** Génère le HTML en utilisant la fonction importée. */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appelle la fonction importée depuis ../ui/html/findingsHtml.ts
        // Cast vers 'any' ou DetailedVulnerability[] si nécessaire
        return getFindingsViewHtml(this._findings as any, 'sca', webview, this._extensionUri);
    }

    public dispose(): void {
        console.log("[ScaViewProvider] Disposing provider.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}