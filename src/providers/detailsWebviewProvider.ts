// src/providers/detailsWebviewProvider.ts
import * as vscode from 'vscode';
import { getDetailsWebviewHtml } from '../ui/webviewContent';
// Importe le type de *réponse* de l'API, pas le type interne
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto'; // Ajuste chemin
import { COMMAND_OPEN_FILE_LOCATION } from '../constants/constants';

// Implémente Disposable
export class DetailsWebviewProvider implements vscode.Disposable {
    // Garde une map des panels actifs, clé = ID de détection
    private panels: Map<string, vscode.WebviewPanel> = new Map();
    private readonly context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = []; // Pour le nettoyage global

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Affiche ou révèle le panneau pour une vulnérabilité spécifique.
     * @param response La réponse complète de l'API Get By ID.
     */
    public show(response: GetProjectVulnerabilityByIdResponseDto) {
        const vulnerability = response.vulnerability;
        const panelId = vulnerability.id; // Utilise l'ID de la détection
         if (!panelId) {
             console.error("Cannot show details: Vulnerability detection ID is missing.");
             vscode.window.showErrorMessage("Cannot show details for this vulnerability (missing ID).");
             return;
         }

        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Beside;
        const existingPanel = this.panels.get(panelId);

        if (existingPanel) {
            // Si le panneau existe, le révéler et mettre à jour son contenu
            existingPanel.reveal(column);
            existingPanel.webview.html = getDetailsWebviewHtml(response, existingPanel.webview, this.context.extensionUri);
        } else {
            // Créer un nouveau panneau
            const panel = vscode.window.createWebviewPanel(
                'vulnerabilityDetails', // Type de la webview
                `Detail: ${vulnerability.vulnerability?.name || panelId}`, // Titre
                column,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
                }
            );

            panel.webview.html = getDetailsWebviewHtml(response, panel.webview, this.context.extensionUri);

            // Gérer les messages de la webview
            const messageDisposable = panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'triggerOpenFile':
                            if (message.filePath && message.lineNumber) {
                                vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, message.filePath, message.lineNumber);
                            } else {
                                console.warn("Received triggerOpenFile command with missing data:", message);
                            }
                            return;
                    }
                },
                undefined,
                this.context.subscriptions // On peut l'ajouter ici, mais on le gérera surtout via le panel dispose
            );

            // Gérer la fermeture du panneau
            const disposeDisposable = panel.onDidDispose(() => {
                this.panels.delete(panelId); // Retirer de notre map
                 messageDisposable.dispose(); // Nettoyer l'écouteur de message associé
                 // disposeDisposable.dispose(); // Se dispose lui-même
                console.log(`Details panel disposed: ${panelId}`);
            }, null, this.context.subscriptions); // Ajouter aux subscriptions globales

            this.panels.set(panelId, panel); // Ajouter le nouveau panel à la map
        }
    }

    // Méthode pour fermer tous les panneaux de détails ou un spécifique
    public disposePanel(panelId: string): void {
        const panel = this.panels.get(panelId);
        panel?.dispose(); // Déclenche onDidDispose
    }

    // Méthode requise par l'interface Disposable (pour nettoyer tous les panels lors de la désactivation)
    public dispose() {
        console.log("Disposing DetailsWebviewProvider and all active panels.");
        // Dispose tous les panels actifs
        this.panels.forEach(panel => {
            panel.dispose();
        });
        this.panels.clear(); // Vide la map

        // Nettoyer les autres disposables si nécessaire (normalement géré par onDidDispose des panels)
        // while (this.disposables.length) {
        //     const x = this.disposables.pop();
        //     if (x) { x.dispose(); }
        // }
    }
}