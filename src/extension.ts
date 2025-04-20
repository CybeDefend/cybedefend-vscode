// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/extension.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from './api/apiService';
import { AuthService, ProjectConfig } from './auth/authService';
import { SettingsWebviewProvider } from './providers/settingsWebviewProvider';
import { DetailsWebviewViewProvider } from './providers/detailsWebviewProvider';
import { SummaryViewProvider } from './providers/summaryViewProvider';
import { SastViewProvider } from './providers/sastViewProvider';
import { IacViewProvider } from './providers/iacViewProvider';
import { ScaViewProvider } from './providers/scaViewProvider';
import { ChatbotViewProvider } from './providers/chatbotViewProvider';
// Assurez-vous que le chemin vers scanCommands est correct et qu'il exporte startScanCommand
import { startScanCommand } from './commands/scanCommands'; // Assurez-vous que ce fichier existe et exporte la fonction
import { openSettingsCommand, updateApiKeyCommand } from './commands/settingsCommands';
// Assurez-vous que le chemin vers detailsCommands est correct et qu'il exporte les fonctions
import { showVulnerabilityDetailsCommand, openFileLocationCommand } from './commands/detailsCommands'; // Assurez-vous que ce fichier existe
import {
    COMMAND_START_SCAN, COMMAND_OPEN_SETTINGS, COMMAND_SHOW_DETAILS,
    COMMAND_UPDATE_API_KEY, COMMAND_OPEN_FILE_LOCATION, COMMAND_UPDATE_PROJECT_ID // Import de la nouvelle commande
} from './constants/constants';
import { DetailedVulnerability } from './dtos/result/details'; // Assurez-vous que ce DTO existe

let currentProjectConfig: ProjectConfig | null = null;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[CybeDefendScanner] Activating extension...');

    const authService = new AuthService(context);
    const apiService = new ApiService(authService); // ApiService utilisera authService pour obtenir la clé API si nécessaire
    const settingsProvider = new SettingsWebviewProvider(context, authService);
    const detailsViewProvider = new DetailsWebviewViewProvider(context);
    const summaryProvider = new SummaryViewProvider(context);
    const sastProvider = new SastViewProvider(context);
    const iacProvider = new IacViewProvider(context);
    const scaProvider = new ScaViewProvider(context);
    const chatbotProvider = new ChatbotViewProvider(context, apiService);

    context.subscriptions.push(
        settingsProvider,
        detailsViewProvider,
        summaryProvider,
        sastProvider,
        iacProvider,
        scaProvider,
        chatbotProvider
    );

    // Vérification initiale de la configuration (API Key + Project ID)
    currentProjectConfig = await authService.ensureProjectConfigurationIsSet();
    if (!currentProjectConfig) {
        console.warn("[CybeDefendScanner] Initial project configuration failed or was cancelled.");
    } else {
         console.log(`[CybeDefendScanner] Configuration loaded for workspace: ${currentProjectConfig.workspaceRoot}`);
    }

    // Listener pour les changements de workspace
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        console.log("[CybeDefendScanner] Workspace folders changed, re-validating configuration...");
        currentProjectConfig = await authService.ensureProjectConfigurationIsSet();
        if (!currentProjectConfig) {
             console.warn("[CybeDefendScanner] Configuration check failed after workspace change.");
        } else {
             console.log(`[CybeDefendScanner] Configuration re-validated for workspace: ${currentProjectConfig.workspaceRoot}`);
        }
    }));

    // Enregistrement des Webview View Providers
    const viewProvidersToRegister = [
        { id: SummaryViewProvider.viewType, provider: summaryProvider },
        { id: SastViewProvider.viewType,    provider: sastProvider },
        { id: IacViewProvider.viewType,     provider: iacProvider },
        { id: ScaViewProvider.viewType,     provider: scaProvider },
        { id: ChatbotViewProvider.viewType, provider: chatbotProvider }
    ];
    viewProvidersToRegister.forEach(({ id, provider }) => {
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(id, provider as vscode.WebviewViewProvider)
        );
    });

    // Enregistrement des Commandes
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, async () => {
            if (!currentProjectConfig) {
                console.log("[CybeDefendScanner] Configuration missing, attempting to reconfigure before scan...");
                currentProjectConfig = await authService.ensureProjectConfigurationIsSet();
            }

            if (currentProjectConfig) {
                 // Assurez-vous que startScanCommand accepte ces paramètres
                 startScanCommand(
                     context,
                     authService, // Peut-être pas nécessaire si ApiService gère l'auth
                     apiService,
                     summaryProvider, sastProvider, iacProvider, scaProvider
                 );
             } else {
                 vscode.window.showErrorMessage('CybeDefend: Configuration incomplete. Cannot start scan. Check API Key and Project ID.');
                 console.error("[CybeDefendScanner] Scan aborted due to missing configuration.");
             }
         }),
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
             openSettingsCommand(settingsProvider);
         }),
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, async () => {
             await updateApiKeyCommand(authService);
             // Revalider potentiellement la config après modif API Key
             currentProjectConfig = await authService.ensureProjectConfigurationIsSet();
         }),
        vscode.commands.registerCommand(COMMAND_UPDATE_PROJECT_ID, async () => { // Nouvelle commande
             await authService.updateWorkspaceProjectId();
             // Revalider la config après modif Project ID
             currentProjectConfig = await authService.ensureProjectConfigurationIsSet();
         }),
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
             (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                 if(currentProjectConfig) {
                     // Assurez-vous que showVulnerabilityDetailsCommand accepte ces paramètres si besoin
                     showVulnerabilityDetailsCommand(
                         vulnerabilityData,
                         inferredType,
                         apiService,
                         detailsViewProvider
                         // currentProjectConfig.projectId // Ajoutez si nécessaire
                     );
                 } else {
                    vscode.window.showWarningMessage('CybeDefend: Cannot show details, configuration missing.');
                 }
             }
        ),
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
             (filePath: string, lineNumber: number) => {
                 openFileLocationCommand(filePath, lineNumber);
             }
        )
    );

    // Commandes de FOCUS
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusScannerView', () => {
            vscode.commands.executeCommand(`${SummaryViewProvider.viewType}.focus`);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusChatbotView', () => {
            vscode.commands.executeCommand(`${ChatbotViewProvider.viewType}.focus`);
        })
    );

    console.log('[CybeDefendScanner] Extension activated successfully.');
}

export function deactivate() {
    console.log('[CybeDefendScanner] Deactivating extension.');
}