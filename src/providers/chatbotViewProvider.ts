// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/providers/chatbotViewProvider.ts
import { createEventSource, EventSourceClient } from 'eventsource-client'; // Use EventSourceClient type if available, else ReturnType
import path from 'path';
import * as vscode from 'vscode';
import { ApiService } from '../api/apiService';
import type { ProjectConfig } from '../auth/authService';
import { COMMAND_OPEN_FILE_LOCATION } from '../constants/constants';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { MessageDto } from '../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../dtos/result/details';
import { getChatbotHtml, ProviderState as HtmlProviderState, VulnerabilityInfoForWebview } from '../ui/html/chatbotHtml'; // Import ProviderState type used by HTML generator
import { getApiBaseUrl } from '../utilities/config'; // Removed getProjectId import

// --- Interfaces ---
interface WebviewCommand { command: string; text?: string; vulnerability?: DetailedVulnerability | null; vulnerabilityId?: string | null; }
interface ProviderCommand { command: string; state: StateForWebview; }

// Internal state, matches structure expected by getChatbotHtml's ProviderState
interface InternalProviderState extends HtmlProviderState {
    // Add any fields specific to the provider's internal logic if needed,
    // but try to keep it aligned with HtmlProviderState.
    isStreaming: boolean;
    limitReachedError: string | null;
    assistantStreamContent: string;
}
// State structure sent TO the webview
interface StateForWebview {
    messages: MessageDto[];
    isLoading: boolean;
    isStreaming: boolean;
    isVulnListLoading: boolean;
    error: string | null;
    limitReachedError: string | null;
    assistantStreamContent: string;
    vulnerabilities: VulnerabilityInfoForWebview[]; // Simplified for dropdown
    vulnerabilitiesFull: DetailedVulnerability[]; // Full data for JS logic
    selectedVulnerabilityId: string | null;
    conversationId: string | null;
    projectId: string | null;
}
interface SseErrorPayload { timestamp?: string; service?: string; method?: string; message: string; code: number; }
interface SsePayload { type: 'delta' | 'done' | 'error' | 'info' | 'history'; payload: any; }

// Use the specific type if available from the library, otherwise use ReturnType
type EventSourceClientInstance = EventSourceClient | ReturnType<typeof createEventSource>;

export class ChatbotViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.chatbotView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _apiService: ApiService;
    private _eventSourceInstance: EventSourceClientInstance | null = null;
    private _workspaceRoot: string | null = null;

    /** Complete internal state of the Provider */
    private _state: InternalProviderState = {
        messages: [], isLoading: false, isStreaming: false, isVulnListLoading: false,
        error: null, limitReachedError: null, assistantStreamContent: "",
        vulnerabilities: [], selectedVulnerability: null, conversationId: null,
        projectId: null // Initialized null, waits for updateConfiguration
    };

    /** Constructor */
    constructor(
        private readonly context: vscode.ExtensionContext,
        apiService: ApiService
    ) {
        this._extensionUri = context.extensionUri;
        this._apiService = apiService;
        console.log("[ChatbotViewProvider] Initialized.");
    }

    /** Initialization/Resolution of the Webview view */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // Configuration Webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                // Allow access to node_modules to load Marked and DOMPurify
                vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
                // Existing paths
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'src')
            ]
        };

        // Cleanup & Initial HTML Setup
        this.disposeSSEConnection(); // Ensure any previous connection is closed
        while (this._disposables.length) { this._disposables.pop()?.dispose(); } // Clear old listeners
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview); // Generate initial HTML

        // Setup Listeners
        webviewView.webview.onDidReceiveMessage(
            async (message: WebviewCommand) => { await this._handleWebviewMessage(message); },
            undefined, this._disposables
        );
        webviewView.onDidDispose(() => { this.handleDispose(); }, null, this._disposables);

        console.log("[ChatbotViewProvider] Webview resolved.");
        // Optionally trigger initial state notification if needed,
        // but the JS usually requests it via 'getInitialState'.
        // this._notifyWebviewState();
    }

    /** Central handler for webview commands */
    private async _handleWebviewMessage(message: WebviewCommand): Promise<void> {
        console.log(`[ChatbotViewProvider] Received command: ${message.command}`);
        switch (message.command) {
            case 'sendMessage':
                if (message.text) { await this._handleSendMessage(message.text); }
                else { console.warn("sendMessage command without text."); }
                return;
            case 'loadInitialData':
                this.refreshVulnerabilities();
                return;
            case 'getInitialState':
                this._notifyWebviewState();
                return;
            case 'setSelectedVulnerability':
                // Find the full vuln data based on the ID received (message.vulnerability might only have ID)
                const receivedVulnId = message.vulnerability?.id;
                this._state.selectedVulnerability = this._state.vulnerabilities.find(v => v.id === receivedVulnId) || null;
                console.log(`[ChatbotViewProvider] Vulnerability selection changed to: ${this._state.selectedVulnerability?.id || 'None'}`);
                this._notifyWebviewState(); // Notify webview of the change
                return;
            case 'vulnerabilitySelected':
                console.log(`[ChatbotViewProvider] Received 'vulnerabilitySelected' command for ID: ${message.vulnerabilityId || message.vulnerability?.id}`);
                const vulnerabilityId = message.vulnerabilityId || message.vulnerability?.id;
                if (vulnerabilityId && this._workspaceRoot) {
                    const selectedVuln = this._state.vulnerabilities.find(v => v.id === vulnerabilityId);

                    if (selectedVuln) {
                        this._state.selectedVulnerability = selectedVuln;
                        this._notifyWebviewState();

                        let relativeFilePath: string | undefined | null = null;
                        let lineNumber = 1;

                        const vulnType = selectedVuln.vulnerability?.vulnerabilityType;

                        if (vulnType === 'sast' || vulnType === 'iac') {
                            relativeFilePath = (selectedVuln as any).path;
                            lineNumber = (selectedVuln as any).vulnerableStartLine ?? 1;
                        } else if (vulnType === 'sca') {
                            relativeFilePath = (selectedVuln as any).scaDetectedPackage?.fileName;
                            lineNumber = 1;
                        }

                        if (relativeFilePath) {
                            const lineToShow = Math.max(1, lineNumber);
                            console.log(`[ChatbotViewProvider] Opening file for selected vulnerability. Root: ${this._workspaceRoot}, Relative: ${relativeFilePath}, Line: ${lineToShow}`);
                            vscode.commands.executeCommand(COMMAND_OPEN_FILE_LOCATION, this._workspaceRoot, relativeFilePath, lineToShow);
                        } else {
                            console.warn(`[ChatbotViewProvider] Could not determine file path for selected vulnerability ID: ${vulnerabilityId}`, selectedVuln);
                        }
                    } else {
                        console.warn(`[ChatbotViewProvider] Could not find vulnerability details in state for ID: ${vulnerabilityId}`);
                    }
                } else if (!this._workspaceRoot) {
                    console.error(`[ChatbotViewProvider] Cannot open file: Workspace root is not set.`);
                    vscode.window.showErrorMessage("Cannot open file: Workspace root configuration is missing.");
                } else {
                    console.warn(`[ChatbotViewProvider] 'vulnerabilitySelected' command received without vulnerabilityId.`);
                }
                return;
            case 'resetConversation':
                this.resetConversationState();
                return;
            default:
                console.warn(`[ChatbotViewProvider] Unknown command received: ${message.command}`);
                return;
        }
    }

    /** Handles the sending of a user message (POST -> SSE logic) */
    private async _handleSendMessage(text: string): Promise<void> {
        // Pre-conditions
        if (this._state.isLoading || this._state.isStreaming) { vscode.window.showWarningMessage("Please wait for the current response to finish."); return; }
        if (!this._state.projectId) { this._state.error = "Cannot send message: Project ID is not configured."; this._notifyWebviewState(); return; }
        if (this._state.limitReachedError) { vscode.window.showErrorMessage("Message limit reached for this conversation."); return; }

        // Prepare state
        this.disposeSSEConnection();
        this._state.isLoading = true; this._state.error = null; this._state.limitReachedError = null; this._state.assistantStreamContent = "";
        const userMessage: MessageDto = new MessageDto('user', text, new Date());
        this._state.messages = [...this._state.messages, userMessage];
        this._notifyWebviewState(); // Optimistic UI update

        // API POST call
        try {
            let conversationIdToStream: string | null = null;
            if (this._state.conversationId) { // Continue existing conversation
                const request = new AddMessageConversationRequestDto(this._state.conversationId, text, this._state.projectId);
                const response = await this._apiService.continueConversation(request);
                conversationIdToStream = response.conversationId;
            } else { // Start new conversation (potentially with vulnerability context)
                const isContextual = !!this._state.selectedVulnerability;
                const request = new StartConversationRequestDto({
                    projectId: this._state.projectId,
                    isVulnerabilityConversation: isContextual,
                    vulnerabilityId: this._state.selectedVulnerability?.id,
                    vulnerabilityType: isContextual ? (this._state.selectedVulnerability?.vulnerability?.vulnerabilityType as 'sast' | 'iac' | 'sca' | undefined) : undefined
                });
                console.log('[ChatbotViewProvider] Starting new conversation with request:', request);
                const response = await this._apiService.startConversation(request);
                this._state.conversationId = response.conversationId; // Store the new ID
                conversationIdToStream = response.conversationId;
            }

            // Start SSE stream if POST successful
            if (conversationIdToStream) {
                // Ne pas mettre isLoading à false ici pour maintenir la continuité de l'état de chargement
                // isLoading sera mis à false quand isStreaming deviendra true (dans _startSseStreamWithClientLib)
                this._startSseStreamWithClientLib(conversationIdToStream); // Non-blocking call
            } else {
                throw new Error("Failed to obtain a valid conversation ID from the API.");
            }

        } catch (error: any) { // Handle POST error
            console.error("[ChatbotViewProvider] Error during sendMessage POST phase:", error);
            this._state.error = error.message || "Failed to send message.";
            this._state.isLoading = false; this._state.isStreaming = false;
            this._notifyWebviewState();
        }
    }

    /**
     * Establishes and manages the SSE connection using 'eventsource-client'.
     * @param conversationId The ID of the conversation to stream.
     */
    private async _startSseStreamWithClientLib(conversationId: string): Promise<void> {
        // Pre-conditions
        if (!this._state.projectId) { return; }
        this.disposeSSEConnection();
        const apiKey = await this._apiService.getApiKey();
        if (!apiKey) { return; }

        const baseUrl = getApiBaseUrl();
        const sseUrl = `${baseUrl}/project/${this._state.projectId}/ai/conversation/${conversationId}/stream`;
        console.log(`[ChatbotViewProvider] Starting SSE stream for conversation ${conversationId} at ${sseUrl}`);

        // Reset streaming state
        this._state.isStreaming = false; // Will be set true on first delta
        this._state.assistantStreamContent = "";
        this._state.error = null;
        this._notifyWebviewState();

        let _streamEndedIntentionally = false;

        try {
            const options = { url: sseUrl, headers: { 'X-API-Key': apiKey }, retry: 0 };
            const es = createEventSource(options);
            this._eventSourceInstance = es;

            // Indicate streaming might start soon (though isStreaming=true happens on first delta)
            // No immediate state change needed here, wait for 'delta'

            for await (const event of es) {
                try {
                    if (typeof event.data !== 'string' || !event.data) { continue; }
                    const parsedData: SsePayload = JSON.parse(event.data);

                    switch (parsedData.type) {
                        case 'delta':
                            if (!this._state.isStreaming) {
                                this._state.isStreaming = true;
                                // Now that isStreaming is true, we can disable isLoading
                                this._state.isLoading = false;
                            }
                            this._state.assistantStreamContent += parsedData.payload;
                            this._notifyWebviewState();
                            break;
                        case 'error':
                            const errPayload = parsedData.payload as SseErrorPayload;
                            const errMsg = errPayload.message || "Unknown stream error";
                            console.error(`SSE Error Payload: ${errPayload.code} - ${errMsg}`);
                            if (errPayload.code === 403 && errMsg.toLowerCase().includes('limit reached')) { this._state.limitReachedError = errMsg; }
                            else { this._state.error = `Streaming Error (${errPayload.code || 'SSE'}): ${errMsg}`; }
                            this._state.isStreaming = false;
                            this._state.isLoading = false; // Ensure isLoading is also disabled in case of error
                            _streamEndedIntentionally = true;
                            this._notifyWebviewState();
                            this._eventSourceInstance?.close(); // Close connection on error
                            return; // Exit the loop and function
                        case 'done':
                            console.log("[ChatbotViewProvider] SSE 'done' event received.");
                            _streamEndedIntentionally = true; // Mark intentional end
                            this._eventSourceInstance?.close(); // Ensure connection is closed *before* state update
                            this._eventSourceInstance = null;
                            // Final state update happens in 'finally' block
                            return; // Exit the loop
                        case 'history':
                            if (Array.isArray(parsedData.payload) && this._state.messages.length <= 1) {
                                console.log("[ChatbotViewProvider] Received history, updating messages.");
                                // Ensure dates are Date objects if needed
                                this._state.messages = parsedData.payload.map(m => ({ ...m, createdAt: new Date(m.createdAt) }));
                                this._notifyWebviewState();
                            }
                            break;
                        case 'info':
                            console.log("[ChatbotViewProvider] SSE Info:", parsedData.payload);
                            break;
                        default:
                            console.warn("[ChatbotViewProvider] Unknown SSE message type:", parsedData.type);
                            break;
                    }
                } catch (parseError) {
                    console.error("[ChatbotViewProvider] Error parsing SSE message:", parseError, "Data:", event.data);
                    this._state.error = "Failed to parse message from AI stream.";
                    this._state.isStreaming = false;
                    this._state.isLoading = false; // Ensure isLoading is also disabled in case of parsing error
                    _streamEndedIntentionally = true; // Treat parse error as stream end
                    this._eventSourceInstance?.close();
                    this._notifyWebviewState();
                    return; // Exit the loop
                }
            }
            // Loop finished without explicit 'done' or 'error' (might indicate unexpected close)
            console.warn("[ChatbotViewProvider] SSE stream loop finished unexpectedly.");
            _streamEndedIntentionally = _streamEndedIntentionally || false; // If loop finishes, it wasn't 'done' or 'error' event path

        } catch (connectionError: any) {
            console.error("[ChatbotViewProvider] SSE Connection Error:", connectionError);
            let errorMessage = "Chat connection failed.";
            if (connectionError instanceof Error) { errorMessage = connectionError.message; }
            if (errorMessage.includes("401")) { errorMessage = "Authentication failed (401). Check API Key."; }
            if (!_streamEndedIntentionally && !this._state.limitReachedError) { // Only set error if not ended by 'done'/'error'/'limit'
                this._state.error = errorMessage;
            }
            this._state.isLoading = false; // Ensure isLoading is also disabled in case of connection error
        } finally {
            console.log("[ChatbotViewProvider] SSE stream 'finally' block executing.");
            // Add the complete streamed message if it exists and no critical error occurred
            if (this._state.assistantStreamContent.trim() && !this._state.error && !this._state.limitReachedError) {
                const finalMsg = new MessageDto('assistant', this._state.assistantStreamContent.trim(), new Date());
                const lastMsg = this._state.messages[this._state.messages.length - 1];
                // Avoid duplicating the message if already added somehow
                if (!(lastMsg?.role === 'assistant' && lastMsg.content === finalMsg.content)) {
                    this._state.messages.push(finalMsg);
                    console.log("[ChatbotViewProvider] Final assistant message added.");
                }
            }

            // Ensure connection is closed and state is reset
            if (this._eventSourceInstance) {
                this._eventSourceInstance.close();
                this._eventSourceInstance = null;
            }
            this._state.isStreaming = false; // Crucial: ensure streaming is marked as false
            this._state.isLoading = false; // Ensure isLoading is also disabled at the end
            this._state.assistantStreamContent = ""; // Clear buffer

            this._notifyWebviewState(); // Notify final state
            console.log("[ChatbotViewProvider] SSE stream processing finished.");
        }
    }

    /** Loads vulnerabilities (SAST/IaC/SCA now) */
    private async _loadVulnerabilities(): Promise<void> {
        if (!this._state.projectId) { return; }
        if (this._state.isVulnListLoading) { return; }

        console.log(`[ChatbotViewProvider] Loading vulnerabilities for project: ${this._state.projectId}`);
        this._state.isVulnListLoading = true;
        this._state.error = null;
        this._notifyWebviewState();

        try {
            // Fetch all types for the dropdown
            const [sastResults, iacResults, scaResults] = await Promise.all([
                this._apiService.getScanResults(this._state.projectId, 'sast', { pageSizeNumber: 500 }).catch(e => { console.error("SAST load failed:", e); return null; }),
                this._apiService.getScanResults(this._state.projectId, 'iac', { pageSizeNumber: 500 }).catch(e => { console.error("IaC load failed:", e); return null; }),
                this._apiService.getScanResults(this._state.projectId, 'sca', { pageSizeNumber: 500 }).catch(e => { console.error("SCA load failed:", e); return null; })
            ]);
            const combined = [
                ...(sastResults?.vulnerabilities || []),
                ...(iacResults?.vulnerabilities || []),
                ...(scaResults?.vulnerabilities || [])
            ].filter(v => v != null); // Filter nulls
            console.log(`[ChatbotViewProvider] Loaded ${combined.length} SAST/IaC/SCA vulnerabilities.`);
            this._state.vulnerabilities = combined;
            this._state.error = null;
        } catch (error: any) {
            console.error("[ChatbotViewProvider] Error caught during _loadVulnerabilities:", error);
            this._state.error = `Failed to load vulnerabilities: ${error.message}`;
            this._state.vulnerabilities = [];
        } finally {
            this._state.isVulnListLoading = false;
            this._notifyWebviewState();
        }
    }

    /**
    * Updates the provider's configuration state.
    * @param config The project configuration from extension.ts
    */
    public updateConfiguration(config: ProjectConfig | null): void {
        const oldProjectId = this._state.projectId;
        const newProjectId = config?.projectId ?? null;
        const oldWorkspaceRoot = this._workspaceRoot;
        const newWorkspaceRoot = config?.workspaceRoot ?? null;

        console.log(`[ChatbotViewProvider] Updating configuration. Old PID: ${oldProjectId}, New PID: ${newProjectId}. Old Root: ${oldWorkspaceRoot}, New Root: ${newWorkspaceRoot}`);

        this._state.projectId = newProjectId;
        this._workspaceRoot = newWorkspaceRoot;

        if (newProjectId !== oldProjectId || newWorkspaceRoot !== oldWorkspaceRoot) {
            console.log("[ChatbotViewProvider] Project ID or Workspace Root changed, resetting conversation and vulnerability list.");
            this.resetConversationState();
            this._state.vulnerabilities = [];
            this._state.selectedVulnerability = null;
            if (newProjectId && this._view) {
                this.refreshVulnerabilities();
            } else {
                this._state.error = newProjectId ? null : "Project not configured.";
                this._notifyWebviewState();
            }
        } else {
            this._notifyWebviewState();
        }
    }

    /** Triggers reloading of the vulnerability list */
    public refreshVulnerabilities(): void {
        console.log(`[ChatbotViewProvider] refreshVulnerabilities called. View exists: ${!!this._view}, ProjectId: ${this._state.projectId}, Not Loading: ${!this._state.isVulnListLoading}`);
        if (this._view && this._state.projectId && !this._state.isVulnListLoading) {
            this._loadVulnerabilities();
        }
    }

    // --- Helper Methods (internal) ---
    private _prepareVulnerabilitiesForWebview(fullVulnerabilities: DetailedVulnerability[]): VulnerabilityInfoForWebview[] {
        return (fullVulnerabilities || [])
            .filter(v => v?.vulnerability?.vulnerabilityType === 'sast' || v?.vulnerability?.vulnerabilityType === 'iac' || v?.vulnerability?.vulnerabilityType === 'sca')
            .map(vuln => {
                let fullPath = '';
                if (vuln && 'path' in vuln && typeof vuln.path === 'string') { fullPath = vuln.path; }
                else if (vuln && 'scaFilePath' in vuln && typeof vuln.scaFilePath === 'string') { fullPath = vuln.scaFilePath; } // Handle SCA path

                const shortPath = fullPath ? path.basename(fullPath) : '(path unknown)';
                const type = vuln.vulnerability.vulnerabilityType as 'sast' | 'iac' | 'sca';
                const name = type === 'sca'
                    ? `${vuln.vulnerability?.name || vuln.id}`
                    : (vuln.vulnerability?.name || vuln.id);

                return { id: vuln.id, name: name, type: type, fullPath: fullPath, shortPath: shortPath };
            });
    }

    private _notifyWebviewState() {
        if (!this._view?.webview) { return; }
        const currentState = this._state;
        const simplifiedVulns = this._prepareVulnerabilitiesForWebview(currentState.vulnerabilities);

        // Ensure all necessary fields are present
        const statePayload: StateForWebview = {
            messages: currentState.messages,
            isLoading: currentState.isLoading,
            isStreaming: currentState.isStreaming,
            isVulnListLoading: currentState.isVulnListLoading,
            error: currentState.error,
            limitReachedError: currentState.limitReachedError,
            assistantStreamContent: currentState.assistantStreamContent,
            vulnerabilities: simplifiedVulns,
            vulnerabilitiesFull: currentState.vulnerabilities, // Send full data for JS logic if needed
            selectedVulnerabilityId: currentState.selectedVulnerability?.id || null,
            conversationId: currentState.conversationId,
            projectId: currentState.projectId
        };
        const command: ProviderCommand = { command: 'updateState', state: statePayload };
        // console.log("[ChatbotViewProvider] Posting state to webview:", statePayload); // Debug log
        this._view.webview.postMessage(command);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Pass the internal state which matches the ProviderState expected by getChatbotHtml
        return getChatbotHtml(webview, this.context.extensionUri, this._state);
    }

    private disposeSSEConnection() {
        if (this._state.isStreaming && this._state.assistantStreamContent.trim()) {
            this._state.isStreaming = false;
            this._state.assistantStreamContent = "";
            this._notifyWebviewState();
        }
        if (this._eventSourceInstance) {
            this._eventSourceInstance.close();
            this._eventSourceInstance = null;
            console.log("[ChatbotViewProvider] SSE connection closed.");
        }
        if (this._state.isStreaming || this._state.assistantStreamContent) {
            this._state.isStreaming = false;
            this._state.assistantStreamContent = "";
        }
    }

    public resetConversationState() {
        console.log("[ChatbotViewProvider] Resetting conversation state.");
        this.disposeSSEConnection();
        this._state.messages = []; this._state.conversationId = null; this._state.error = null;
        this._state.limitReachedError = null; this._state.selectedVulnerability = null;
        this._state.isLoading = false; this._state.isStreaming = false; this._state.assistantStreamContent = "";
        // Don't reset vulnerabilities list here, only conversation state
        this._notifyWebviewState(); // Notify webview of reset
    }

    private handleDispose() {
        console.log("[ChatbotViewProvider] Disposing.");
        this.disposeSSEConnection();
        this._view = undefined;
    }

    dispose() {
        this.handleDispose();
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
    }
}