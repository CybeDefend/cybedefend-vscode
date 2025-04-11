// src/providers/sastViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { SastVulnerabilityDetectionDto } from '../dtos/result/details'; // Importe le DTO spécifique SAST
import { COMMAND_SHOW_DETAILS } from '../constants/constants'; // Importe l'ID de la commande

/**
 * Provider pour la vue Webview affichant les résultats SAST.
 */
export class SastViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.sastView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: SastVulnerabilityDetectionDto[] = [];
    private _disposables: vscode.Disposable[] = []; // Ajout pour gérer les listeners proprement

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[SastViewProvider] Initialized.");
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[SastViewProvider] Resolving webview view...");
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

        // Clear previous listeners specific to this instance
        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        // Message listener
        const messageSubscription = webviewView.webview.onDidReceiveMessage(data => {
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

        // Dispose listener
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log("[SastViewProvider] Webview view instance disposed.");
            if (this._view === webviewView) {
                this._view = undefined;
            }
            messageSubscription.dispose();
            disposeSubscription.dispose();
            // Remove from our internal list
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

         // Store disposables
        this._disposables.push(messageSubscription, disposeSubscription);

        console.log("[SastViewProvider] Webview view resolved.");
    }

    public updateFindings(findings: SastVulnerabilityDetectionDto[]) {
        // Cast findings vers DetailedVulnerability[] si nécessaire pour getFindingsViewHtml
        // mais comme SastVulnerabilityDetectionDto est membre de DetailedVulnerability, ça devrait aller.
        this._findings = findings || [];
        console.log(`[SastViewProvider] Updating findings. Count: ${this._findings.length}`);
        this._updateView();
    }

    private _updateView() {
        if (this._view) {
            this._view.show?.(true); // Assure la visibilité
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else {
             console.log("[SastViewProvider] View not visible, update skipped.");
        }
    }

    /** Génère le HTML en utilisant la fonction importée. */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appelle la fonction importée depuis ../ui/html/findingsHtml.ts
        // Doit caster _findings vers DetailedVulnerability[] si le type strict est requis
        return getFindingsViewHtml(this._findings as any, 'sast', webview, this._extensionUri);
        // Utilisation de 'as any' pour simplifier, mais idéalement le type _findings
        // devrait être DetailedVulnerability[] filtré ou la fonction getFindingsViewHtml
        // devrait accepter SastVulnerabilityDetectionDto[] directement (ce qui est moins générique).
    }

    public dispose() {
        console.log("[SastViewProvider] Disposing.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}