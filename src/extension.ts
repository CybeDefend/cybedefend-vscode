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
import { startScanCommand } from './commands/scanCommands';
import { openSettingsCommand, updateApiKeyCommand } from './commands/settingsCommands';
import { showVulnerabilityDetailsCommand, openFileLocationCommand } from './commands/detailsCommands';
import {
    COMMAND_START_SCAN, COMMAND_OPEN_SETTINGS, COMMAND_SHOW_DETAILS,
    COMMAND_UPDATE_API_KEY, COMMAND_OPEN_FILE_LOCATION, COMMAND_UPDATE_PROJECT_ID
} from './constants/constants';
import { DetailedVulnerability } from './dtos/result/details';

let currentProjectConfig: ProjectConfig | null = null;

export async function activate(context: vscode.ExtensionContext) {
    console.log('[CybeDefendScanner] Activating extension...');

    // --- Instanciation des Services ---
    const authService = new AuthService(context);
    const apiService = new ApiService(authService);

    // --- Instanciation des Providers ---
    const settingsProvider = new SettingsWebviewProvider(context, authService);
    const detailsViewProvider = new DetailsWebviewViewProvider(context);
    const summaryProvider = new SummaryViewProvider(context);
    const sastProvider = new SastViewProvider(context);
    const iacProvider = new IacViewProvider(context);
    const scaProvider = new ScaViewProvider(context);
    const chatbotProvider = new ChatbotViewProvider(context, apiService);

    // --- Register Disposables ---
    context.subscriptions.push(
        settingsProvider, detailsViewProvider, summaryProvider,
        sastProvider, iacProvider, scaProvider, chatbotProvider
    );

    // --- Initial configuration check ---
    currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
    if (!currentProjectConfig) {
        console.warn("[CybeDefendScanner] Initial project configuration failed or was cancelled.");
    } else {
         console.log(`[CybeDefendScanner] Config loaded: Org=${currentProjectConfig.organizationId}, Proj=${currentProjectConfig.projectId}`);
    }
    summaryProvider.updateConfiguration(currentProjectConfig);
    chatbotProvider.updateConfiguration(currentProjectConfig);

    // --- Listener for Workspace Changes ---
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        console.log("[CybeDefendScanner] Workspace folders changed, re-validating configuration...");
        currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
        summaryProvider.updateConfiguration(currentProjectConfig);
        chatbotProvider.updateConfiguration(currentProjectConfig);
        sastProvider.refresh(); iacProvider.refresh(); scaProvider.refresh();
    }));

    // --- Register Webview Providers ---
    const viewProvidersToRegister = [
        { id: SummaryViewProvider.viewType, provider: summaryProvider },
        { id: SastViewProvider.viewType,    provider: sastProvider },
        { id: IacViewProvider.viewType,     provider: iacProvider },
        { id: ScaViewProvider.viewType,     provider: scaProvider },
        { id: ChatbotViewProvider.viewType, provider: chatbotProvider }
    ];
    viewProvidersToRegister.forEach(({ id, provider }) => {
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(id, provider as vscode.WebviewViewProvider));
    });

    // --- Register Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, async () => {
            if (!currentProjectConfig) {
                console.log("[CybeDefendScanner] Config missing, attempting re-configuration...");
                currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
                summaryProvider.updateConfiguration(currentProjectConfig);
            }

            if (currentProjectConfig) {
                 startScanCommand(
                     context,
                     apiService,
                     summaryProvider, sastProvider, iacProvider, scaProvider,
                     chatbotProvider,
                     currentProjectConfig.projectId,
                     currentProjectConfig.workspaceRoot
                 );
             } else {
                 vscode.window.showErrorMessage('CybeDefend: Configuration incomplète. Scan annulé.');
                 console.error("[CybeDefendScanner] Scan aborted: missing configuration.");
             }
         }),
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
             settingsProvider.show();
         }),
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, async () => {
             await updateApiKeyCommand(authService);
             currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
             summaryProvider.updateConfiguration(currentProjectConfig);
        }),
        vscode.commands.registerCommand(COMMAND_UPDATE_PROJECT_ID, async () => {
             await authService.updateWorkspaceProjectId();
             currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
             summaryProvider.updateConfiguration(currentProjectConfig);
         }),
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
             (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                 if(currentProjectConfig) {
                     showVulnerabilityDetailsCommand(
                         vulnerabilityData,
                         inferredType,
                         apiService,
                         detailsViewProvider,
                         currentProjectConfig.projectId
                     );
                 } else {
                    vscode.window.showWarningMessage('CybeDefend: Config manquante pour afficher les détails.');
                 }
             }
        ),
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
             (filePath: string, lineNumber: number) => {
                 openFileLocationCommand(filePath, lineNumber);
             }
        )
    );

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

    console.log('[CybeDefendScanner] Extension CybeDefend activée.');
}

export function deactivate() {
    console.log('[CybeDefendScanner] Deactivating extension.');
}