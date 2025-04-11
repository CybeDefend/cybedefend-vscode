import * as vscode from 'vscode';
import { SECRET_API_KEY } from '../constants/constants';

export class AuthService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_API_KEY);
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_API_KEY, apiKey);
  }

  async removeApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_API_KEY);
  }

  async ensureApiKeyIsSet(): Promise<boolean> {
    let apiKey = await this.getApiKey();
    if (!apiKey) {
      apiKey = await vscode.window.showInputBox({
        password: true,
        ignoreFocusOut: true,
        placeHolder: 'Enter your Cybedefend API Key',
        title: 'API Key Required',
        prompt: 'Please provide your API key to enable scanning features.',
      });

      if (apiKey) {
        await this.setApiKey(apiKey);
        vscode.window.showInformationMessage('CybeDefend scanner: API Key saved successfully.');
        return true;
      } else {
        // User cancelled or entered empty string
        vscode.window.showWarningMessage('CybeDefend scanner: API Key is required to perform scans.');
        return false;
      }
    }
    return true; // Key already exists
  }
}