// src/providers/settingsWebviewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin '/ui/html' (via index.ts)
import { getSettingsWebviewHtml } from '../ui/html';
import { COMMAND_UPDATE_API_KEY } from '../constants/constants';

export class SettingsWebviewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private readonly context: vscode.ExtensionContext;
    private disposables: vscode.Disposable[] = [];

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
            'cybedefendScannerSettings',
            'Scanner Settings',
            column,
            {
                enableScripts: true,
                localResourceRoots: [
                    // Vous n'avez probablement pas besoin de node_modules ici si vous n'utilisez pas d'icônes/libs JS
                    vscode.Uri.joinPath(this.context.extensionUri, 'media') // Pour d'éventuelles images/CSS spécifiques
                ],
                retainContextWhenHidden: true
            }
        );

        // Utilise la fonction importée depuis ui/html
        this.panel.webview.html = getSettingsWebviewHtml(this.panel.webview, this.context.extensionUri);

        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'triggerUpdateApiKey':
                        vscode.commands.executeCommand(COMMAND_UPDATE_API_KEY);
                        return;
                }
            },
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);
        // Ajout à context.subscriptions n'est pas nécessaire ici si l'instance
        // elle-même est ajoutée dans extension.ts
    }

    public dispose() {
        if (this.panel) {
            // L'appel à panel.dispose() déclenchera aussi le listener onDidDispose ci-dessus
            this.panel.dispose();
            this.panel = undefined;
        }
        // Nettoyer les listeners explicitement
        while (this.disposables.length) {
            const x = this.disposables.pop();
            if (x) {
                x.dispose();
            }
        }
        console.log("SettingsWebviewProvider disposed.");
    }
}