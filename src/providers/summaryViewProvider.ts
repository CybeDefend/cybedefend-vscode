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
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules')
            ]
        };

        webviewView.webview.html = this._getHtml(webviewView.webview);

        // Clear previous listeners
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }

        // Handle messages
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: any) => {
             if (data.command === 'selectFolder') {
                 vscode.commands.executeCommand('vscode.openFolder');
             }
         });

        // Handle disposal
        const disposeSubscription = webviewView.onDidDispose(() => {
             if (this._view === webviewView) { this._view = undefined; }
             messageSubscription.dispose();
             disposeSubscription.dispose();
             this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
         });

        this._disposables.push(messageSubscription, disposeSubscription);
    }

    public setLoading(isLoading: boolean, message: string = "Scanning...") {
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
        this._currentSummary = {
            isLoading: false, error: null, isReady: false, noWorkspace: false,
            total: data.total, counts: data.counts, scanInfo: data.scanInfo
        };
        this._updateViewHtml();
    }

    public updateError(errorMessage: string) {
        this._currentSummary = { isLoading: false, error: errorMessage, isReady: false, noWorkspace: false };
        this._updateViewHtml();
    }

   public updateState(state: { isReady?: boolean, noWorkspace?: boolean }) {
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
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}