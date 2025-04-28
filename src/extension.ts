// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/extension.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from './api/apiService';
import { AuthService, ProjectConfig } from './auth/authService';
import { openFileLocationCommand, showVulnerabilityDetailsCommand } from './commands/detailsCommands';
import { startScanCommand } from './commands/scanCommands';
import { updateApiKeyCommand } from './commands/settingsCommands';
import {
    COMMAND_OPEN_FILE_LOCATION,
    COMMAND_OPEN_SETTINGS, COMMAND_SHOW_DETAILS,
    COMMAND_START_SCAN,
    COMMAND_UPDATE_API_KEY,
    COMMAND_UPDATE_PROJECT_ID
} from './constants/constants';
import { DetailedVulnerability } from './dtos/result/details';
import { ChatbotViewProvider } from './providers/chatbotViewProvider';
import { DetailsWebviewViewProvider } from './providers/detailsWebviewProvider';
import { IacViewProvider } from './providers/iacViewProvider';
import { SastViewProvider } from './providers/sastViewProvider';
import { ScaViewProvider } from './providers/scaViewProvider';
import { SettingsWebviewProvider } from './providers/settingsWebviewProvider';
import { SummaryViewProvider } from './providers/summaryViewProvider';

// Global variable to hold the current project configuration - Needs to be module-level
// if accessed by functions potentially outside activate (though helpers are now inside)
let currentProjectConfig: ProjectConfig | null = null;

/**
 * This method is called when your extension is activated.
 * Your extension is activated the very first time the command is executed.
 * @param context The extension context provided by VS Code.
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('[CybeDefendScanner] Activating extension...');

    // --- Instantiate Services (Singletons) ---
    const authService = new AuthService(context);
    const apiService = new ApiService(authService);

    // --- Instantiate Providers ---
    // These are now local constants within the activate function's scope
    const settingsProvider = new SettingsWebviewProvider(context, authService);
    const detailsViewProvider = new DetailsWebviewViewProvider(context);
    const summaryProvider = new SummaryViewProvider(context);
    const sastProvider = new SastViewProvider(context, apiService);
    const iacProvider = new IacViewProvider(context, apiService);
    const scaProvider = new ScaViewProvider(context, apiService);
    const chatbotProvider = new ChatbotViewProvider(context, apiService);

    // --- Store providers in context subscriptions for disposal ---
    context.subscriptions.push(
        settingsProvider, detailsViewProvider, summaryProvider,
        sastProvider, iacProvider, scaProvider, chatbotProvider
    );

    // --- Define Helper Function INSIDE activate scope ---
    /**
     * Helper function to update the configuration on all relevant providers.
     * Defined inside 'activate' to access provider instances directly.
     * @param config The project configuration to pass to the providers.
     */
    function updateAllProvidersConfiguration(config: ProjectConfig | null): void {
        console.log("[CybeDefendScanner] Broadcasting configuration update to providers...");
        if (typeof summaryProvider.updateConfiguration === 'function') {
            summaryProvider.updateConfiguration(config);
        } else { console.warn("[CybeDefendScanner] summaryProvider missing updateConfiguration method"); }

        if (typeof chatbotProvider.updateConfiguration === 'function') {
            chatbotProvider.updateConfiguration(config);
        } else { console.warn("[CybeDefendScanner] chatbotProvider missing updateConfiguration method"); }

        if (typeof sastProvider.updateConfiguration === 'function') {
            sastProvider.updateConfiguration(config);
        } else { console.warn("[CybeDefendScanner] sastProvider missing updateConfiguration method"); }

        if (typeof iacProvider.updateConfiguration === 'function') {
            iacProvider.updateConfiguration(config);
        }
        if (typeof scaProvider.updateConfiguration === 'function') {
            scaProvider.updateConfiguration(config);
        }
    }

    // --- Initial Configuration Load and Provider Update ---
    console.log("[CybeDefendScanner] Ensuring initial project configuration...");
    // 'currentProjectConfig' is module-level, accessible here
    currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
    if (!currentProjectConfig) {
        console.warn("[CybeDefendScanner] Initial project configuration failed or was cancelled by the user.");
        vscode.window.showWarningMessage("CybeDefend Scanner requires configuration. Please use the settings icon or commands.");
    } else {
        console.log(`[CybeDefendScanner] Initial config loaded: Org=${currentProjectConfig.organizationId}, Proj=${currentProjectConfig.projectId}, Workspace=${currentProjectConfig.workspaceRoot}`);
    }
    // Use the helper function (now defined above in this scope)
    updateAllProvidersConfiguration(currentProjectConfig);


    // --- Listener for Workspace Changes ---
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
        console.log("[CybeDefendScanner] Workspace folders changed:", event);
        console.log("[CybeDefendScanner] Re-validating project configuration due to workspace change...");
        currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
        // Use the helper function
        updateAllProvidersConfiguration(currentProjectConfig);
    }));

    // --- Register Webview View Providers with VS Code ---
    const viewProvidersToRegister = [
        { id: SummaryViewProvider.viewType, provider: summaryProvider },
        { id: SastViewProvider.viewType, provider: sastProvider },
        { id: IacViewProvider.viewType, provider: iacProvider },
        { id: ScaViewProvider.viewType, provider: scaProvider },
        { id: ChatbotViewProvider.viewType, provider: chatbotProvider }
    ];

    viewProvidersToRegister.forEach(({ id, provider }) => {
        if (typeof (provider as any).resolveWebviewView === 'function') {
            console.log(`[CybeDefendScanner] Registering WebviewViewProvider: ${id}`);
            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(id, provider as vscode.WebviewViewProvider)
            );
        } else {
            console.warn(`[CybeDefendScanner] Provider for ${id} does not seem to be a WebviewViewProvider.`);
        }
    });

    // --- Register Commands ---
    // Scan Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, async () => {
            console.log(`[CybeDefendScanner] '${COMMAND_START_SCAN}' triggered.`);
            if (!currentProjectConfig) {
                console.log("[CybeDefendScanner] Configuration missing, attempting re-configuration before scan...");
                vscode.window.showInformationMessage("CybeDefend: Project configuration needed before scanning.");
                currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
                // Use the helper function
                updateAllProvidersConfiguration(currentProjectConfig);
            }

            if (currentProjectConfig) {
                console.log("[CybeDefendScanner] Configuration present, proceeding with scan command.");
                startScanCommand(
                    context,
                    apiService,
                    summaryProvider, sastProvider, iacProvider, scaProvider,
                    chatbotProvider,
                    currentProjectConfig.projectId,
                    currentProjectConfig.workspaceRoot
                );
            } else {
                vscode.window.showErrorMessage('CybeDefend: Project configuration is required to start a scan. Scan cancelled.');
                console.error("[CybeDefendScanner] Scan aborted: Missing project configuration after check.");
            }
        })
    );

    // Settings Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
            console.log(`[CybeDefendScanner] '${COMMAND_OPEN_SETTINGS}' triggered.`);
            settingsProvider.show();
        })
    );

    // Update API Key Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, async () => {
            console.log(`[CybeDefendScanner] '${COMMAND_UPDATE_API_KEY}' triggered.`);
            await updateApiKeyCommand(authService);
            console.log("[CybeDefendScanner] Re-validating configuration after API key update...");
            currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
            // Use the helper function
            updateAllProvidersConfiguration(currentProjectConfig);
        })
    );

    // Update Project ID Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_UPDATE_PROJECT_ID, async () => {
            console.log(`[CybeDefendScanner] '${COMMAND_UPDATE_PROJECT_ID}' triggered.`);
            await authService.updateWorkspaceProjectId();
            console.log("[CybeDefendScanner] Re-validating configuration after Project ID update command...");
            currentProjectConfig = await authService.ensureProjectConfigurationIsSet(apiService);
            // Use the helper function
            updateAllProvidersConfiguration(currentProjectConfig);
        })
    );

    // Show Details Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
            (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                console.log(`[CybeDefendScanner] '${COMMAND_SHOW_DETAILS}' triggered for type: ${inferredType}`);
                if (currentProjectConfig) {
                    showVulnerabilityDetailsCommand(
                        vulnerabilityData,
                        inferredType,
                        apiService,
                        detailsViewProvider,
                        currentProjectConfig.projectId
                    );
                } else {
                    vscode.window.showWarningMessage('CybeDefend: Project configuration is missing. Cannot show vulnerability details.');
                    console.warn("[CybeDefendScanner] Cannot show details: Missing project configuration.");
                }
            }
        )
    );

    // Open File Location Command
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
            (workspaceRoot: string | undefined | null, relativeFilePath: string | undefined | null, lineNumber: number, vulnerabilityType: ScanType | undefined) => {
                console.log(`[CybeDefendScanner] Command '${COMMAND_OPEN_FILE_LOCATION}' received: Root='${workspaceRoot}', Path='${relativeFilePath}', Line='${lineNumber}', Type='${vulnerabilityType}'`);
                openFileLocationCommand(workspaceRoot, relativeFilePath, lineNumber, vulnerabilityType);
            }
        )
    );

    // --- Additional Utility Commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusSastView', () => {
            vscode.commands.executeCommand(`${SastViewProvider.viewType}.focus`);
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('cybedefendScanner.focusChatbotView', () => {
            vscode.commands.executeCommand(`${ChatbotViewProvider.viewType}.focus`);
        })
    );

    console.log('[CybeDefendScanner] Extension CybeDefend activation completed.');
}


/**
 * This method is called when your extension is deactivated.
 */
export function deactivate() {
    console.log('[CybeDefendScanner] Deactivating extension.');
}