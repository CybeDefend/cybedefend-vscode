// src/providers/iacViewProvider.ts
import * as vscode from 'vscode';
// MODIFIÉ: Importer depuis le nouveau chemin via l'index
import { getFindingsViewHtml } from '../ui/html';
import { IacVulnerabilityDetectionDto, DetailedVulnerability } from '../dtos/result/details'; // Importer aussi DetailedVulnerability pour le type
import { COMMAND_SHOW_DETAILS } from '../constants/constants';
import { ScanType } from '../api/apiService'; // Importer ScanType si besoin (pour data.scanType)

/**
 * Provides the webview view for displaying IaC findings.
 */
export class IacViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    /** Static identifier for this view type, must match the one in package.json */
    public static readonly viewType = 'cybedefendScanner.iacView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _findings: IacVulnerabilityDetectionDto[] = []; // Stocke les résultats spécifiques IaC
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._extensionUri = context.extensionUri;
    }

    /**
     * Called by VS Code when the view needs to be resolved (e.g., made visible).
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        resolveContext: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            // Mise à jour des localResourceRoots pour inclure dist
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Si vous avez un dossier media
                vscode.Uri.joinPath(this._extensionUri, 'dist'),  // Pour Codicons copiés
                vscode.Uri.joinPath(this._extensionUri, 'node_modules') // Garder pour compatibilité
            ]
        };

        // Définir le contenu HTML initial
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Nettoyer les anciens listeners avant d'en ajouter de nouveaux
        while(this._disposables.length > 0) {
            this._disposables.pop()?.dispose();
        }

        // Écouter les messages de la webview
        const messageSubscription = webviewView.webview.onDidReceiveMessage((data: { command: string, vulnerabilityData?: any, scanType?: ScanType }) => {
            switch (data.command) {
                case 'triggerShowDetails':
                    // Vérifier la présence des données nécessaires
                    if (data.vulnerabilityData && data.scanType) {
                        // Exécuter la commande globale pour afficher les détails
                        vscode.commands.executeCommand(COMMAND_SHOW_DETAILS, data.vulnerabilityData, data.scanType);
                    } else {
                        console.warn("[IacViewProvider] Invalid data received for triggerShowDetails:", data);
                    }
                    return;
                // Ajouter d'autres cas si nécessaire
            }
        });

        // Gérer la destruction de la vue
        const disposeSubscription = webviewView.onDidDispose(() => {
            if (this._view === webviewView) {
                this._view = undefined; // Réinitialiser la référence
            }
            // Nettoyer les listeners associés à cette instance de vue
            messageSubscription.dispose();
            disposeSubscription.dispose(); // Se désinscrire de l'événement onDidDispose lui-même
             // Retirer les listeners de notre tableau interne
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        // Stocker les listeners pour pouvoir les nettoyer lors de la destruction du provider
        this._disposables.push(messageSubscription, disposeSubscription);

    }

    /**
     * Met à jour la liste des vulnérabilités IaC affichées.
     */
    public updateFindings(findings: IacVulnerabilityDetectionDto[]): void {
        this._findings = findings || []; // Assure que _findings est toujours un tableau
        this._updateViewHtml(); // Déclenche la mise à jour de l'HTML
    }

    /**
     * Met à jour le contenu HTML de la webview si elle est visible.
     */
    private _updateViewHtml(): void {
        if (this._view) {
            this._view.show?.(true); // Assure la visibilité sans voler le focus
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /**
     * Génère le HTML pour la webview en utilisant la fonction importée.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getFindingsViewHtml(this._findings as DetailedVulnerability[], 'iac', webview, this._extensionUri);
    }

    /**
     * Nettoie les ressources lorsque le provider est détruit.
     */
    public dispose(): void {
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}