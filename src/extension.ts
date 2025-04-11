// src/extension.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from './api/apiService';
import { AuthService } from './auth/authService';
import { SettingsWebviewProvider } from './providers/settingsWebviewProvider';
import { DetailsWebviewViewProvider } from './providers/detailsWebviewProvider';
import { SummaryViewProvider } from './providers/summaryViewProvider';
import { SastViewProvider } from './providers/sastViewProvider';
import { IacViewProvider } from './providers/iacViewProvider';
import { ScaViewProvider } from './providers/scaViewProvider';
import { startScanCommand } from './commands/scanCommands';
import { openSettingsCommand, updateApiKeyCommand } from './commands/settingsCommands';
import { showVulnerabilityDetailsCommand, openFileLocationCommand } from './commands/detailsCommands';
import {
    COMMAND_START_SCAN, COMMAND_OPEN_SETTINGS, COMMAND_SHOW_DETAILS,
    COMMAND_UPDATE_API_KEY, COMMAND_OPEN_FILE_LOCATION,
    VIEW_CONTAINER_ID // ID for the Activity Bar container (e.g., 'cybedefendScannerViewContainer')
} from './constants/constants';
import { DetailedVulnerability } from './dtos/result/details';

/**
 * This method is called when the extension is activated.
 * Activation happens based on the 'activationEvents' defined in package.json.
 * @param context The extension context provided by VS Code, used for managing disposables and secrets.
 */
export function activate(context: vscode.ExtensionContext) {

    console.log('[CybeDefendScanner] Activating extension...');

    // --- 1. Initialize Services & Providers ---
    const authService = new AuthService(context);
    const apiService = new ApiService(authService);
    const settingsProvider = new SettingsWebviewProvider(context);
    const detailsViewProvider = new DetailsWebviewViewProvider(context); // For right sidebar/panel
    const summaryProvider = new SummaryViewProvider(context);
    const sastProvider = new SastViewProvider(context);
    const iacProvider = new IacViewProvider(context);
    const scaProvider = new ScaViewProvider(context);

    // --- 2. Register Disposables ---
    // Add all providers and potentially services if they implement vscode.Disposable
    context.subscriptions.push(
        settingsProvider,
        detailsViewProvider,
        summaryProvider,
        sastProvider,
        iacProvider,
        scaProvider
        // authService, // Uncomment if AuthService needs disposal
        // apiService  // Uncomment if ApiService needs disposal
    );

    // --- 3. Initial API Key Check ---
    // Check asynchronously, don't block activation. Errors handled when key is needed.
    authService.ensureApiKeyIsSet().catch(err => {
        console.warn("[CybeDefendScanner] Initial API Key check failed or was cancelled:", err instanceof Error ? err.message : err);
    });

    // --- 4. Register Webview View Providers ---
    // Register each provider with its unique view ID from package.json
    const viewProvidersToRegister = [
        { id: SummaryViewProvider.viewType, provider: summaryProvider }, // e.g., 'cybedefendScanner.summaryView'
        { id: SastViewProvider.viewType,    provider: sastProvider },    // e.g., 'cybedefendScanner.sastView'
        { id: IacViewProvider.viewType,     provider: iacProvider },     // e.g., 'cybedefendScanner.iacView'
        { id: ScaViewProvider.viewType,     provider: scaProvider },     // e.g., 'cybedefendScanner.scaView'
        { id: DetailsWebviewViewProvider.viewType, provider: detailsViewProvider } // e.g., 'cybedefendScannerDetailView'
    ];

    viewProvidersToRegister.forEach(({ id, provider }) => {
        console.log(`[CybeDefendScanner] Registering WebviewViewProvider: ${id}`);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(id, provider as vscode.WebviewViewProvider));
    });


    // --- 5. Register Commands ---
    console.log(`[CybeDefendScanner] Registering command: ${COMMAND_START_SCAN}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_START_SCAN, () => {
            // Pass all necessary dependencies to the command handler
            startScanCommand(context, authService, apiService, summaryProvider, sastProvider, iacProvider, scaProvider);
        })
    );

    console.log(`[CybeDefendScanner] Registering command: ${COMMAND_OPEN_SETTINGS}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_SETTINGS, () => {
            // Assumes openSettingsCommand is defined in settingsCommands.ts
            // and correctly calls settingsProvider.show()
            openSettingsCommand(settingsProvider);
        })
    );

    console.log(`[CybeDefendScanner] Registering command: ${COMMAND_UPDATE_API_KEY}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_UPDATE_API_KEY, () => {
            // Assumes updateApiKeyCommand is defined in settingsCommands.ts
            // and correctly calls authService.setApiKey after prompting
            updateApiKeyCommand(authService);
        })
    );

    console.log(`[CybeDefendScanner] Registering command: ${COMMAND_SHOW_DETAILS}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_SHOW_DETAILS,
            (vulnerabilityData: DetailedVulnerability, inferredType: ScanType | undefined) => {
                // Assumes showVulnerabilityDetailsCommand is defined in detailsCommands.ts
                // It will receive the data and call detailsViewProvider.updateContent
                showVulnerabilityDetailsCommand(vulnerabilityData, inferredType, apiService, detailsViewProvider);
            }
        )
    );

    console.log(`[CybeDefendScanner] Registering command: ${COMMAND_OPEN_FILE_LOCATION}`);
    context.subscriptions.push(
        vscode.commands.registerCommand(COMMAND_OPEN_FILE_LOCATION,
            (filePath: string, lineNumber: number) => {
                // Assumes openFileLocationCommand is defined in detailsCommands.ts
                openFileLocationCommand(filePath, lineNumber);
            }
        )
    );

    console.log('[CybeDefendScanner] Extension activation complete.');
}

/**
 * This method is called when the extension is deactivated.
 * Resources registered in context.subscriptions are automatically disposed.
 */
export function deactivate() {
    console.log('[CybeDefendScanner] Deactivating extension.');
}