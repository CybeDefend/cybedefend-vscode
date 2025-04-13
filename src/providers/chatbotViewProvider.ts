// src/providers/chatbotViewProvider.ts
import * as vscode from 'vscode';
import path from 'path'; // Nécessaire pour _prepareVulnerabilitiesForWebview
import { ApiService } from '../api/apiService';
import { MessageDto } from '../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../dtos/result/details';
import { getProjectId } from '../utilities/config';
import { ConversationResponseDto } from '../dtos/ai/response/conversation-response.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { getChatbotHtml, VulnerabilityInfoForWebview } from '../ui/html/chatbotHtml'; // Importer l'interface

/**
 * Interface for messages exchanged between the webview and the provider.
 */
interface ChatbotMessage {
    command: 'sendMessage' | 'loadInitialData' | 'setSelectedVulnerability' | 'getInitialState';
    text?: string;
    /** Can be the full DetailedVulnerability object or null */
    vulnerability?: DetailedVulnerability | null;
}

/**
 * Defines the state managed by the provider.
 * This is the internal state, which will be transformed before sending to the webview.
 */
interface InternalProviderState {
    messages: MessageDto[];
    isLoading: boolean; // General loading state (e.g., waiting for AI)
    isVulnListLoading: boolean; // Specific state for loading the vuln list
    error: string | null;
    /** Stores the full list of vulnerabilities fetched from the API */
    vulnerabilities: DetailedVulnerability[];
    /** Stores the currently selected full vulnerability object, or null */
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null;
}

/**
 * Defines the structure of the state object sent TO the webview via postMessage.
 * Includes both simplified and full vulnerability lists.
 */
interface StateForWebview {
    messages: MessageDto[];
    isLoading: boolean;
    isVulnListLoading: boolean;
    error: string | null;
    /** Simplified list for the dropdown */
    vulnerabilities: VulnerabilityInfoForWebview[];
    /** Full list for context lookup */
    vulnerabilitiesFull: DetailedVulnerability[];
    /** ID of the selected vulnerability (or null) */
    selectedVulnerabilityId: string | null;
    conversationId: string | null;
    projectId: string | null;
}


/**
 * Provides the "Security Champion" chatbot webview view.
 * Manages conversation state, vulnerability context, and API interaction.
 * Implements vscode.WebviewViewProvider to integrate with the VS Code UI.
 * Implements vscode.Disposable to handle resource cleanup.
 */
export class ChatbotViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.chatbotView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _apiService: ApiService;

    /** Internal state of the view provider */
    private _state: InternalProviderState = {
        messages: [],
        isLoading: false,
        isVulnListLoading: false,
        error: null,
        vulnerabilities: [], // Start with empty full list
        selectedVulnerability: null, // Start with no selection
        conversationId: null,
        projectId: getProjectId() || null
    };

    /**
     * Creates an instance of ChatbotViewProvider.
     * @param context - The extension context provided by VS Code.
     * @param apiService - The ApiService instance for backend communication.
     */
    constructor(
        private readonly context: vscode.ExtensionContext,
        apiService: ApiService
    ) {
        this._extensionUri = context.extensionUri;
        this._apiService = apiService;
        console.log("[ChatbotViewProvider] Initialized.");
        if (!this._state.projectId) {
            console.warn("[ChatbotViewProvider] Project ID not configured.");
            // Set error state that will be shown when the view resolves
            this._state.error = "Project ID not configured in settings. Vulnerability context may be unavailable.";
        }
    }

    /**
     * Called by VS Code when the view needs to be resolved (e.g., when the user opens it).
     * Sets up the webview properties, initial HTML content, and message listeners.
     * @param webviewView - The webview view instance being resolved.
     * @param _context - Information about the state in which the view is being resolved (unused here).
     * @param _token - A cancellation token for the operation (unused here).
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[ChatbotViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
                vscode.Uri.joinPath(this._extensionUri, 'media'), // Standard media folder
                vscode.Uri.joinPath(this._extensionUri, 'dist') // Allow access to bundled JS/CSS if needed
            ]
        };

        // Initial HTML load using the current state
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // --- Setup Message Listener ---
        // Dispose previous listeners if any
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }

        // Handle messages received from the webview's JavaScript
        const messageSubscription = webviewView.webview.onDidReceiveMessage(
            async (message: ChatbotMessage) => {
                console.log("[ChatbotViewProvider] Message received from webview:", message.command);
                await this._handleWebviewMessage(message);
            },
            undefined, // Use default this context
            this._disposables // Add listener to our disposables array for cleanup
        );

        // --- Setup View Disposal Handler ---
        // Handle cleanup when the view is closed by the user or VS Code
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[ChatbotViewProvider] Webview disposed.');
            if (this._view === webviewView) {
                this._view = undefined;
            }
            // The main dispose method will handle cleaning up listeners in _disposables
        }, null, this._disposables); // Also add this listener to disposables

        console.log("[ChatbotViewProvider] Webview view resolved and listeners attached.");
        // The webview script will request initial data ('loadInitialData') if needed.
    }

    /**
     * Handles messages received from the webview's JavaScript.
     * @param message - The message object from the webview.
     */
    private async _handleWebviewMessage(message: ChatbotMessage): Promise<void> {
        switch (message.command) {
            case 'sendMessage':
                if (message.text) {
                    // Note: We don't need message.vulnerability here anymore,
                    // as the selection is stored in this._state.selectedVulnerability
                    await this._handleSendMessage(message.text);
                } else {
                    console.warn("[ChatbotViewProvider] sendMessage received without text.");
                }
                return;

            case 'loadInitialData': // Triggered by the webview script on load if data is missing
                if (!this._state.vulnerabilities.length && !this._state.isVulnListLoading) {
                     await this._loadVulnerabilities();
                } else {
                     console.log("[ChatbotViewProvider] Skipping loadInitialData: Data already present or loading.");
                      // Ensure the webview has the current state even if we don't load
                      this._notifyWebviewState();
                }
                return;

            case 'getInitialState': // Optional: If webview explicitly asks for state after load
                this._notifyWebviewState();
                return;

            case 'setSelectedVulnerability':
                // Update the internal state with the full vulnerability object (or null)
                this._state.selectedVulnerability = message.vulnerability ?? null;
                console.log("[ChatbotViewProvider] State updated - Selected Vulnerability ID:", this._state.selectedVulnerability?.id ?? 'None');
                // No need to notify webview immediately, selection context will be used on next sendMessage
                // Or, if immediate UI feedback is desired *in the webview* upon selection, notify here:
                // this._notifyWebviewState();
                return;

            default:
                console.warn("[ChatbotViewProvider] Received unknown command:", message.command);
                return;
        }
    }

    /**
     * Handles sending a message to the AI service.
     * Manages starting a new conversation or continuing an existing one.
     * Updates the state based on the API response.
     * @param text - The user's message text.
     */
    private async _handleSendMessage(text: string): Promise<void> {
        if (this._state.isLoading) {
            console.warn("[ChatbotViewProvider] Send message blocked: Already processing.");
            vscode.window.showWarningMessage("Please wait for the current response.");
            return;
        }
        if (!this._state.projectId) {
            this._state.error = "Cannot send message: Project ID is not configured.";
            this._notifyWebviewState(); // Notify UI about the error
            return;
        }

        this._state.isLoading = true;
        this._state.error = null; // Clear previous errors

        // 1. Optimistic UI update: Add user message
        const userMessage: MessageDto = new MessageDto('user', text, new Date());
        // Create a temporary state for the optimistic update to avoid mutating _state directly yet
        const optimisticMessages = [...this._state.messages, userMessage];
        this._notifyWebviewState({ messages: optimisticMessages, isLoading: true, error: null }); // Show user msg + loading

        try {
            let finalApiResponse: ConversationResponseDto;
            const isContextual = !!this._state.selectedVulnerability; // Check internal state

            if (this._state.conversationId) {
                // --- Continue existing conversation ---
                console.log(`[ChatbotViewProvider] Continuing conversation ${this._state.conversationId}`);
                const request = new AddMessageConversationRequestDto(
                    this._state.conversationId, text, this._state.projectId
                );
                finalApiResponse = await this._apiService.continueConversation(request);

            } else {
                // --- Start new conversation ---
                console.log(`[ChatbotViewProvider] Starting new conversation. Contextual: ${isContextual}`);
                const startRequest = new StartConversationRequestDto({
                    projectId: this._state.projectId,
                    isVulnerabilityConversation: isContextual,
                    vulnerabilityId: this._state.selectedVulnerability?.id, // Use ID from state
                    vulnerabilityType: this._state.selectedVulnerability?.vulnerability?.vulnerabilityType as ('sast' | 'iac' | undefined)
                });

                // a) Start the conversation to get the ID
                const startResponse = await this._apiService.startConversation(startRequest);
                if (!startResponse?.conversationId) {
                    throw new Error("Failed to start conversation: No conversation ID received.");
                }
                this._state.conversationId = startResponse.conversationId; // Store the new ID

                // b) Send the *first* user message using continueConversation endpoint
                console.log(`[ChatbotViewProvider] Sending first message to new conversation ${this._state.conversationId}`);
                const continueRequest = new AddMessageConversationRequestDto(
                    this._state.conversationId, text, this._state.projectId
                );
                finalApiResponse = await this._apiService.continueConversation(continueRequest);
            }

            // --- Process final API response ---
            // The API response is the source of truth for messages and conversation ID
            this._state.messages = finalApiResponse?.messages || []; // Replace local messages
            this._state.conversationId = finalApiResponse?.conversationId || this._state.conversationId; // Ensure ID is current

            // Optionally: Clear selection after successful contextual message
            // if (isContextual) {
            //     this._state.selectedVulnerability = null;
            // }

        } catch (error: any) {
            console.error("[ChatbotViewProvider] Error during AI conversation:", error);
            this._state.error = error.message || "Failed to communicate with the Security Champion.";
            // On error, revert messages to the optimistic state? Or keep empty?
            // Let's keep the user message + show error for context.
            this._state.messages = optimisticMessages;
        } finally {
            this._state.isLoading = false;
            // Notify the webview with the final authoritative state (messages, loading=false, error?)
            this._notifyWebviewState();
        }
    }

    /**
     * Loads SAST and IaC vulnerabilities for the context selector dropdown.
     * Updates the internal state (`vulnerabilities`) and notifies the webview.
     */
    private async _loadVulnerabilities(): Promise<void> {
        if (!this._state.projectId) {
            this._state.error = "Project ID is not set. Cannot load vulnerabilities.";
            console.warn("[ChatbotViewProvider] Cannot load vulnerabilities: Project ID missing.");
            this._notifyWebviewState();
            return;
        }
        if (this._state.isVulnListLoading) {
            console.log("[ChatbotViewProvider] Vulnerability load already in progress.");
            return; // Prevent concurrent loads
        }

        console.log("[ChatbotViewProvider] Loading vulnerabilities for context...");
        this._state.isVulnListLoading = true;
        this._state.error = null; // Clear previous errors related to loading
        this._notifyWebviewState(); // Notify UI: vuln list is loading

        try {
            // Fetch SAST and IaC results in parallel
            const [sastResults, iacResults] = await Promise.all([
                this._apiService.getScanResults(this._state.projectId, 'sast', { pageSizeNumber: 500 })
                    .catch(e => { console.error("Failed to load SAST results:", e); return null; }), // Gracefully handle individual failures
                this._apiService.getScanResults(this._state.projectId, 'iac', { pageSizeNumber: 500 })
                    .catch(e => { console.error("Failed to load IaC results:", e); return null; })
            ]);

            // Combine results, filter out nulls and ensure vulnerabilities array exists
            const combinedVulnerabilities = [
                ...(sastResults?.vulnerabilities || []),
                ...(iacResults?.vulnerabilities || [])
            ].filter(v => v != null); // Filter out potential nulls if a fetch failed

            this._state.vulnerabilities = combinedVulnerabilities; // Update internal state with full list
            console.log(`[ChatbotViewProvider] Loaded ${this._state.vulnerabilities.length} SAST/IaC vulnerabilities.`);

        } catch (error: any) { // Catch errors not handled by individual catches (e.g., Promise.all itself)
            console.error("[ChatbotViewProvider] Failed to load vulnerabilities:", error);
            this._state.error = "Failed to load vulnerabilities list.";
            this._state.vulnerabilities = []; // Ensure list is empty on error
        } finally {
            this._state.isVulnListLoading = false;
            // Notify webview with the updated list (or error state) and loading=false
            this._notifyWebviewState();
        }
    }

    /**
     * Prepares the simplified vulnerability list suitable for the webview dropdown.
     * @param fullVulnerabilities - The list of DetailedVulnerability objects.
     * @returns An array of VulnerabilityInfoForWebview objects.
     */
    private _prepareVulnerabilitiesForWebview(fullVulnerabilities: DetailedVulnerability[]): VulnerabilityInfoForWebview[] {
        // Note: HTML escaping should happen in getChatbotHtml before injection
        return (fullVulnerabilities || [])
            .filter(v => v?.vulnerability?.vulnerabilityType === 'sast' || v?.vulnerability?.vulnerabilityType === 'iac')
            .map(vuln => {
                let fullPath = '';
                // Safely access path property
                if (vuln && typeof vuln === 'object' && 'path' in vuln && vuln.path) {
                    fullPath = vuln.path;
                }
                const shortPath = fullPath ? path.basename(fullPath) : '(path unknown)';
                return {
                    id: vuln.id,
                    // Raw values here, escaping done in getChatbotHtml
                    name: vuln.vulnerability?.name || vuln.id,
                    type: vuln.vulnerability.vulnerabilityType as 'sast' | 'iac',
                    fullPath: fullPath,
                    shortPath: shortPath
                };
            });
    }

    /**
     * Sends the current state (or a partial update) to the webview via `postMessage`.
     * Transforms the internal state into the `StateForWebview` format.
     * @param partialState - Optional partial state to merge for optimistic updates.
     */
    private _notifyWebviewState(partialState: Partial<InternalProviderState> = {}) {
        if (this._view?.webview) {
             // Merge partial state with current internal state
            const mergedInternalState = { ...this._state, ...partialState };

            // Prepare the payload for the webview
            const simplifiedVulns = this._prepareVulnerabilitiesForWebview(mergedInternalState.vulnerabilities);

            const statePayloadForPostMessage: StateForWebview = {
                messages: mergedInternalState.messages,
                isLoading: mergedInternalState.isLoading,
                isVulnListLoading: mergedInternalState.isVulnListLoading,
                error: mergedInternalState.error,
                vulnerabilities: simplifiedVulns, // Send the prepared simplified list
                vulnerabilitiesFull: mergedInternalState.vulnerabilities, // Send the full list separately
                selectedVulnerabilityId: mergedInternalState.selectedVulnerability?.id || null, // Send only the ID
                conversationId: mergedInternalState.conversationId,
                projectId: mergedInternalState.projectId
            };

            // Post the message to the webview's script
            console.log("[ChatbotViewProvider] Notifying webview state.");
            this._view.webview.postMessage({ command: 'updateState', state: statePayloadForPostMessage });
        } else {
            console.warn("[ChatbotViewProvider] Cannot notify webview: View not available.");
        }
    }

    /**
     * Generates the complete HTML content for the webview.
     * This is used for the initial load and potentially for full refreshes if needed.
     * @param webview - The webview instance.
     * @returns The HTML string.
     */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        console.log("[ChatbotViewProvider] Generating HTML for webview.");
        // Pass the current internal state to the HTML generation function.
        // getChatbotHtml will handle preparing the initial JS state based on this.
        return getChatbotHtml(webview, this.context.extensionUri, this._state);
    }

    /**
     * Cleans up resources when the provider is disposed (e.g., extension deactivation).
     * Disposes all registered disposables (listeners).
     */
    dispose() {
        console.log("[ChatbotViewProvider] Disposing.");
        // Dispose all disposables registered in the _disposables array
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
        this._view = undefined; // Clear reference to the view
    }
}