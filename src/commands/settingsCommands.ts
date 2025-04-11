// src/commands/settingsCommands.ts
import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { SettingsWebviewProvider } from '../providers/settingsWebviewProvider';

/**
 * Opens the settings webview panel.
 */
export function openSettingsCommand(settingsProvider: SettingsWebviewProvider) {
    settingsProvider.show();
}

/**
 * Handles the command to update the API Key, triggered usually from the settings webview.
 */
export async function updateApiKeyCommand(authService: AuthService) {
    const newApiKey = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true, // Garde la boîte ouverte même si on clique ailleurs
        placeHolder: 'Enter your NEW Cybedefend API Key',
        title: 'Update API Key',
        prompt: 'Enter the new API key you want to use. Leave blank to cancel.',
    });

    if (newApiKey === undefined) {
        // User pressed Esc or cancelled
        return;
    }

    if (newApiKey.trim() === '') {
        // User entered blank, maybe offer to clear? For now, just don't update.
         vscode.window.showWarningMessage('API Key update cancelled (empty value entered).');
         return;
    }

    try {
        await authService.setApiKey(newApiKey);
        vscode.window.showInformationMessage('API Key updated successfully.');
    } catch (error: any) {
        console.error("Failed to update API Key:", error);
        vscode.window.showErrorMessage(`Failed to update API Key: ${error.message}`);
    }
}