// src/providers/detailsWebviewViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin '/ui/html' (via index.ts)
import { COMMAND_OPEN_FILE_LOCATION } from '../constants/constants';
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
import { getDetailsWebviewHtml } from '../ui/html';
import { getNonce } from '../utilities/utils'; // Ajuste le chemin si nécessaire

/**
 * Provider that manages the details panel for vulnerability information
 * Uses WebviewPanel instead of WebviewView to ensure compatibility with older VS Code versions
 */
export class DetailsWebviewViewProvider implements vscode.Disposable {

    public static readonly viewType = 'cybedefendScannerDetailView';

    private _panel?: vscode.WebviewPanel;
    private _currentData?: GetProjectVulnerabilityByIdResponseDto;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
    }

    /**
     * Creates or shows the panel and updates its content
     */
    public showPanel() {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            DetailsWebviewViewProvider.viewType,
            'Vulnerability Details',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'dist'), // For Codicons copied
                    vscode.Uri.joinPath(this._extensionUri, 'node_modules'), // Keep for compatibility
                    // Allow access to media if you have any
                    vscode.Uri.joinPath(this._extensionUri, 'media'),
                ]
            }
        );

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        this._panel.webview.onDidReceiveMessage(data => {
            switch (data.command) {
                case 'triggerOpenFile':
                    if (data.filePath && typeof data.lineNumber === 'number') {
                        vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, data.filePath, data.lineNumber);
                    } else {
                        console.warn("Invalid data received for triggerOpenFile:", data);
                    }
                    return;
            }
        }, null, this._disposables);

        this._panel.onDidDispose(() => {
            // Important : Clean up listeners associated with this panel
            this._disposables.forEach(d => d.dispose());
            this._disposables = []; // Clear the array for the next creation
            this._panel = undefined; // Mark the panel as destroyed
        }, null, this.context.subscriptions); // Add closing handling to the main extension
    }

    /**
     * Updates the content of the panel with new vulnerability data.
     * Creates the panel if it doesn't exist yet.
     */
    public updateContent(response: GetProjectVulnerabilityByIdResponseDto | undefined) {
        this._currentData = response;

        // Creates or shows the panel
        this.showPanel();

        if (this._panel) {
            // Assign the new HTML to the existing webview
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
            // Optional: give focus to the updated panel
            this._panel.reveal(this._panel.viewColumn);
        }
    }

    /**
     * Generates the HTML for the webview using the current data.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        if (this._currentData) {
            // Use the external function (now imported from ui/html) to generate detailed HTML
            return getDetailsWebviewHtml(this._currentData, webview, this._extensionUri);
        } else {
            // Default HTML when _currentData is undefined
            const nonce = getNonce();
            const { codiconsUri, codiconsFontUri } = this.getAssetUris(webview); // Get URIs for default view too

            return `<!DOCTYPE html>
                 <html lang="en">
                 <head>
                     <meta charset="UTF-8">
                     <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:;">
                     <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <link href="${codiconsUri}" rel="stylesheet" />
                     <title>Details</title>
                     <style>
                          @font-face { font-family: 'codicon'; src: url('${codiconsFontUri}') format('truetype'); }
                         body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); display: flex; justify-content: center; align-items: center; height: 90vh; text-align: center; padding: 20px; }
                         .message { color: var(--vscode-descriptionForeground); max-width: 400px; }
                         .message .codicon { font-size: 1.5em; margin-bottom: 10px; color: var(--vscode-textLink-foreground); }
                     </style>
                 </head>
                 <body>
                     <div class="message">
                           <span class="codicon codicon-info"></span>
                           <p>Select a vulnerability from the list in the 'CybeDefend scanner' view to see its details here.</p>
                     </div>
                 </body>
                 </html>`;
        }
    }

    /** Helper to get asset URIs */
    private getAssetUris(webview: vscode.Webview) {
        // CORRIGÉ: Utiliser les chemins copiés dans dist
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicon.css'));
        const codiconsFontUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'dist', 'codicon.ttf'));
        // Ajoutez ici d'autres URIs si nécessaire (e.g., pour un CSS personnalisé)
        return { codiconsUri, codiconsFontUri };
    }


    /**
     * Cleans up resources when the provider instance is disposed (e.g., during extension deactivation).
     */
    public dispose() {
        // Dispose the panel if it exists (which will trigger its onDidDispose and clean listeners)
        if (this._panel) {
            this._panel.dispose();
        }
        // Nettoyage explicite des listeners au cas où le panel n'existerait plus mais des listeners seraient restés
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
    }
}