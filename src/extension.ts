// src/extension.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from './api/apiService'; // Assurez-vous que les chemins sont corrects
import { AuthService } from './auth/authService';
import { SettingsWebviewProvider } from './providers/settingsWebviewProvider';
import { DetailsWebviewViewProvider } from './providers/detailsWebviewProvider';
import { SummaryViewProvider } from './providers/summaryViewProvider';
import { SastViewProvider } from './providers/sastViewProvider';
import { IacViewProvider } from './providers/iacViewProvider';
import { ScaViewProvider } from './providers/scaViewProvider';
import { ChatbotViewProvider } from './providers/chatbotViewProvider'; // Import du nouveau provider
import { startScanCommand } from './commands/scanCommands'; // Assurez-vous que le chemin est correct
import { openSettingsCommand, updateApiKeyCommand } from './commands/settingsCommands'; // Assurez-vous que le chemin est correct
import { showVulnerabilityDetailsCommand, openFileLocationCommand } from './commands/detailsCommands'; // Assurez-vous que le chemin est correct
import {
    COMMAND_START_SCAN, COMMAND_OPEN_SETTINGS, COMMAND_SHOW_DETAILS,
    COMMAND_UPDATE_API_KEY, COMMAND_OPEN_FILE_LOCATION
    // VIEW_CONTAINER_ID n'est plus utilisé directement ici si défini dans package.json
} from './constants/constants'; // Assurez-vous que le chemin est correct
import { DetailedVulnerability } from './dtos/result/details'; // Assurez-vous que le chemin est correct

export function activate(context: vscode.ExtensionContext) {
    console.log('[CybeDefendScanner] Activating extension...');

    // --- SUPPRIMÉ : La ligne forçant le contexte initial n'est plus nécessaire ---
    // vscode.commands.executeCommand('setContext', 'cybedefendScanner.mode', 'scanner');

    // --- 1. Initialiser Services & Providers ---
    const authService = new AuthService(context);
    const apiService = new ApiService(authService);
    const settingsProvider = new SettingsWebviewProvider(context);
    const detailsViewProvider = new DetailsWebviewViewProvider(context);
    const summaryProvider = new SummaryViewProvider(context);
    const sastProvider = new SastViewProvider(context);
    const iacProvider = new IacViewProvider(context);
    const scaProvider = new ScaViewProvider(context);
    const chatbotProvider = new ChatbotViewProvider(context, apiService);

    // --- 2. Enregistrer les Disposables (Providers) ---
    context.subscriptions.push(
        // Providers qui implémentent vscode.Disposable
        settingsProvider,
        detailsViewProvider, // Si DetailsWebviewViewProvider implémente Disposable
        summaryProvider,
        sastProvider,
        iacProvider,
        scaProvider,
        chatbotProvider
    );

    // --- 3. Vérification initiale de la clé API ---
    // Pas besoin d'attendre ici, juste lancer la vérification
    authService.ensureApiKeyIsSet().catch(err => {
       console.warn("[CybeDefendScanner] Initial API Key check failed or cancelled:", err instanceof Error ? err.message : err);
    });

    // --- 4. Enregistrer les Webview View Providers ---
    const viewProvidersToRegister = [
        { id: SummaryViewProvider.viewType, provider: summaryProvider },
        { id: SastViewProvider.viewType,    provider: sastProvider },
        { id: IacViewProvider.viewType,     provider: iacProvider },
        { id: ScaViewProvider.viewType,     provider: scaProvider },
        { id: ChatbotViewProvider.viewType, provider: chatbotProvider } // Ajout du provider Chatbot
        // Note: DetailsWebviewViewProvider utilise un WebviewPanel, pas enregistré ici
    ];

    viewProvidersToRegister.forEach(({ id, provider }) => {
        console.log(`[CybeDefendScanner] Registering WebviewViewProvider: ${id}`);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(id, provider as vscode.WebviewViewProvider)
        );
    });

    // --- 5. Enregistrer les Commandes ---

    // Commandes Scanner existantes (assurer que les dépendances sont passées)
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, () => {
             // Passez toutes les dépendances nécessaires à la commande de scan
             startScanCommand(context, authService, apiService, summaryProvider, sastProvider, iacProvider, scaProvider);
         }),
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
             openSettingsCommand(settingsProvider); // Passe le provider nécessaire
         }),
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, () => {
             updateApiKeyCommand(authService); // Passe le service nécessaire
         }),
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
             (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                 // Passe les dépendances nécessaires
                 showVulnerabilityDetailsCommand(vulnerabilityData, inferredType, apiService, detailsViewProvider);
             }
        ),
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
             (filePath: string, lineNumber: number) => {
                 openFileLocationCommand(filePath, lineNumber);
             }
        )
    );

    // --- NOUVEAU : Enregistrer les commandes de FOCUS ---
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusScannerView', () => {
            // Donne le focus à la vue Summary (la vue principale du mode Scanner)
            // L'ID complet de la commande de focus est <viewId>.focus
            vscode.commands.executeCommand(`${SummaryViewProvider.viewType}.focus`);
            console.log("Focus requested for Scanner Mode (Summary View)");
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusChatbotView', () => {
            // Donne le focus à la vue Chatbot
            vscode.commands.executeCommand(`${ChatbotViewProvider.viewType}.focus`);
            console.log("Focus requested for Chatbot Mode (Chatbot View)");
        })
    );
    // --- SUPPRIMÉ : Les anciens enregistrements pour switchTo... ne sont plus nécessaires ---

    console.log('[CybeDefendScanner] Extension activation complete.');
}

export function deactivate() {
    console.log('[CybeDefendScanner] Deactivating extension.');
    // Pas besoin de nettoyer les subscriptions ici, VS Code s'en charge.
}