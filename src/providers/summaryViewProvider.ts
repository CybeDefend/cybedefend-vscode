// src/providers/summaryViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { ProjectConfig } from '../auth/authService';
import { CountVulnerabilitiesCountByType, ScanProjectInfoDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { getSummaryViewHtml } from '../ui/html';

// Type SummaryData (gardé ici pour la clarté du provider, pourrait aussi être dans un fichier types)
type SummaryData = {
    total?: number;
    counts?: CountVulnerabilitiesCountByType;
    scanInfo?: ScanProjectInfoDto;
    error?: string | null;
    isLoading?: boolean;
    isReady?: boolean;          // Prêt à scanner (config OK, pas de scan en cours)
    isConfiguring?: boolean;    // En cours de configuration (alternative à isLoading?)
    isConfigMissing?: boolean;  // Configuration échouée / incomplète
    noWorkspace?: boolean;      // Aucun dossier ouvert
    statusMessage?: string;     // Message pendant chargement/configuration
    // Données de configuration (optionnel, pour affichage ?)
    projectName?: string;
    organizationName?: string; // A récupérer via un appel API si besoin d'afficher
};

/**
 * Provides the webview view for displaying the scan summary.
 * Implements vscode.WebviewViewProvider and vscode.Disposable.
 */
export class SummaryViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'cybedefendScanner.summaryView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    // Initialiser avec un état de base
    private _currentSummary: SummaryData = { noWorkspace: !vscode.workspace.workspaceFolders?.length };
    private _disposables: vscode.Disposable[] = [];
    private _currentConfig: ProjectConfig | null = null; // Stocker la config actuelle

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        // Mettre à jour l'état initial basé sur le workspace
        this.updateStateBasedOnWorkspace();
        const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
            this.updateStateBasedOnWorkspace();
            // Si le workspace change, la config est invalidée jusqu'à revalidation par extension.ts
            this.updateConfiguration(null);
        });
        context.subscriptions.push(workspaceWatcher);
    }

    // Met à jour l'état initial si aucun workspace n'est ouvert
    private updateStateBasedOnWorkspace() {
        const hasWorkspace = !!vscode.workspace.workspaceFolders?.length;
        if (!hasWorkspace) {
            this.updateState({ noWorkspace: true });
        } else if (this._currentSummary.noWorkspace) {
            // Si un workspace vient d'être ouvert, passer en mode 'configuration manquante'
            // jusqu'à ce que extension.ts nous donne la config
            this.updateState({ noWorkspace: false, isConfigMissing: true });
        }
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

    /**
     * Updates the view with the project configuration obtained.
     * (Point 4 requested)
     * @param config The project configuration (or null if failed/unavailable)
     */
    public updateConfiguration(config: ProjectConfig | null): void {
        this._currentConfig = config;
        if (config) {
            // Config OK: pass to ready state or keep current state if a scan was already displayed
            if (!this._currentSummary.scanInfo && !this._currentSummary.isLoading) {
                this.updateState({ isReady: true, isConfigMissing: false, noWorkspace: false });
            } else {
                // Keep the current state (loading or displaying results) but ensure configMissing is false
                this.updateState({ isConfigMissing: false, noWorkspace: false });
            }
        } else {
            // Failed or missing config (and workspace is open)
            if (!this._currentSummary.noWorkspace) {
                this.updateState({ isConfigMissing: true, isReady: false, isLoading: false });
            }
            // If noWorkspace is true, it takes priority
        }
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

    // Internal generic method to update the state and view
    public updateState(newState: Partial<SummaryData>) {
        // Merge the partial state with the current state
        this._currentSummary = { ...this._currentSummary, ...newState };
        // Ensure consistency (ex: cannot be 'ready' and 'loading' at the same time)
        if (this._currentSummary.isLoading) {
            this._currentSummary.isReady = false;
            this._currentSummary.isConfigMissing = false;
            this._currentSummary.noWorkspace = false;
            this._currentSummary.error = null;
        } else if (this._currentSummary.error) {
            this._currentSummary.isReady = false;
            this._currentSummary.isLoading = false;
            this._currentSummary.scanInfo = undefined; // Effacer les résultats en cas d'erreur
        } else if (this._currentSummary.isReady) {
            this._currentSummary.isLoading = false;
            this._currentSummary.isConfigMissing = false;
            this._currentSummary.noWorkspace = false;
            this._currentSummary.error = null;
            // Optionnel: effacer les anciens résultats quand on redevient prêt ?
            // this._currentSummary.scanInfo = undefined;
            // this._currentSummary.counts = undefined;
            // this._currentSummary.total = undefined;
        } // Ajouter d'autres règles de cohérence si nécessaire

        this._updateViewHtml();
    }

    private _updateViewHtml(): void {
        if (this._view) {
            this._view.webview.html = this._getHtml(this._view.webview);
        }
    }

    /** Generates the HTML content using the imported function. */
    private _getHtml(webview: vscode.Webview): string {
        // Use the imported function from ../ui/html/summaryHtml.ts
        return getSummaryViewHtml(this._currentSummary, webview, this._extensionUri);
    }

    public dispose(): void {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}