// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/providers/settingsWebviewProvider.ts
import * as vscode from 'vscode';
// Assurez-vous que ce chemin est correct si getSettingsWebviewHtml est exporté via un index.ts ou directement
import { getSettingsWebviewHtml } from '../ui/html/settingsHtml';
import { COMMAND_UPDATE_API_KEY, COMMAND_UPDATE_PROJECT_ID } from '../constants/constants';
import { AuthService } from '../auth/authService'; // Importer AuthService

export class SettingsWebviewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private readonly authService: AuthService; // Ajouter une référence à AuthService
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext, authService: AuthService) { // Injecter AuthService
        this.context = context;
        this.authService = authService; // Stocker l'instance injectée
    }

    public async show() { // Rendre la méthode asynchrone pour récupérer les données
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (this.panel) {
            this.panel.reveal(column);
            // Mettre à jour le contenu si le panneau existe déjà, au cas où la config aurait changé
            await this.updateWebviewContent();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cybedefendScannerSettings', // Identifiant unique du panneau
            'CybeDefend Settings',       // Titre visible du panneau
            column,                     // Colonne où afficher le panneau
            {
                enableScripts: true, // Activer JavaScript dans la webview
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'), // Pour CSS/Images futures
                    // Ajoutez d'autres chemins si nécessaire (ex: node_modules pour le toolkit)
                    // vscode.Uri.joinPath(this.context.extensionUri, 'node_modules')
                ],
                retainContextWhenHidden: true // Garder l'état même si le panneau n'est pas visible
            }
        );

        // Mettre à jour le contenu initial
        await this.updateWebviewContent();

        // Gérer les messages reçus de la webview
        this.panel.webview.onDidReceiveMessage(
            async message => { // Rendre le listener asynchrone si des actions le nécessitent
                switch (message.command) {
                    case 'triggerUpdateApiKey':
                        // Déclencher la commande VS Code correspondante
                        await vscode.commands.executeCommand(COMMAND_UPDATE_API_KEY);
                        // Mettre à jour la vue après l'exécution potentielle de la commande
                        await this.updateWebviewContent();
                        return;

                    case 'triggerUpdateProjectId':
                         // Déclencher la commande VS Code correspondante
                        await vscode.commands.executeCommand(COMMAND_UPDATE_PROJECT_ID);
                         // Mettre à jour la vue après l'exécution potentielle de la commande
                        await this.updateWebviewContent();
                        return;
                }
            },
            undefined, // thisArg (non nécessaire ici)
            this.disposables // Collecter ce listener pour le nettoyage
        );

        // Gérer la fermeture du panneau par l'utilisateur
        this.panel.onDidDispose(() => {
            this.dispose(); // Appeler notre propre méthode de nettoyage
        }, null, this.disposables); // Collecter ce listener
    }

    /**
     * Récupère les données actuelles et met à jour le contenu HTML de la webview.
     * @private
     */
    private async updateWebviewContent() {
        if (!this.panel) {
            return;
        }

        // 1. Vérifier si une clé API est définie
        const apiKey = await this.authService.getApiKey();
        const isApiKeySet = !!apiKey;

        // 2. Obtenir l'ID de projet et le nom du workspace actuel
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspaceRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : undefined;
        let currentProjectId: string | undefined = undefined;
        if (workspaceRoot) {
            // Utilisation de la méthode hypothétique ajoutée à AuthService
            // Remplacez par votre méthode réelle si différente
            currentProjectId = await this.authService.getWorkspaceProjectId(workspaceRoot);
        }
        const workspaceName = vscode.workspace.name; // Nom du workspace

        // 3. Générer et définir le HTML
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
            // Dispose gère le nettoyage interne du panneau et déclenche onDidDispose
            this.panel.dispose();
            this.panel = undefined;
        }
        // Nettoyer tous les listeners que nous avons enregistrés
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        console.log('[SettingsWebviewProvider] Disposed.');
    }
}