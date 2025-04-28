// src/auth/authService.ts
import * as vscode from 'vscode';
import { ApiService } from '../api/apiService';
import { SECRET_API_KEY, WORKSPACE_PROJECT_ID_KEY_PREFIX } from '../constants/constants';
import { OrganizationInformationsResponseDto } from '../dtos/organization/organization-informations-response.dto';
import { ProjectAllInformationsResponseDto } from '../dtos/project/paginate-project-all-informations-response.dto';
import { RepositoryDto } from '../dtos/repository/repository.dto';
import { TeamInformationsResponseDto } from '../dtos/team/team-informations-response.dto';

export interface ProjectConfig {
    apiKey: string;
    projectId: string;
    workspaceRoot: string;
    organizationId: string;
}

interface QuickPickItemWithData<T> extends vscode.QuickPickItem {
    data: T;
}

// Define a type for the QuickPick item, which can hold project data or a special marker for creation
type ProjectQuickPickItem = QuickPickItemWithData<ProjectAllInformationsResponseDto> | vscode.QuickPickItem;

// Define a constant for the 'Create New Project' label
const CREATE_NEW_PROJECT_LABEL = '$(add) Create New Project...';

export class AuthService {
    constructor(
        private readonly context: vscode.ExtensionContext,
    ) { }

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

    public async getCurrentWorkspaceProjectId(): Promise<string | undefined> {
        const workspaceRoot = this.getCurrentWorkspaceRootPath();
        if (!workspaceRoot) {
            return undefined;
        }
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        return this.context.workspaceState.get<string>(key);
    }

    private async setWorkspaceProjectId(workspaceRoot: string, projectId: string): Promise<void> {
        if (!projectId || typeof projectId !== 'string') {
            throw new Error('Invalid Project ID provided.');
        }
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        await this.context.workspaceState.update(key, projectId);
        console.log(`[AuthService] Project ID ${projectId} saved for workspace ${workspaceRoot}`);
    }

    public async removeWorkspaceProjectId(workspaceRoot: string): Promise<void> {
        const key = WORKSPACE_PROJECT_ID_KEY_PREFIX + workspaceRoot;
        await this.context.workspaceState.update(key, undefined);
    }

    /**
     * Attempts to detect the repository name from the .git/config file.
     * Extracts the name part from the remote origin URL.
     * @param workspaceRoot The root path of the workspace.
     * @returns The detected repository name (e.g., 'my-repo') or undefined if not found/error.
     */
    private async detectGitRepoName(workspaceRoot: string): Promise<string | undefined> {
        try {
            const gitConfigUri = vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), '.git', 'config');
            const fileContentBytes = await vscode.workspace.fs.readFile(gitConfigUri);
            const fileContent = Buffer.from(fileContentBytes).toString('utf-8');

            const remoteOriginRegex = /\[remote\s+"origin"\][^\[]*url\s*=\s*(.*)/;
            const match = fileContent.match(remoteOriginRegex);

            if (match && match[1]) {
                const url = match[1].trim();
                const repoNameMatch = url.match(/[:/]([^/]+\/[^/]+?)(\.git)?$/);
                if (repoNameMatch && repoNameMatch[1]) {
                    const fullName = repoNameMatch[1];
                    const nameOnly = fullName.split('/').pop();
                    console.log(`[AuthService] Detected git repo name: ${nameOnly} (from URL: ${url})`);
                    return nameOnly;
                }
            }
            console.log('[AuthService] Could not find remote origin URL in .git/config');
            return undefined;
        } catch (error: any) {
            if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
                console.log('[AuthService] .git/config not found.');
            } else {
                console.error('[AuthService] Error reading or parsing .git/config:', error);
            }
            return undefined;
        }
    }

    /**
     * Orchestrates the enhanced configuration flow:
     * 1. Ensures API Key is set.
     * 2. Prompts for Organization selection.
     * 3. Tries to auto-detect Project ID via Git repository matching (Option A).
     * 4. Offers creation/linking if repo found but not linked (Option A2).
     * 5. Falls back to listing organization projects (Option B).
     * 6. Falls back to manual Project ID input if needed.
     * @returns The ProjectConfig if successful, otherwise null.
     */
    async ensureProjectConfigurationIsSet(apiServiceInstance: ApiService): Promise<ProjectConfig | null> {
        // 1. Check/Request API Key
        let apiKey = await this.getApiKey();
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                password: true, ignoreFocusOut: true, title: 'API Key Required',
                prompt: 'Please provide your CybeDefend API key.', placeHolder: 'Paste your API key here',
                validateInput: value => value.trim().length > 0 ? null : 'The API key cannot be empty.'
            });
            if (apiKey) { await this.setApiKey(apiKey); } else {
                vscode.window.showErrorMessage('API key not provided. Configuration cancelled.');
                return null;
            }
        }
        console.log('[AuthService] API Key check passed.');

        // 2. Get Workspace Root
        const workspaceRoot = this.getCurrentWorkspaceRootPath();
        if (!workspaceRoot) { return null; }
        console.log(`[AuthService] Workspace root: ${workspaceRoot}`);

        // 2.5 Check if ProjectID is already stored
        const existingProjectId = await this.getCurrentWorkspaceProjectId();
        if (existingProjectId) {
            console.log(`[AuthService] Found existing Project ID in workspaceState: ${existingProjectId}`);
            // Get OrgId if stored ? For now we leave it empty
            const existingOrgId = this.context.workspaceState.get<string>(`cybedefendWorkspaceOrgId:${workspaceRoot}`) || '';
            return { apiKey, projectId: existingProjectId, workspaceRoot, organizationId: existingOrgId };
        }
        console.log('[AuthService] No existing Project ID found in workspaceState.');

        // 3. Select Organization
        let selectedOrganization: OrganizationInformationsResponseDto | undefined;
        try {
            vscode.window.showInformationMessage('CybeDefend: Retrieving your organizations...');
            const organizations = await apiServiceInstance.getOrganizations();
            if (!organizations || organizations.length === 0) {
                vscode.window.showErrorMessage('No organizations found for your account.');
                return null;
            }

            if (organizations.length === 1) {
                selectedOrganization = organizations[0];
                vscode.window.showInformationMessage(`Organization "${selectedOrganization.name}" automatically selected.`);
            } else {
                const quickPickItems = organizations.map(org => ({
                    label: org.name,
                    description: org.description || `ID: ${org.id}`,
                    data: org
                } as QuickPickItemWithData<OrganizationInformationsResponseDto>));

                const selection = await vscode.window.showQuickPick(quickPickItems, {
                    title: 'Select an Organization',
                    placeHolder: 'Choose the organization to use',
                    ignoreFocusOut: true
                });

                if (selection) {
                    selectedOrganization = selection.data;
                } else {
                    vscode.window.showWarningMessage('Organization selection cancelled.');
                    return null; // Cancelled by the user
                }
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Error retrieving organizations: ${error.message}`);
            return null;
        }
        const organizationId = selectedOrganization.id;
        console.log(`[AuthService] Organization selected: ${organizationId} (${selectedOrganization.name})`);

        // --- OPTION A: Git detection ---
        console.log('[AuthService] Attempting Git repository detection (Option A)...');
        const detectedRepoName = await this.detectGitRepoName(workspaceRoot);

        if (detectedRepoName) {
            vscode.window.showInformationMessage(`CybeDefend: Git repository "${detectedRepoName}" detected`);
            try {
                const repoData = await apiServiceInstance.getRepositories(organizationId);
                let matchedRepoDto: RepositoryDto | undefined;

                // Iterate to find a match
                for (const install of repoData.repositories) {
                    matchedRepoDto = install.repository.find(repo => repo.name === detectedRepoName || repo.fullName.endsWith(`/${detectedRepoName}`));
                    if (matchedRepoDto) { break; } // Stop when a match is found
                }

                if (matchedRepoDto) {
                    console.log(`[AuthService] Found matching repository: ${matchedRepoDto.fullName} (ID: ${matchedRepoDto.id})`);
                    // --- OPTION A1: Project already linked ---
                    if (matchedRepoDto.projectId) {
                        vscode.window.showInformationMessage(`Repository "${matchedRepoDto.name}" linked to existing project.`);
                        await this.setWorkspaceProjectId(workspaceRoot, matchedRepoDto.projectId);
                        console.log(`[AuthService] Success: Auto-detected linked project ID: ${matchedRepoDto.projectId}`);
                        return { apiKey, projectId: matchedRepoDto.projectId, workspaceRoot, organizationId }; // FINAL STEP A1
                    }
                    // --- OPTION A2: Project not linked, propose creation/link ---
                    else {
                        console.log(`[AuthService] Matched repository ${matchedRepoDto.fullName} has no linked projectID.`);
                        const choice = await vscode.window.showQuickPick(['Yes', 'No'], {
                            title: `Link repository "${detectedRepoName}" ?`,
                            placeHolder: `This repository is not linked to any CybeDefend project. Do you want to create a new project "${detectedRepoName}" and link it ?`,
                            ignoreFocusOut: true
                        });

                        if (choice === 'Yes') {
                            vscode.window.showInformationMessage('CybeDefend: Creating and linking project...');
                            console.log('[AuthService] User chose to create and link project.');
                            // 1. Select team
                            let selectedTeam: TeamInformationsResponseDto | undefined;
                            try {
                                const teams = await apiServiceInstance.getTeams(organizationId);
                                if (!teams || teams.length === 0) { throw new Error("No teams found in the organization."); }
                                if (teams.length === 1) {
                                    selectedTeam = teams[0];
                                } else {
                                    const teamItems = teams.map(t => ({ label: t.name, description: t.description, data: t } as QuickPickItemWithData<TeamInformationsResponseDto>));
                                    const teamSelection = await vscode.window.showQuickPick(teamItems, { title: 'Select a Team', placeHolder: 'Choose the team for the new project', ignoreFocusOut: true });
                                    if (!teamSelection) { throw new Error("Team selection cancelled."); }
                                    selectedTeam = teamSelection.data;
                                }
                                console.log(`[AuthService] Team selected for new project: ${selectedTeam.id} (${selectedTeam.name})`);
                            } catch (teamError: any) {
                                vscode.window.showErrorMessage(`Error retrieving/selecting teams: ${teamError.message}`);
                                // Redirect to OPTION B in case of error here
                                return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
                            }

                            // 2. Create project
                            let createdProjectId: string;
                            try {
                                const newProject = await apiServiceInstance.createProject(selectedTeam.id, detectedRepoName); // Use the detected name
                                createdProjectId = newProject.projectId;
                                vscode.window.showInformationMessage(`Project "${newProject.name}" created successfully.`);
                                console.log(`[AuthService] Project created successfully: ${createdProjectId}`);
                            } catch (createError: any) {
                                vscode.window.showErrorMessage(`Error creating project: ${createError.message}`);
                                // Redirect to OPTION B
                                return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
                            }

                            // 3. Link project to repository
                            try {
                                await apiServiceInstance.linkProject(organizationId, createdProjectId, matchedRepoDto.id); // Use the internal repo ID DTO
                                vscode.window.showInformationMessage(`Project linked to repository "${matchedRepoDto.fullName}" successfully.`);
                                console.log(`[AuthService] Project ${createdProjectId} linked successfully to repository ${matchedRepoDto.id}`);
                            } catch (linkError: any) {
                                // Do not block if the link fails, but inform the user
                                vscode.window.showWarningMessage(`Error linking project to repository: ${linkError.message}. The project was created but not linked.`);
                                console.error(`[AuthService] Failed to link project ${createdProjectId} to repository ${matchedRepoDto.id}`, linkError);
                            }

                            // 4. Store and return
                            await this.setWorkspaceProjectId(workspaceRoot, createdProjectId);
                            console.log(`[AuthService] Success: Created and potentially linked project ID: ${createdProjectId}`);
                            return { apiKey, projectId: createdProjectId, workspaceRoot, organizationId }; // FINAL STEP A2
                        } else {
                            console.log('[AuthService] User chose not to create/link project. Proceeding to Option B.');
                            // User chose 'No' or cancelled -> Proceed to OPTION B
                            return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
                        }
                    }
                } else {
                    console.log(`[AuthService] No matching repository found for "${detectedRepoName}" in organization ${organizationId}. Proceeding to Option B.`);
                    vscode.window.showInformationMessage(`No matching repository found in your organization. Please select an existing project.`);
                    // No match -> Proceed to OPTION B
                    return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
                }
            } catch (error: any) {
                vscode.window.showWarningMessage(`Error retrieving repositories: ${error.message}. Proceeding to manual project selection.`);
                // Error API GetRepositories -> Proceed to OPTION B
                return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
            }
        } else {
            console.log('[AuthService] Git repository name not detected. Proceeding to Option B.');
            // No .git detected -> Proceed to OPTION B
            return await this.fallbackToListProjects(apiKey, organizationId, workspaceRoot, apiServiceInstance);
        }
    }

    /**
     * Fallback method (OPTION B): Lists projects in the organization for user selection,
     * OR allows the user to initiate project creation.
     * If selection fails or no projects exist, falls back to manual input.
     */
    private async fallbackToListProjects(apiKey: string, organizationId: string, workspaceRoot: string, apiServiceInstance: ApiService): Promise<ProjectConfig | null> {
        console.log('[AuthService] Entering Option B: Listing projects or creating new...');
        vscode.window.showInformationMessage(`CybeDefend: Searching for projects in the organization...`);
        try {
            // Get the first page (up to 100 projects)
            const projectData = await apiServiceInstance.getProjectsOrganization(organizationId, 100);

            // Prepare the list of existing projects for the Quick Pick
            const projectItems: QuickPickItemWithData<ProjectAllInformationsResponseDto>[] = (projectData?.projects || []).map(p => ({
                label: p.name,
                description: `Team: ${p.teamName} | ID: ${p.projectId}`,
                data: p
            }));

            // Add the "Create New Project" option at the beginning of the list
            const quickPickItems: ProjectQuickPickItem[] = [
                { label: CREATE_NEW_PROJECT_LABEL, description: 'Create a new CybeDefend project for this workspace' },
                ...projectItems
            ];

            // Show the Quick Pick with existing projects and the creation option
            const selection = await vscode.window.showQuickPick(quickPickItems, {
                title: 'Select or Create Project', // Updated title
                placeHolder: 'Choose an existing project or create a new one', // Updated placeholder
                ignoreFocusOut: true,
                matchOnDescription: true // Allows searching by ID also
            });

            // Handle the user's selection
            if (selection) {
                // Check if the "Create New Project" option was selected
                if (selection.label === CREATE_NEW_PROJECT_LABEL) {
                    console.log('[AuthService] User selected "Create New Project".');
                    // Call the helper function to handle the creation process
                    return await this.handleCreateNewProjectFromQuickPick(apiKey, organizationId, workspaceRoot, apiServiceInstance);
                } else {
                    // An existing project was selected (cast needed because it's QuickPickItemWithData)
                    const selectedProject = selection as QuickPickItemWithData<ProjectAllInformationsResponseDto>;
                    const selectedProjectId = selectedProject.data.projectId;
                    await this.setWorkspaceProjectId(workspaceRoot, selectedProjectId);
                    vscode.window.showInformationMessage(`Project "${selectedProject.data.name}" selected.`);
                    console.log(`[AuthService] Success: User selected existing project ID: ${selectedProjectId}`);
                    return { apiKey, projectId: selectedProjectId, workspaceRoot, organizationId }; // FINAL STEP B (Select existing)
                }
            } else {
                // User cancelled the Quick Pick
                vscode.window.showWarningMessage('Project selection/creation cancelled.');
                return null; // Cancelled by the user
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Error retrieving projects: ${error.message}. Proceeding to manual input.`);
            // Error API GetProjects -> Proceed to manual input
            return await this.fallbackToManualInput(apiKey, workspaceRoot, organizationId);
        }
    }

    /**
     * Handles the process of creating a new project initiated from the quick pick menu.
     * Prompts for team and project name, creates the project via API, and saves the config.
     * @returns The ProjectConfig if successful, otherwise null.
     */
    private async handleCreateNewProjectFromQuickPick(apiKey: string, organizationId: string, workspaceRoot: string, apiServiceInstance: ApiService): Promise<ProjectConfig | null> {
        console.log('[AuthService] Initiating new project creation flow...');
        try {
            // 1. Select Team for the new project
            let selectedTeam: TeamInformationsResponseDto | undefined;
            try {
                const teams = await apiServiceInstance.getTeams(organizationId);
                if (!teams || teams.length === 0) { throw new Error("No teams found in the organization. Cannot create a project."); }

                if (teams.length === 1) {
                    selectedTeam = teams[0];
                    vscode.window.showInformationMessage(`Team "${selectedTeam.name}" automatically selected for the new project.`);
                } else {
                    const teamItems = teams.map(t => ({ label: t.name, description: t.description, data: t } as QuickPickItemWithData<TeamInformationsResponseDto>));
                    const teamSelection = await vscode.window.showQuickPick(teamItems, { title: 'Select a Team for New Project', placeHolder: 'Choose the team for the new project', ignoreFocusOut: true });
                    if (!teamSelection) {
                        vscode.window.showWarningMessage("Team selection cancelled. Project creation aborted.");
                        return null; // Abort if team selection is cancelled
                    }
                    selectedTeam = teamSelection.data;
                }
                console.log(`[AuthService] Team selected for new project: ${selectedTeam.id} (${selectedTeam.name})`);
            } catch (teamError: any) {
                vscode.window.showErrorMessage(`Error selecting team: ${teamError.message}`);
                return null; // Abort on error
            }

            // 2. Prompt for Project Name
            const projectName = await vscode.window.showInputBox({
                title: 'New Project Name',
                prompt: 'Enter a name for the new CybeDefend project',
                placeHolder: 'e.g., my-web-application',
                ignoreFocusOut: true,
                validateInput: value => value && value.trim().length > 0 ? null : 'Project name cannot be empty.'
            });

            if (!projectName || projectName.trim().length === 0) {
                vscode.window.showWarningMessage("Project name not provided. Project creation aborted.");
                return null; // Abort if name is not provided
            }
            const trimmedProjectName = projectName.trim();
            console.log(`[AuthService] Project name entered: ${trimmedProjectName}`);

            // 3. Create Project via API
            let createdProjectId: string;
            try {
                vscode.window.showInformationMessage(`CybeDefend: Creating project "${trimmedProjectName}"...`);
                const newProject = await apiServiceInstance.createProject(selectedTeam.id, trimmedProjectName);
                createdProjectId = newProject.projectId;
                vscode.window.showInformationMessage(`Project "${newProject.name}" created successfully.`);
                console.log(`[AuthService] Project created successfully via QuickPick flow: ${createdProjectId}`);
            } catch (createError: any) {
                vscode.window.showErrorMessage(`Error creating project: ${createError.message}`);
                return null; // Abort on creation error
            }

            // 4. Store Project ID and return configuration
            await this.setWorkspaceProjectId(workspaceRoot, createdProjectId);
            console.log(`[AuthService] Success: Created and saved new project ID: ${createdProjectId}`);
            return { apiKey, projectId: createdProjectId, workspaceRoot, organizationId }; // FINAL STEP B (Create new)

        } catch (error: any) {
            // Catch any unexpected errors during the creation flow
            vscode.window.showErrorMessage(`An unexpected error occurred during project creation: ${error.message}`);
            console.error('[AuthService] Unexpected error in handleCreateNewProjectFromQuickPick:', error);
            return null;
        }
    }

    /**
     * Final fallback: Prompts the user to enter the Project ID manually.
     */
    private async fallbackToManualInput(apiKey: string, workspaceRoot: string, organizationId: string): Promise<ProjectConfig | null> {
        console.log('[AuthService] Entering final fallback: Manual Project ID input...');
        const projectId = await this.promptForProjectId(); // Use the existing prompt method

        if (projectId) {
            try {
                await this.setWorkspaceProjectId(workspaceRoot, projectId);
                vscode.window.showInformationMessage(`ID de projet "${projectId}" enregistré manuellement.`);
                console.log(`[AuthService] Success: User manually entered project ID: ${projectId}`);
                return { apiKey, projectId, workspaceRoot, organizationId }; // FINAL STEP (Manual)
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error saving manual project ID: ${error.message}`);
                return null;
            }
        } else {
            vscode.window.showErrorMessage('Project ID not provided. Configuration incomplete.');
            return null; // Cancelled by the user
        }
    }

    // --- Existing methods (promptForProjectId, updateWorkspaceProjectId, ensureApiKeyIsSet) ---
    // promptForProjectId is used in the manual fallback
    private async promptForProjectId(): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Enter the project ID manually',
            title: 'Project ID Required (Manual)',
            prompt: 'Unable to determine the project automatically. Please enter the CybeDefend project ID.',
            validateInput: value => value.trim().length > 0 ? null : 'The project ID cannot be empty.'
        });
    }

    async updateWorkspaceProjectId(): Promise<void> {
        // This method can remain for manual update via the dedicated command
        const workspaceRoot = this.getCurrentWorkspaceRootPath();
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('CybeDefend: Please open a folder to update its project ID.');
            return;
        }
        const currentProjectId = await this.getCurrentWorkspaceProjectId();

        const newProjectId = await vscode.window.showInputBox({
            ignoreFocusOut: true,
            placeHolder: 'Enter the NEW project ID for this workspace',
            title: 'Update Project ID',
            value: currentProjectId || '', // Pre-fill with the current ID if available
            prompt: `Enter the new project ID for "${vscode.workspace.name || 'current workspace'}". Leave empty to cancel.`,
            validateInput: value => {
                return value && value.trim().length === 0 ? 'The project ID cannot be empty or contain only spaces.' : null;
            }
        });

        if (newProjectId === undefined || newProjectId.trim() === '') {
            vscode.window.showInformationMessage('Project ID update cancelled.');
            return;
        }

        try {
            await this.setWorkspaceProjectId(workspaceRoot, newProjectId.trim());
            vscode.window.showInformationMessage('Workspace project ID updated successfully.');
        } catch (error: any) {
            console.error("[AuthService] Failed to update Project ID via command:", error);
            vscode.window.showErrorMessage(`Failed to save project ID: ${error.message}`);
        }
    }

    // ensureApiKeyIsSet can be simplified or removed if only ensureProjectConfigurationIsSet is called
    async ensureApiKeyIsSet(): Promise<boolean> {
        const apiKey = await this.getApiKey();
        return !!apiKey; // Return simply if the key exists or not
    }
}