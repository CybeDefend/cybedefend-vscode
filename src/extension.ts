// src/extension.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from './api/apiService';
import { AuthService } from './auth/authService';
import { ActivityBarProvider } from './providers/activityBarProvider';
import { SettingsWebviewProvider } from './providers/settingsWebviewProvider';
import { DetailsWebviewProvider } from './providers/detailsWebviewProvider';
import { startScanCommand } from './commands/scanCommands';
import { openSettingsCommand, updateApiKeyCommand } from './commands/settingsCommands';
import { showVulnerabilityDetailsCommand, openFileLocationCommand } from './commands/detailsCommands';
import {
    COMMAND_START_SCAN,
    COMMAND_OPEN_SETTINGS,
    COMMAND_SHOW_DETAILS,
    COMMAND_UPDATE_API_KEY,
    COMMAND_OPEN_FILE_LOCATION,
    RESULTS_VIEW_ID
} from './constants/constants';
import { DetailedVulnerability } from './dtos/result/details';

/**
 * Méthode appelée par VS Code lorsque l'extension est activée
 * (déclenché par les activationEvents dans package.json).
 * @param context Contexte de l'extension fourni par VS Code.
 */
export function activate(context: vscode.ExtensionContext) {

    console.log('[CybexScanner] Activating extension...');

    // --- 1. Initialisation des Services ---
    // Services principaux (logique métier, API, authentification)
    const authService = new AuthService(context);
    const apiService = new ApiService(authService);

    // Providers pour les éléments d'UI VS Code
    const activityBarProvider = new ActivityBarProvider();
    const settingsProvider = new SettingsWebviewProvider(context);
    const detailsProvider = new DetailsWebviewProvider(context);

    // --- 2. Enregistrement des éléments Disposable ---
    // Tout ce qui doit être nettoyé à la désactivation doit être ajouté ici.
    // Les Webview Providers gèrent leurs propres panels via leur méthode dispose.
    context.subscriptions.push(settingsProvider);
    context.subscriptions.push(detailsProvider);
    // Si AuthService ou ApiService nécessitent un nettoyage (listeners, etc.),
    // ajoute une méthode dispose() et décommente les lignes suivantes :
    // context.subscriptions.push(authService);
    // context.subscriptions.push(apiService);


    // --- 3. Vérification Initiale de la Clé API ---
    // Lance la vérification sans attendre pour ne pas bloquer l'activation.
    // Le premier appel API ou commande vérifiera à nouveau si nécessaire.
    authService.ensureApiKeyIsSet().catch(err => {
         console.warn("[CybexScanner] Initial API Key check failed or was cancelled:", err instanceof Error ? err.message : err);
     });


    // --- 4. Enregistrement de la Vue Activity Bar ---
    // Crée et enregistre le TreeDataProvider pour notre vue personnalisée.
    console.log(`[CybexScanner] Registering TreeView: ${RESULTS_VIEW_ID}`);
    const treeView = vscode.window.createTreeView(RESULTS_VIEW_ID, {
         treeDataProvider: activityBarProvider,
         showCollapseAll: true, // Affiche le bouton "Collapse All"
         canSelectMany: false  // Sélection unique dans l'arbre
     });
     context.subscriptions.push(treeView); // Ajoute la vue aux disposables


    // --- 5. Enregistrement des Commandes ---
    // Lie chaque ID de commande à sa fonction handler importée.
    // Assure-toi que les IDs ici correspondent à ceux dans package.json et constants.ts

    console.log(`[CybexScanner] Registering command: ${COMMAND_START_SCAN}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, () => {
            // Injecte les dépendances nécessaires au handler
            startScanCommand(context, authService, apiService, activityBarProvider);
        })
    );

    console.log(`[CybexScanner] Registering command: ${COMMAND_OPEN_SETTINGS}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
            openSettingsCommand(settingsProvider); // Le handler appelle settingsProvider.show()
        })
    );

    console.log(`[CybexScanner] Registering command: ${COMMAND_UPDATE_API_KEY}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, () => {
            updateApiKeyCommand(authService); // Le handler appelle showInputBox + authService.setApiKey
        })
    );

    console.log(`[CybexScanner] Registering command: ${COMMAND_SHOW_DETAILS}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
            (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                 // La vérification robuste des arguments est maintenant DANS le handler
                showVulnerabilityDetailsCommand(vulnerabilityData, inferredType, apiService, detailsProvider);
            }
        )
    );

    console.log(`[CybexScanner] Registering command: ${COMMAND_OPEN_FILE_LOCATION}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
            (filePath: string, lineNumber: number) => {
                 openFileLocationCommand(filePath, lineNumber); // Le handler gère l'ouverture du fichier
            }
        )
    );

    console.log('[CybexScanner] Extension activation complete.');
}

/**
 * Méthode appelée par VS Code lorsque l'extension est désactivée.
 */
export function deactivate() {
    console.log('[CybexScanner] Deactivating extension.');
    // Le nettoyage des ressources enregistrées dans context.subscriptions est automatique.
}