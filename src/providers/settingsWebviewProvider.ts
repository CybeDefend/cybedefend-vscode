// src/providers/settingsWebviewProvider.ts
import * as vscode from 'vscode';
import { getSettingsWebviewHtml } from '../ui/webviewContent';
import { COMMAND_UPDATE_API_KEY } from '../constants/constants';

// Implémente l'interface Disposable
export class SettingsWebviewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = []; // Pour stocker les écouteurs d'événements

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public show() {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (this.panel) {
            this.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'cybexScannerSettings',
            'Scanner Settings',
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
                retainContextWhenHidden: true // Garde le contenu en mémoire
            }
        );

        this.panel.webview.html = getSettingsWebviewHtml(this.panel.webview, this.context.extensionUri);

        // Gérer les messages
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'triggerUpdateApiKey':
                        vscode.commands.executeCommand(COMMAND_UPDATE_API_KEY);
                        return;
                }
            },
            undefined,
            this.disposables // Ajouter les écouteurs aux disposables
        );

        // Gérer la fermeture du panneau par l'utilisateur
        this.panel.onDidDispose(() => {
            this.dispose(); // Appeler notre méthode dispose
        }, null, this.disposables); // Ajouter l'écouteur aux disposables
    }

    // Méthode requise par l'interface Disposable
    public dispose() {
        // Nettoyer les ressources
        if (this.panel) {
            this.panel.dispose(); // Ferme le panneau Webview
            this.panel = undefined;
        }
        // Nettoyer tous les écouteurs d'événements enregistrés
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                x.dispose();
            }
        }
        console.log("SettingsWebviewProvider disposed.");
    }
}