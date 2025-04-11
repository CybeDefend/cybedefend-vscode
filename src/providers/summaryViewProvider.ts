// src/providers/summaryViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getSummaryViewHtml } from '../ui/html';
import { ScanProjectInfoDto, CountVulnerabilitiesCountByType } from '../dtos/result/response/get-project-vulnerabilities-response.dto';

// Type SummaryData (gardé ici pour la clarté du provider, pourrait aussi être dans un fichier types)
type SummaryData = {
    total?: number;
    counts?: CountVulnerabilitiesCountByType;
    scanInfo?: ScanProjectInfoDto;
    error?: string | null;
    isLoading?: boolean;
    isReady?: boolean; // State before first scan
    noWorkspace?: boolean; // State when no folder is open
    statusMessage?: string; // Optional message during loading/processing
};

/**
 * Provides the webview view for displaying the scan summary.
 * Implements vscode.WebviewViewProvider and vscode.Disposable.
 */
export class SummaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    /** Static identifier for this view type, must match the one in package.json */
    public static readonly viewType = 'cybedefendScanner.summaryView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _currentSummary: SummaryData = { isReady: true };
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[SummaryViewProvider] Initialized.");
        this.updateState({ noWorkspace: !vscode.workspace.workspaceFolders?.length, isReady: !!vscode.workspace.workspaceFolders?.length });
        const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.updateState({ noWorkspace: !vscode.workspace.workspaceFolders?.length, isReady: !!vscode.workspace.workspaceFolders?.length });
        });
        context.subscriptions.push(workspaceWatcher);
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[SummaryViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            // Mise à jour pour inclure dist pour les Codicons
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Si vous avez un dossier media
                vscode.Uri.joinPath(this._extensionUri, 'dist'),  // Pour Codicons copiés
                vscode.Uri.joinPath(this._extensionUri, 'node_modules') // Garder pour compatibilité
            ]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Clear previous listeners
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }

        // Handle messages
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: any) => {
             console.log(`[SummaryViewProvider] Message received: ${data.command}`);
             if (data.command === 'selectFolder') {
                 vscode.commands.executeCommand('vscode.openFolder');
             }
         });

        // Handle disposal
        const disposeSubscription = webviewView.onDidDispose(() => {
             console.log('[SummaryViewProvider] Webview view instance disposed.');
             if (this._view === webviewView) { this._view = undefined; }
             messageSubscription.dispose();
             disposeSubscription.dispose();
             this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
         });

        this._disposables.push(messageSubscription, disposeSubscription);
        console.log("[SummaryViewProvider] Webview view resolved.");
    }

    public setLoading(isLoading: boolean, message: string = "Scanning...") {
        console.log(`[SummaryViewProvider] Setting loading state: ${isLoading}`);
        if (isLoading) {
            this._currentSummary = { isLoading: true, statusMessage: message };
        } else {
             // Simplified: Stop loading, keep previous state if no error/data yet
             this._currentSummary = {
                 ...this._currentSummary, // Keep existing data if any
                 isLoading: false,
                 // If no error and no scanInfo/total after loading was stopped, assume ready state again
                 isReady: !this._currentSummary.error && !this._currentSummary.scanInfo && typeof this._currentSummary.total === 'undefined' && !!vscode.workspace.workspaceFolders?.length
             };
        }
        this._updateViewHtml();
    }

    public updateSummary(data: { total: number, counts: CountVulnerabilitiesCountByType, scanInfo: ScanProjectInfoDto }) {
         console.log("[SummaryViewProvider] Updating with scan summary data.");
        this._currentSummary = {
            isLoading: false, error: null, isReady: false, noWorkspace: false,
            total: data.total, counts: data.counts, scanInfo: data.scanInfo
        };
        this._updateViewHtml();
    }

    public updateError(errorMessage: string) {
         console.log("[SummaryViewProvider] Updating with error state.");
        this._currentSummary = { isLoading: false, error: errorMessage, isReady: false, noWorkspace: false };
        this._updateViewHtml();
    }

   public updateState(state: { isReady?: boolean, noWorkspace?: boolean }) {
         console.log("[SummaryViewProvider] Updating state:", state);
        // Reset other fields only if setting a general state like noWorkspace or initial isReady
        if (state.noWorkspace !== undefined || state.isReady !== undefined) {
             this._currentSummary = {
                isLoading: false, error: null, scanInfo: undefined, counts: undefined, total: undefined,
                 isReady: state.isReady ?? false,
                 noWorkspace: state.noWorkspace ?? false
             };
        } else {
             // Avoid resetting data if just updating parts of the state (though this func mainly handles general states)
             this._currentSummary = { ...this._currentSummary, ...state };
         }

        this._updateViewHtml();
   }

    private _updateViewHtml(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml(this._view.webview);
        }
    }

    /** Generates the HTML content using the imported function. */
    private _getHtml(webview: vscode.Webview): string {
        // Utilise la fonction importée depuis ../ui/html/summaryHtml.ts
        return getSummaryViewHtml(this._currentSummary, webview, this._extensionUri);
    }

    public dispose(): void {
        console.log("[SummaryViewProvider] Disposing provider.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}