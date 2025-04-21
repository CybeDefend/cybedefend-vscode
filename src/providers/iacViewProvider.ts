// src/providers/iacViewProvider.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from '../api/apiService';
import type { ProjectConfig } from '../auth/authService';
import { COMMAND_OPEN_FILE_LOCATION, COMMAND_SHOW_DETAILS } from '../constants/constants';
import { DetailedVulnerability, IacVulnerabilityDetectionDto } from '../dtos/result/details';
import { getFindingsViewHtml } from '../ui/html';

/**
 * Webview Provider for displaying IaC findings.
 * Loads findings on activation and handles clicks to show details and open file location.
 */
export class IacViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'cybedefendScanner.iacView'; // Specific View Type
    private readonly scanType: ScanType = 'iac'; // Specific Scan Type

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: DetailedVulnerability[] = [];
    private _disposables: vscode.Disposable[] = [];
    private _isLoading: boolean = false;
    private _error: string | null = null;
    private _projectId: string | null = null;
    private _workspaceRoot: string | null = null; // Store workspace root

    /**
     * Creates an instance of IacViewProvider.
     * @param context The extension context.
     * @param _apiService The API service instance for fetching data.
     */
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly _apiService: ApiService // Inject ApiService
    ) {
        this._extensionUri = context.extensionUri;
        console.log(`[${this.scanType}ViewProvider] Initialized.`); // Log with correct type
    }

    /**
     * Called by VS Code when the view needs to be resolved.
     * @param webviewView The webview view instance.
     * @param _context The webview resolve context.
     * @param _token A cancellation token.
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log(`[${this.scanType}ViewProvider] Resolving webview.`);
        this._view = webviewView;

        // Configure webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'node_modules')
            ]
        };

        // Clean up old listeners
        while (this._disposables.length > 0) { this._disposables.pop()?.dispose(); }

        // Set initial HTML
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // --- Setup Listeners ---
        const messageSubscription = webviewView.webview.onDidReceiveMessage(
            (message: { command: string, vulnerabilityData?: DetailedVulnerability, scanType?: ScanType }) => {
                switch (message.command) {
                    case 'vulnerabilityClicked': // Listen for the unified click command
                        console.log(`[${this.scanType}ViewProvider] Received 'vulnerabilityClicked' command.`);
                        if (message.vulnerabilityData && message.scanType === this.scanType) { // Check scanType matches
                            // Cast to specific DTO for easier property access
                            const vulnData = message.vulnerabilityData as IacVulnerabilityDetectionDto;

                            // Action 1: Show Details Panel
                            vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, vulnData, message.scanType);

                            // Action 2: Open File Location (logic similar to SAST for IaC)
                            if (typeof vulnData.path === 'string' && typeof vulnData.vulnerableStartLine === 'number') {
                                const relativeFilePath = vulnData.path;
                                const lineNumber = vulnData.vulnerableStartLine;
                                const lineToShow = Math.max(1, lineNumber);

                                if (this._workspaceRoot) {
                                    console.log(`[${this.scanType}ViewProvider] Opening file. Root: ${this._workspaceRoot}, Relative: ${relativeFilePath}, Line: ${lineToShow}`);
                                    vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, this._workspaceRoot, relativeFilePath, lineToShow);
                                } else {
                                    console.error(`[${this.scanType}ViewProvider] Cannot open file: Workspace root is not set.`);
                                    vscode.window.showErrorMessage("Cannot open file: Workspace root configuration is missing.");
                                }
                            } else {
                                console.warn(`[${this.scanType}ViewProvider] Missing 'path' or 'vulnerableStartLine' in vulnerabilityData for opening file location. Data:`, vulnData);
                                vscode.window.showWarningMessage("Could not determine file location for this vulnerability (missing path or line number).");
                            }
                        } else {
                            console.warn(`[${this.scanType}ViewProvider] Invalid data received for 'vulnerabilityClicked' or wrong scanType:`, message);
                        }
                        return;
                }
            });

        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log(`[${this.scanType}ViewProvider] Webview disposed.`);
            if (this._view === webviewView) { this._view = undefined; }
            messageSubscription.dispose();
            disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        this._disposables.push(messageSubscription, disposeSubscription);

        // --- Initial Data Load Trigger ---
        if (this._projectId && !this._isLoading) {
            console.log(`[${this.scanType}ViewProvider] View resolved, Project ID (${this._projectId}) known, triggering initial load.`);
            this._loadFindings();
        } else if (this._isLoading) {
            console.log(`[${this.scanType}ViewProvider] View resolved, but findings are already loading.`);
            this._updateView();
        } else {
            console.log(`[${this.scanType}ViewProvider] View resolved, Project ID unknown or load not needed yet.`);
            this._updateView();
        }
    }

    /**
     * Updates the provider's configuration state.
     * @param config The current project configuration, or null if not configured.
     */
    public updateConfiguration(config: ProjectConfig | null): void {
        const oldProjectId = this._projectId;
        const newProjectId = config?.projectId ?? null;
        const oldWorkspaceRoot = this._workspaceRoot;
        const newWorkspaceRoot = config?.workspaceRoot ?? null;

        console.log(`[${this.scanType}ViewProvider] Updating configuration. Old PID: ${oldProjectId}, New PID: ${newProjectId}. Old Root: ${oldWorkspaceRoot}, New Root: ${newWorkspaceRoot}`);

        let projectChanged = false;
        if (newProjectId !== oldProjectId || newWorkspaceRoot !== oldWorkspaceRoot) {
            projectChanged = true;
            console.log(`[${this.scanType}ViewProvider] Project ID or Workspace Root changed.`);
            this._projectId = newProjectId;
            this._workspaceRoot = newWorkspaceRoot;
            this._findings = [];
            this._error = null;
            this._isLoading = false;
        } else {
            // Still update in case the object reference changed but values are the same
            this._projectId = newProjectId;
            this._workspaceRoot = newWorkspaceRoot;
        }

        if (projectChanged) {
            if (newProjectId && this._view) {
                console.log(`[${this.scanType}ViewProvider] Project changed and view exists, triggering load.`);
                this._loadFindings();
            } else if (!newProjectId) {
                this._error = "Project not configured.";
                this._updateView();
                console.log(`[${this.scanType}ViewProvider] Project ID cleared.`);
            } else {
                console.log(`[${this.scanType}ViewProvider] Project changed, but view not ready yet. Load will trigger on resolve.`);
                this._updateView();
            }
        } else {
            console.log(`[${this.scanType}ViewProvider] Project ID/Root unchanged, ensuring view reflects current state.`);
            this._updateView();
        }
    }

    /**
     * Fetches IaC findings from the API.
     */
    private async _loadFindings(): Promise<void> {
        if (!this._projectId) {
            this._error = "Cannot load findings: Project ID is not configured.";
            this._isLoading = false; this._updateView();
            console.warn(`[${this.scanType}ViewProvider] Aborted loading: Project ID is null.`); return;
        }
        if (this._isLoading) { console.warn(`[${this.scanType}ViewProvider] Load already in progress. Skipping.`); return; }

        console.log(`[${this.scanType}ViewProvider] Loading findings for project: ${this._projectId}`);
        this._isLoading = true; this._error = null; this._updateView();

        try {
            const results = await this._apiService.getScanResults(this._projectId, this.scanType, { pageSizeNumber: 500 });
            this._findings = (results?.vulnerabilities as DetailedVulnerability[] || []);
            this._error = null;
            console.log(`[${this.scanType}ViewProvider] Loaded ${this._findings.length} findings successfully.`);
        } catch (error: any) {
            console.error(`[${this.scanType}ViewProvider] Error loading findings:`, error);
            this._error = `Failed to load ${this.scanType.toUpperCase()} findings: ${error.message || 'Unknown API error'}`;
            this._findings = [];
        } finally {
            this._isLoading = false; this._updateView();
            console.log(`[${this.scanType}ViewProvider] Findings load finished. Loading: ${this._isLoading}, Error: ${this._error}`);
        }
    }

    /**
     * Updates the findings list after a new scan completes.
     * @param findings The new list of IaC findings.
     */
    public updateFindings(findings: IacVulnerabilityDetectionDto[]): void {
        console.log(`[${this.scanType}ViewProvider] Findings received via updateFindings. Count: ${findings?.length ?? 0}`);
        this._findings = (findings as DetailedVulnerability[] || []);
        this._isLoading = false; this._error = null; this._updateView();
    }

    /** Updates the webview's HTML content. */
    private _updateView() {
        if (this._view) {
            console.log(`[${this.scanType}ViewProvider] Updating webview HTML. Loading: ${this._isLoading}, Error: ${!!this._error}, Findings: ${this._findings.length}`);
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        } else { console.log(`[${this.scanType}ViewProvider] Cannot update view - _view is not set.`); }
    }

    /** Generates the HTML content for the webview. */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getFindingsViewHtml(this._findings, this.scanType, webview, this._extensionUri);
    }

    /** Manually triggers a refresh of the findings. */
    public refresh(): void {
        console.log(`[${this.scanType}ViewProvider] Manual refresh triggered.`);
        if (this._projectId) { this._loadFindings(); }
        else {
            this._error = "Cannot refresh: Project not configured.";
            this._isLoading = false; this._findings = []; this._updateView();
            console.warn(`[${this.scanType}ViewProvider] Refresh aborted: Project not configured.`);
        }
    }

    /** Cleans up resources. */
    public dispose() {
        console.log(`[${this.scanType}ViewProvider] Disposing.`);
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
        this._view = undefined;
    }
}