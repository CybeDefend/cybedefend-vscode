// src/providers/detailsWebviewViewProvider.ts
import * as vscode from 'vscode';
import { getDetailsWebviewHtml } from '../ui/webviewContent'; // La fonction qui génère le HTML principal
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
import { COMMAND_OPEN_FILE_LOCATION } from '../constants/constants';
// --- IMPORTER getNonce depuis les utilitaires ---
import { getNonce } from '../utilities/utils'; // Ajuste le chemin si nécessaire

/**
 * Provider that manages the details panel for vulnerability information
 * Uses WebviewPanel instead of WebviewView to ensure compatibility with older VS Code versions
 */
export class DetailsWebviewViewProvider implements vscode.Disposable {

    public static readonly viewType = 'cybedefendScannerDetailView'; // ID de la vue (doit correspondre à package.json)

    private _panel?: vscode.WebviewPanel; // Référence au panel webview actif
    private _currentData?: GetProjectVulnerabilityByIdResponseDto; // Dernières données affichées
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = []; // Pour gérer les listeners

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
        console.log("[DetailsViewProvider] Initialized.");
    }

    /**
     * Creates or shows the panel and updates its content
     */
    public showPanel() {
        // Si le panel existe déjà, le mettre en avant
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Créer un nouveau panel
        this._panel = vscode.window.createWebviewPanel(
            DetailsWebviewViewProvider.viewType,
            'Vulnerability Details',
            vscode.ViewColumn.Beside, // Afficher dans la colonne à côté de l'éditeur
            {
                enableScripts: true,
                retainContextWhenHidden: true, // Garde le contenu quand caché
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'media'),
                ]
            }
        );

        // Définir le contenu HTML
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Gestion des messages depuis la Webview
        this._panel.webview.onDidReceiveMessage(data => {
            console.log("[DetailsViewProvider] Message received:", data.command);
            switch (data.command) {
                case 'triggerOpenFile':
                    if (data.filePath && typeof data.lineNumber === 'number') {
                        // Exécute la commande enregistrée dans extension.ts
                        vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, data.filePath, data.lineNumber);
                    } else {
                         console.warn("Invalid data received for triggerOpenFile:", data);
                    }
                    return;
            }
        }, null, this._disposables);

        // Gestion de la fermeture du panel
        this._panel.onDidDispose(() => {
            console.log('[DetailsViewProvider] Panel disposed');
            this._panel = undefined;
        }, null, this._disposables);
    }

    /**
     * Met à jour le contenu du panel avec de nouvelles données de vulnérabilité.
     * Crée le panel s'il n'existe pas encore.
     */
    public updateContent(response: GetProjectVulnerabilityByIdResponseDto | undefined) {
        this._currentData = response; // Stocke les nouvelles données
        
        // Crée ou montre le panel
        this.showPanel();
        
        if (this._panel) {
            console.log(`[DetailsViewProvider] Updating panel content for ID: ${response?.vulnerability?.id || 'none'}`);
            // Assigner le nouvel HTML au webview existant
            this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
        }
    }

    /**
     * Génère le HTML pour la webview.
     * Utilise les données stockées dans `_currentData`.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        if (this._currentData) {
            // Utilise la fonction externe pour générer le HTML détaillé
            return getDetailsWebviewHtml(this._currentData, webview, this._extensionUri);
        } else {
            // --- HTML par défaut (quand _currentData est undefined) ---
            const nonce = getNonce(); // Appel correct ici
            return `<!DOCTYPE html>
                 <html lang="en">
                 <head>
                     <meta charset="UTF-8">
                      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
                     <meta name="viewport" content="width=device-width, initial-scale=1.0">
                     <title>Details</title>
                      <style>
                         body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); display: flex; justify-content: center; align-items: center; height: 90vh; text-align: center; padding: 20px; }
                         .message { color: var(--vscode-descriptionForeground); }
                         .codicon { vertical-align: middle; margin-right: 5px; } /* Style pour icône optionnelle */
                     </style>
                 </head>
                 <body>
                     <div class="message">
                          <p>Select a vulnerability from the list in the 'CybeDefend scanner' view (usually on the left) to see its details here.</p>
                     </div>
                     </body>
                 </html>`;
        }
    }

     /**
      * Nettoie les ressources lorsque le provider est disposé par l'extension.
      */
     public dispose() {
         console.log("[DetailsWebviewViewProvider] Disposing provider instance and listeners.");
         // Nettoyer les listeners
         this._disposables.forEach(d => d.dispose());
         this._disposables = [];
         
         // Fermer le panel s'il existe
         if (this._panel) {
             this._panel.dispose();
             this._panel = undefined;
         }
     }
}