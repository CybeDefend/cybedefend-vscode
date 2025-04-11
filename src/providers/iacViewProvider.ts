// src/providers/iacViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { IacVulnerabilityDetectionDto } from '../dtos/result/details'; // DTO spécifique IaC
import { COMMAND_SHOW_DETAILS } from '../constants/constants';

/**
 * Provides the webview view for displaying IaC findings.
 */
export class IacViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.iacView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: IacVulnerabilityDetectionDto[] = [];
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[IacViewProvider] Initialized.");
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[IacViewProvider] Resolving webview view...");
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
            console.log(`[IacViewProvider] Message received: ${data.command}`);
            switch (data.command) {
                case 'triggerShowDetails':
                    if (data.vulnerabilityData && data.scanType) {
                        vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
                    } else {
                        console.warn("[IacViewProvider] Invalid data received for triggerShowDetails:", data);
                    }
                    return;
            }
        });

        // Dispose listener
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[IacViewProvider] Webview view instance disposed.');
            if (this._view === webviewView) {
                this._view = undefined;
            }
            messageSubscription.dispose();
            disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        this._disposables.push(messageSubscription, disposeSubscription);
        console.log("[IacViewProvider] Webview view resolved.");
    }

    public updateFindings(findings: IacVulnerabilityDetectionDto[]): void {
        this._findings = findings || [];
        console.log(`[IacViewProvider] Updating findings. Count: ${this._findings.length}`);
        this._updateViewHtml();
    }

    private _updateViewHtml(): void {
        if (this._view) {
            console.log("[IacViewProvider] View is visible, updating HTML.");
            this._view.show?.(true);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else {
            console.log("[IacViewProvider] View not resolved/visible.");
        }
    }

    /** Génère le HTML en utilisant la fonction importée. */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appelle la fonction importée depuis ../ui/html/findingsHtml.ts
        // Cast vers 'any' ou DetailedVulnerability[] si nécessaire
        return getFindingsViewHtml(this._findings as any, 'iac', webview, this._extensionUri);
    }

    public dispose(): void {
        console.log("[IacViewProvider] Disposing provider.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}