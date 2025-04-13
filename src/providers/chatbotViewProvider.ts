// src/providers/chatbotViewProvider.ts
import * as vscode from 'vscode';
import { ApiService } from '../api/apiService';
import { MessageDto } from '../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../dtos/result/details';
import { getProjectId } from '../utilities/config';
import { ConversationResponseDto } from '../dtos/ai/response/conversation-response.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { getChatbotHtml } from '../ui/html/chatbotHtml';

/**
 * Interface for messages exchanged between the webview and the provider.
 */
interface ChatbotMessage {
    command: 'sendMessage' | 'loadInitialData' | 'setSelectedVulnerability' | 'getInitialState';
    text?: string;
    vulnerability?: DetailedVulnerability | null;
}

/**
 * Defines the state managed by the provider and sent to the webview.
 */
interface WebviewState {
    messages: MessageDto[];
    isLoading: boolean; // General loading state (e.g., waiting for AI)
    isVulnListLoading: boolean; // Specific state for loading the vuln list
    error: string | null;
    vulnerabilities: DetailedVulnerability[];
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null;
}

/**
 * Provides the "Security Champion" chatbot webview view.
 * Manages conversation state, vulnerability context, and API interaction.
 */
export class ChatbotViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.chatbotView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _apiService: ApiService;

    // Internal state of the view
    private _state: WebviewState = {
        messages: [],
        isLoading: false,
        isVulnListLoading: false,
        error: null,
        vulnerabilities: [],
        selectedVulnerability: null,
        conversationId: null,
        projectId: getProjectId() || null
    };

    /**
     * Creates an instance of ChatbotViewProvider.
     * @param context - The extension context.
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
            this._state.error = "Project ID not configured in settings. Vulnerability context may be unavailable.";
            // No need to update webview yet, resolveWebviewView will do it.
        }
    }

    /**
     * Called by VS Code when the view needs to be resolved.
     * Sets up the webview properties, HTML content, and message listeners.
     * @param webviewView - The webview view instance being resolved.
     * @param context - Information about the state in which the view is being resolved.
     * @param _token - A cancellation token for the operation.
     */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        console.log("[ChatbotViewProvider] Resolving webview view...");
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                 vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
                 vscode.Uri.joinPath(this._extensionUri, 'media') // If needed
            ]
        };

        // Initial HTML load
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Cleanup previous listeners
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }

        // Handle messages from the webview
        const messageSubscription = webviewView.webview.onDidReceiveMessage(
            async (message: ChatbotMessage) => this._handleWebviewMessage(message),
            undefined,
            this._disposables // Add listener to disposables
        );

        // Handle view disposal
        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[ChatbotViewProvider] Webview disposed.');
            if (this._view === webviewView) this._view = undefined;
            // No need to dispose message/dispose listeners here, they are in _disposables
        }, null, this._disposables); // Also add this listener to disposables

        // Trigger initial data load *after* listeners are set up
        // The script now asks for initial state when ready
        // webviewView.webview.postMessage({ command: 'askForInitialState' }); // Consider using postMessage readiness instead
        console.log("[ChatbotViewProvider] Webview view resolved.");
    }

    /**
     * Handles messages received from the webview's JavaScript.
     * @param message - The message object from the webview.
     */
    private async _handleWebviewMessage(message: ChatbotMessage): Promise<void> {
        console.log("[ChatbotViewProvider] Message received:", message.command);
        switch (message.command) {
            case 'sendMessage':
                if (message.text) {
                    await this._handleSendMessage(message.text);
                } else {
                    console.warn("[ChatbotViewProvider] sendMessage received without text.");
                }
                return;
            case 'loadInitialData': // Triggered by the webview script on load
                 await this._loadVulnerabilities();
                return;
             case 'getInitialState': // Triggered by webview script asking for current state
                 this._notifyWebviewState();
                 return;
             case 'setSelectedVulnerability':
                 this._state.selectedVulnerability = message.vulnerability ?? null;
                 console.log("[ChatbotViewProvider] State updated - Selected Vulnerability:", this._state.selectedVulnerability?.id);
                 // Optionally notify webview if UI needs immediate feedback on selection change
                 // this._notifyWebviewState();
                 return;
        }
    }

    /**
     * Handles sending a message to the AI service (starting or continuing conversation).
     * @param text - The user's message text.
     */
    private async _handleSendMessage(text: string): Promise<void> {
        if (this._state.isLoading) {
             console.warn("[ChatbotViewProvider] Send message blocked: Already processing a message.");
             vscode.window.showWarningMessage("Please wait for the current response before sending another message.");
             return;
        }
        if (!this._state.projectId) {
            this._state.error = "Cannot send message: Project ID is not configured.";
            this._notifyWebviewState();
            return;
        }

        this._state.isLoading = true;
        this._state.error = null;
        // Add user message optimistically
        const userMessage: MessageDto = new MessageDto('user', text, new Date());
        this._state.messages.push(userMessage);
        this._notifyWebviewState(); // Update UI immediately

        try {
            let response: ConversationResponseDto;
            const isContextual = !!this._state.selectedVulnerability;

            if (this._state.conversationId) {
                // Continue existing conversation
                console.log(`[ChatbotViewProvider] Continuing conversation ${this._state.conversationId}`);
                const request = new AddMessageConversationRequestDto(
                    this._state.conversationId, text, this._state.projectId
                );
                response = await this._apiService.continueConversation(request);
            } else {
                // Start new conversation
                console.log(`[ChatbotViewProvider] Starting new conversation. Contextual: ${isContextual}`);
                const startRequest = new StartConversationRequestDto({
                    projectId: this._state.projectId,
                    isVulnerabilityConversation: isContextual,
                    vulnerabilityId: isContextual ? this._state.selectedVulnerability?.id : undefined,
                    vulnerabilityType: isContextual ? (this._state.selectedVulnerability?.vulnerability.vulnerabilityType === 'sast' ? 'sast' : 'iac') : undefined
                });

                 // Call start, then continue (assuming start doesn't take the first message)
                 const startResponse = await this._apiService.startConversation(startRequest);
                 this._state.conversationId = startResponse.conversationId;
                 this._state.messages = startResponse.messages || []; // Replace messages if API provides history on start
                 this._state.messages.push(userMessage); // Re-add user message after potential history load

                 // Send the user's first message via continueConversation
                 const continueRequest = new AddMessageConversationRequestDto(this._state.conversationId, text, this._state.projectId);
                 response = await this._apiService.continueConversation(continueRequest);
            }

            // Process response: Add AI message(s)
             if (response.messages && response.messages.length > 0) {
                 // Find messages in response newer than the last known message, or just add the last one if structure is guaranteed
                  const lastKnownMsgTimestamp = this._state.messages.length > 0 ? this._state.messages[this._state.messages.length - 1].createdAt.getTime() : 0;
                  const newAiMessages = response.messages.filter(m => m.role !== 'user' && new Date(m.createdAt).getTime() > lastKnownMsgTimestamp);

                 if(newAiMessages.length > 0) {
                      this._state.messages.push(...newAiMessages);
                 } else {
                      console.warn("[ChatbotViewProvider] Continue conversation response did not contain new AI messages.");
                      // Handle case where only conversationId might be updated?
                 }
             } else {
                 console.warn("[ChatbotViewProvider] Continue conversation response messages array is empty or missing.");
             }
             this._state.conversationId = response.conversationId; // Ensure conversation ID is up-to-date

        } catch (error: any) {
            console.error("[ChatbotViewProvider] Error during AI conversation:", error);
            this._state.error = error.message || "Failed to communicate with the Security Champion.";
            // Mark user message as failed (optional UI feedback)
            const failedUserMsg = this._state.messages.find(m => m === userMessage);
            if(failedUserMsg) failedUserMsg.content += " (Sending failed)";

        } finally {
            this._state.isLoading = false;
            // Optionally clear selected vulnerability after it's used for context
            // if (isContextual) this._state.selectedVulnerability = null;
            this._notifyWebviewState(); // Update UI with final state
        }
    }

    /**
     * Loads SAST and IaC vulnerabilities for the context selector dropdown.
     */
    private async _loadVulnerabilities(): Promise<void> {
         if (!this._state.projectId) {
             this._state.error = "Project ID is not set. Cannot load vulnerabilities.";
             this._notifyWebviewState();
             return;
         }
         if(this._state.isVulnListLoading) return; // Prevent concurrent loads

         console.log("[ChatbotViewProvider] Loading vulnerabilities for context...");
         this._state.isVulnListLoading = true;
         this._state.error = null; // Clear previous errors
         this._notifyWebviewState(); // Show loading specifically for vuln list?

         try {
             // Fetch in parallel
             const [sastResults, iacResults] = await Promise.all([
                 this._apiService.getScanResults(this._state.projectId, 'sast', { pageSizeNumber: 500 }).catch(e => { console.error("Failed to load SAST", e); return null; }),
                 this._apiService.getScanResults(this._state.projectId, 'iac', { pageSizeNumber: 500 }).catch(e => { console.error("Failed to load IAC", e); return null; })
             ]);

             // Combine results, filter out nulls if fetches failed
             this._state.vulnerabilities = [
                 ...(sastResults?.vulnerabilities || []),
                 ...(iacResults?.vulnerabilities || [])
             ].filter(v => v != null); // Filter out potential nulls if one fetch failed

             console.log(`[ChatbotViewProvider] Loaded ${this._state.vulnerabilities.length} SAST/IaC vulnerabilities.`);
         } catch (error: any) { // Catch errors not handled by individual catches
             console.error("[ChatbotViewProvider] Failed to load vulnerabilities:", error);
             this._state.error = "Failed to load vulnerabilities list.";
             this._state.vulnerabilities = []; // Ensure it's empty on error
         } finally {
             this._state.isVulnListLoading = false;
             this._notifyWebviewState(); // Send updated list (or error state) to webview
         }
     }

    /**
     * Sends the current state to the webview.
     */
    private _notifyWebviewState() {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateState', state: this._state });
            // Also update HTML directly as fallback / initial load mechanism
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /** Generates the HTML for the webview using the current state */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getChatbotHtml(webview, this.context.extensionUri, this._state);
    }

    /** Cleans up resources */
    dispose() {
        console.log("[ChatbotViewProvider] Disposing.");
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
        this._view = undefined;
    }
}