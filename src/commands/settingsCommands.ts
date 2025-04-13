// src/commands/settingsCommands.ts
import * as vscode from 'vscode';
import { AuthService } from '../auth/authService'; // Adjust path if needed
import { SettingsWebviewProvider } from '../providers/settingsWebviewProvider'; // Adjust path if needed

/**
 * Opens the settings webview panel.
 * Typically triggered by a command or button.
 * @param settingsProvider - The instance of the SettingsWebviewProvider.
 */
export function openSettingsCommand(settingsProvider: SettingsWebviewProvider): void {
    console.log('[SettingsCommand] Executing openSettingsCommand');
    settingsProvider.show(); // Method on the provider to show its panel
}

/**
 * Handles the command to prompt the user for and update the stored API Key.
 * @param authService - The authentication service instance to manage the secret.
 */
export async function updateApiKeyCommand(authService: AuthService): Promise<void> {
    console.log('[SettingsCommand] Executing updateApiKeyCommand');
    const newApiKey = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Enter your NEW Cybedefend API Key',
        title: 'Update API Key',
        prompt: 'Provide the new API key. Previous key will be overwritten. Leave blank to cancel.',
        validateInput: (value) => {
            // Optional: Add validation (e.g., non-empty)
            // return value.trim().length > 0 ? null : 'API Key cannot be empty.';
            return null; // No validation for now
        }
    });

    if (newApiKey === undefined) {
        console.log('[SettingsCommand] API Key update cancelled by user (ESC).');
        return; // User pressed Esc
    }

    if (newApiKey.trim() === '') {
        vscode.window.showWarningMessage('API Key update cancelled (empty value entered).');
        console.log('[SettingsCommand] API Key update cancelled (empty value).');
        return; // User entered blank
    }

    try {
        await authService.setApiKey(newApiKey); // Use the auth service to store the key
        vscode.window.showInformationMessage('API Key updated successfully.');
        console.log('[SettingsCommand] API Key stored successfully via AuthService.');
    } catch (error: any) {
        console.error("[SettingsCommand] Failed to update API Key via AuthService:", error);
        vscode.window.showErrorMessage(`Failed to store API Key: ${error.message}`);
    }
}