import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { COMMAND_UPDATE_API_KEY, COMMAND_UPDATE_PROJECT_ID } from '../constants/constants';
import { getSettingsWebviewHtml } from '../ui/html/settingsHtml';

export class SettingsWebviewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private readonly authService: AuthService;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, authService: AuthService) {
        this.context = context;
        this.authService = authService;
    }

    public async show() {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (this.panel) {
            this.panel.reveal(column);
            await this.updateWebviewContent();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cybedefendScannerSettings', // solo id for this webview
            'CybeDefend Settings',       // Title visible in the panel
            column,                     // Column to display the panel
            {
                enableScripts: true, // Enable JavaScript in the webview
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'), // For future CSS/Images
                    // Add other paths if needed (ex: node_modules for the toolkit)
                    // vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
                ],
                retainContextWhenHidden: true // Keep the state even if the panel is not visible
            }
        );

        // Update the initial content
        await this.updateWebviewContent();

        // Handle messages received from the webview
        this.panel.webview.onDidReceiveMessage(
            async message => { // Make the listener asynchronous if needed
                switch (message.command) {
                    case 'triggerUpdateApiKey':
                        // Trigger the corresponding VS Code command
                        await vscode.commands.executeCommand(COMMAND_UPDATE_API_KEY);
                        // Update the view after the command potentially executes
                        await this.updateWebviewContent();
                        return;

                    case 'triggerUpdateProjectId':
                        // Trigger the corresponding VS Code command
                        await vscode.commands.executeCommand(COMMAND_UPDATE_PROJECT_ID);
                        // Update the view after the command potentially executes
                        await this.updateWebviewContent();
                        return;
                }
            },
            undefined, // thisArg (not needed here)
            this.disposables // Collect this listener for cleanup
        );

        // Gérer la fermeture du panneau par l'utilisateur
        this.panel.onDidDispose(() => {
            this.dispose(); // Call our own cleanup method
        }, null, this.disposables); // Collect this listener
    }

    /**
     * Retrieves the current data and updates the HTML content of the webview.
     * @private
     */
    private async updateWebviewContent() {
        if (!this.panel) {
            return;
        }

        // 1. Check if an API key is set
        const apiKey = await this.authService.getApiKey();
        const isApiKeySet = !!apiKey;

        // 2. Get the current project ID and workspace name
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
        let currentProjectId: string | undefined = undefined;
        if (workspaceRoot) {
            // Use the hypothetical method added to AuthService
            // Replace with your actual method if different
            currentProjectId = await this.authService.getCurrentWorkspaceProjectId();
        }
        const workspaceName = vscode.workspace.name; // Workspace name

        // 3. Generate and set the HTML
        this.panel.webview.html = getSettingsWebviewHtml(
            this.panel.webview,
            this.context.extensionUri,
            isApiKeySet,
            currentProjectId,
            workspaceName
        );
    }

    public dispose() {
        if (this.panel) {
            // Dispose handles the internal cleanup of the panel and triggers onDidDispose
            this.panel.dispose();
            this.panel = undefined;
        }
        // Clean up all listeners we have registered
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        console.log('[SettingsWebviewProvider] Disposed.');
    }
}