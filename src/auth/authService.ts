// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/auth/authService.ts
import * as vscode from 'vscode';
import { SECRET_API_KEY, WORKSPACE_PROJECT_ID_KEY_PREFIX } from '../constants/constants';

export interface ProjectConfig {
    apiKey: string;
    projectId: string;
    workspaceRoot: string;
}

export class AuthService {
    constructor(private readonly context: vscode.ExtensionContext) { }

    async getApiKey(): Promise<string | undefined> {
        return this.context.secrets.get(SECRET_API_KEY);
    }

    async setApiKey(apiKey: string): Promise<void> {
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Invalid API Key provided.');
        }
        await this.context.secrets.store(SECRET_API_KEY, apiKey);
    }

    async removeApiKey(): Promise<void> {
        await this.context.secrets.delete(SECRET_API_KEY);
    }

    private getCurrentWorkspaceRootPath(): string | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return workspaceFolders[0].uri.fsPath;
        }
        return undefined;
    }

    public getWorkspaceProjectId(workspaceRoot: string): string | undefined {
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        return this.context.workspaceState.get<string>(key);
    }

    private async setWorkspaceProjectId(workspaceRoot: string, projectId: string): Promise<void> {
        if (!projectId || typeof projectId !== 'string') {
            throw new Error('Invalid Project ID provided.');
        }
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        await this.context.workspaceState.update(key, projectId);
    }

    public async removeWorkspaceProjectId(workspaceRoot: string): Promise<void> {
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        await this.context.workspaceState.update(key, undefined);
    }

    private async promptForProjectId(): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Enter the Project ID for this workspace',
            title: 'Project ID Required',
            prompt: 'Find this ID on your CybeDefend project settings page. It\'s needed for scans.',
            validateInput: value => {
                return value.trim().length > 0 ? null : 'Project ID cannot be empty.';
            }
        });
    }

    async ensureProjectConfigurationIsSet(): Promise<ProjectConfig | null> {
        let apiKey = await this.getApiKey();
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'Enter your CybeDefend API Key',
                title: 'API Key Required',
                prompt: 'Please provide your API key to enable scanning and AI features.',
                validateInput: value => value.trim().length > 0 ? null : 'API Key cannot be empty.'
            });

            if (apiKey) {
                try {
                    await this.setApiKey(apiKey);
                    vscode.window.showInformationMessage('CybeDefend: API Key saved successfully.');
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to save API Key: ${error instanceof Error ? error.message : String(error)}`);
                    return null;
                }
            } else {
                vscode.window.showWarningMessage('CybeDefend: API Key is required.');
                return null;
            }
        }

        const workspaceRoot = this.getCurrentWorkspaceRootPath();
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('CybeDefend: Please open a project folder to configure and run scans.');
            return null;
        }

        let projectId = this.getWorkspaceProjectId(workspaceRoot);

        if (!projectId) {
            projectId = await this.promptForProjectId();

            if (projectId) {
                try {
                    await this.setWorkspaceProjectId(workspaceRoot, projectId);
                    vscode.window.showInformationMessage(`CybeDefend: Project ID saved for workspace "${vscode.workspace.name || 'current'}".`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to save Project ID: ${error instanceof Error ? error.message : String(error)}`);
                    return null;
                }
            } else {
                vscode.window.showWarningMessage('CybeDefend: Project ID is required for this workspace.');
                return null;
            }
        }

        return { apiKey, projectId, workspaceRoot };
    }

    async updateWorkspaceProjectId(): Promise<void> {
        const workspaceRoot = this.getCurrentWorkspaceRootPath();
        if (!workspaceRoot) {
             vscode.window.showWarningMessage('CybeDefend: Please open a project folder to update its Project ID.');
            return;
        }

        const newProjectId = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Enter the NEW Project ID for this workspace',
            title: 'Update Workspace Project ID',
            prompt: `Enter the new Project ID for "${vscode.workspace.name || 'current workspace'}". Leave blank to cancel.`,
             validateInput: value => {
                 return value && value.trim().length === 0 ? 'Project ID cannot be just whitespace.' : null;
             }
        });

        if (newProjectId === undefined) {
            return; // User pressed Esc
        }

        if (newProjectId.trim() === '') {
             vscode.window.showWarningMessage('Project ID update cancelled.');
             return;
        }

        try {
            await this.setWorkspaceProjectId(workspaceRoot, newProjectId);
            vscode.window.showInformationMessage('CybeDefend: Workspace Project ID updated successfully.');
        } catch (error) {
             console.error("[AuthService] Failed to update Project ID:", error);
             vscode.window.showErrorMessage(`Failed to store Project ID: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async ensureApiKeyIsSet(): Promise<boolean> {
        let apiKey = await this.getApiKey();
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                password: true,
                ignoreFocusOut: true,
                placeHolder: 'Enter your Cybedefend API Key',
                title: 'API Key Required',
                prompt: 'Please provide your API key to enable scanning and AI features.',
                validateInput: value => {
                    return value.trim().length > 0 ? null : 'API Key cannot be empty.';
                }
            });

            if (apiKey) {
                try {
                    await this.setApiKey(apiKey);
                    vscode.window.showInformationMessage('CybeDefend: API Key saved successfully.');
                    return true;
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to save API Key.');
                    return false;
                }
            } else {
                vscode.window.showWarningMessage('CybeDefend: API Key is required to perform scans and use AI features.');
                return false;
            }
        }
        return true;
    }
}