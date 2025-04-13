// src/auth/authService.ts
import * as vscode from 'vscode';
import { SECRET_API_KEY } from '../constants/constants'; // Assurez-vous que le chemin est correct

/**
 * Service for managing API key securely using VS Code SecretStorage.
 */
export class AuthService {
  /**
   * Creates an instance of AuthService.
   * @param context - The extension context providing access to secrets.
   */
  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Retrieves the stored API key.
   * @returns A promise resolving to the API key string, or undefined if not found.
   */
  async getApiKey(): Promise<string | undefined> {
    console.log('[AuthService] Getting API Key from SecretStorage.');
    return this.context.secrets.get(SECRET_API_KEY);
  }

  /**
   * Stores the provided API key securely.
   * Overwrites any existing key.
   * @param apiKey - The API key to store.
   * @returns A promise that resolves when the key is stored.
   */
  async setApiKey(apiKey: string): Promise<void> {
    console.log('[AuthService] Storing API Key in SecretStorage.');
    if (!apiKey || typeof apiKey !== 'string') {
        console.error('[AuthService] Attempted to store invalid API Key.');
        throw new Error('Invalid API Key provided.'); // Prévenir le stockage invalide
    }
    await this.context.secrets.store(SECRET_API_KEY, apiKey);
  }

  /**
   * Deletes the stored API key.
   * @returns A promise that resolves when the key is deleted.
   */
  async removeApiKey(): Promise<void> {
    console.log('[AuthService] Deleting API Key from SecretStorage.');
    await this.context.secrets.delete(SECRET_API_KEY);
  }

  /**
   * Ensures an API key is set, prompting the user if necessary.
   * Useful before making API calls.
   * @returns A promise resolving to true if an API key is available (existing or newly entered), or false if the user cancelled/provided empty input.
   */
  async ensureApiKeyIsSet(): Promise<boolean> {
    let apiKey = await this.getApiKey();
    if (!apiKey) {
      console.log('[AuthService] API Key not found, prompting user.');
      apiKey = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Enter your Cybedefend API Key',
        title: 'API Key Required',
        prompt: 'Please provide your API key to enable scanning and AI features.',
        validateInput: value => {
             return value.trim().length > 0 ? null : 'API Key cannot be empty.'; // Validation simple
         }
      });

      if (apiKey) { // apiKey sera une string non vide grâce à validateInput
        try {
            await this.setApiKey(apiKey); // Peut lancer une erreur si problème de stockage
            vscode.window.showInformationMessage('CybeDefend: API Key saved successfully.');
            console.log('[AuthService] New API Key saved.');
            return true;
        } catch(error) {
             console.error("[AuthService] Failed to save API Key:", error);
             vscode.window.showErrorMessage('Failed to save API Key.');
             return false;
        }
      } else {
        // User cancelled (apiKey is undefined)
        console.log('[AuthService] User cancelled API Key input.');
        vscode.window.showWarningMessage('CybeDefend: API Key is required to perform scans and use AI features.');
        return false;
      }
    }
    console.log('[AuthService] API Key already exists.');
    return true; // Key already exists
  }
}