// src/providers/chatbotViewProvider.ts
import * as vscode from 'vscode';
import path from 'path';
// --- Nouvelle Bibliothèque SSE ---
import { createEventSource } from 'eventsource-client';
// ---------------------------------
import { ApiService, InitiateConversationResponse } from '../api/apiService';
import { MessageDto } from '../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../dtos/result/details';
import { getProjectId, getApiBaseUrl } from '../utilities/config';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { getChatbotHtml, VulnerabilityInfoForWebview } from '../ui/html/chatbotHtml';

// --- Interfaces (inchangées) ---
interface WebviewCommand { command: string; text?: string; vulnerability?: DetailedVulnerability | null; }
interface ProviderCommand { command: string; state: StateForWebview; }
interface InternalProviderState { messages: MessageDto[]; isLoading: boolean; isStreaming: boolean; isVulnListLoading: boolean; error: string | null; limitReachedError: string | null; assistantStreamContent: string; vulnerabilities: DetailedVulnerability[]; selectedVulnerability: DetailedVulnerability | null; conversationId: string | null; projectId: string | null; }
interface StateForWebview { messages: MessageDto[]; isLoading: boolean; isStreaming: boolean; isVulnListLoading: boolean; error: string | null; limitReachedError: string | null; assistantStreamContent: string; vulnerabilities: VulnerabilityInfoForWebview[]; vulnerabilitiesFull: DetailedVulnerability[]; selectedVulnerabilityId: string | null; conversationId: string | null; projectId: string | null; }
interface SseErrorPayload { timestamp?: string; service?: string; method?: string; message: string; code: number; }
interface SsePayload { type: 'delta' | 'done' | 'error' | 'info' | 'history'; payload: any; }
// Pas besoin de EventSourceErrorEvent spécifique avec cette approche

// Define a type alias for the instance returned by the factory
type EventSourceClientInstance = ReturnType<typeof createEventSource>;

/**
 * Fournit la vue webview "Security Champion".
 * Utilise 'eventsource-client' pour le streaming SSE.
 */
export class ChatbotViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.chatbotView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _apiService: ApiService;
    // Stocke l'instance retournée par createEventSource (qui a une méthode close)
    // Utilisation du type EventSource importé depuis 'eventsource-client'
    private _eventSourceInstance: EventSourceClientInstance | null = null;

    /** État interne complet du Provider */
    private _state: InternalProviderState = {
        messages: [], isLoading: false, isStreaming: false, isVulnListLoading: false,
        error: null, limitReachedError: null, assistantStreamContent: "",
        vulnerabilities: [], selectedVulnerability: null, conversationId: null,
        projectId: getProjectId() || null
    };

    /** Constructeur */
    constructor(
        private readonly context: vscode.ExtensionContext,
        apiService: ApiService
    ) {
        this._extensionUri = context.extensionUri;
        this._apiService = apiService;
        if (!this._state.projectId) {
            console.warn("[ChatbotViewProvider] Project ID not configured.");
            this._state.error = "Project ID not configured in VS Code settings.";
        }
    }

    /** Initialisation/Résolution de la vue Webview */
    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext<unknown>,
        _token: vscode.CancellationToken
    ): void | Thenable<void> {
        this._view = webviewView;

        // Configuration Webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [ /* ... chemins ... */
                vscode.Uri.joinPath(this._extensionUri, 'node_modules'),
                vscode.Uri.joinPath(this._extensionUri, 'media'),
                vscode.Uri.joinPath(this._extensionUri, 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'src')
            ]
        };

        // Nettoyage & Initialisation HTML
        this.disposeSSEConnection();
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Listeners
        webviewView.webview.onDidReceiveMessage(
            async (message: WebviewCommand) => { await this._handleWebviewMessage(message); },
            undefined, this._disposables
        );
        webviewView.onDidDispose(() => { this.handleDispose(); }, null, this._disposables);

    }

    /** Gestionnaire central des commandes webview */
    private async _handleWebviewMessage(message: WebviewCommand): Promise<void> {
        switch (message.command) {
            case 'sendMessage':
                if (message.text) { await this._handleSendMessage(message.text); }
                else { console.warn("sendMessage command without text."); }
                return;
            case 'loadInitialData':
                if (this._state.projectId && !this._state.vulnerabilities.length && !this._state.isVulnListLoading) {
                    await this._loadVulnerabilities();
                } else { this._notifyWebviewState(); }
                return;
            case 'getInitialState':
                this._notifyWebviewState();
                return;
            case 'setSelectedVulnerability':
                this._state.selectedVulnerability = message.vulnerability ?? null;
                this._notifyWebviewState();
                return;
            case 'resetConversation':
                this.resetConversationState();
                return;
            default:
                console.warn(`Unknown command: ${message.command}`);
                return;
        }
    }

    /** Gère l'envoi d'un message utilisateur (logique POST -> SSE) */
    private async _handleSendMessage(text: string): Promise<void> {
        // Pré-conditions
        if (this._state.isLoading || this._state.isStreaming) { vscode.window.showWarningMessage("Please wait..."); return; }
        if (!this._state.projectId) { this._state.error = "Project ID missing."; this._notifyWebviewState(); return; }
        if (this._state.limitReachedError) { return; }

        // Préparation état
        this.disposeSSEConnection();
        this._state.isLoading = true; this._state.error = null; this._state.limitReachedError = null; this._state.assistantStreamContent = "";
        const userMessage: MessageDto = new MessageDto('user', text, new Date());
        this._state.messages = [...this._state.messages, userMessage];
        this._notifyWebviewState(); // MàJ optimiste

        // Appel API POST
        try {
            let conversationIdToStream: string | null = null;
            if (this._state.conversationId) { // Continuer
                const request = new AddMessageConversationRequestDto(this._state.conversationId, text, this._state.projectId);
                const response = await this._apiService.continueConversation(request);
                conversationIdToStream = response.conversationId;
            } else { // Démarrer
                const isContextual = !!this._state.selectedVulnerability;
                const request = new StartConversationRequestDto({
                    projectId: this._state.projectId,
                    isVulnerabilityConversation: isContextual,
                    vulnerabilityId: this._state.selectedVulnerability?.id,
                    vulnerabilityType: (isContextual && (this._state.selectedVulnerability?.vulnerability?.vulnerabilityType === 'sast' || this._state.selectedVulnerability?.vulnerability?.vulnerabilityType === 'iac' || this._state.selectedVulnerability?.vulnerability?.vulnerabilityType === 'sca'))
                        ? this._state.selectedVulnerability.vulnerability.vulnerabilityType : undefined
                });
                const response = await this._apiService.startConversation(request);
                this._state.conversationId = response.conversationId;
                conversationIdToStream = response.conversationId;
            }

            // Démarrer SSE si POST OK
            if (conversationIdToStream) {
                this._state.isLoading = false; this._notifyWebviewState();
                // Utilisation de la nouvelle méthode avec 'eventsource-client'
                this._startSseStreamWithClientLib(conversationIdToStream); // Note: ne pas await ici car la boucle tourne en arrière-plan
            } else { throw new Error("Failed to obtain conversation ID."); }

        } catch (error: any) { // Erreur pendant POST
            console.error("[ChatbotViewProvider] Error during sendMessage POST phase:", error);
            this._state.error = error.message || "Failed to send message.";
            this._state.isLoading = false; this._state.isStreaming = false;
            this._notifyWebviewState();
        }
    }

    /**
     * Établit et gère la connexion SSE en utilisant 'eventsource-client'.
     * Utilise un itérateur asynchrone pour traiter les messages.
     * @param conversationId L'ID de la conversation à streamer.
     */
    private async _startSseStreamWithClientLib(conversationId: string): Promise<void> {
        if (!this._state.projectId) { this._state.error = "Cannot connect: Project ID missing."; this._notifyWebviewState(); return; }
        this.disposeSSEConnection(); // Ferme connexion précédente
        const apiKey = await this._apiService.getApiKey();
        if (!apiKey) { this._state.error = "Cannot connect: API Key missing."; this._notifyWebviewState(); return; }

        const baseUrl = getApiBaseUrl();
        const sseUrl = `${baseUrl}/project/${this._state.projectId}/ai/conversation/${conversationId}/stream`;

        // Reset état streaming
        this._state.isStreaming = false; // Sera mis à true au premier delta reçu
        this._state.assistantStreamContent = "";
        this._state.error = null;
        this._notifyWebviewState();

        let _streamEndedIntentionally = false;

        try {
            const options = {
                url: sseUrl,
                headers: { 'X-API-Key': apiKey },
                retry: 0
            };
            const es = createEventSource(options);
            this._eventSourceInstance = es;

            this._state.isStreaming = true; 
            this._notifyWebviewState();

            for await (const event of es) {
                 try {
                    if (typeof event.data !== 'string' || !event.data) {
                        console.warn("[ChatbotViewProvider] SSE received non-string or empty data:", event.data);
                        continue; // Ignorer cet événement
                    }

                    const parsedData: SsePayload = JSON.parse(event.data);

                    switch (parsedData.type) {
                        case 'delta':
                            if (!this._state.isStreaming) { this._state.isStreaming = true; }
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
                            _streamEndedIntentionally = true;
                            this._notifyWebviewState();
                            return;
                        case 'done':
                             this._eventSourceInstance?.close(); // <<< Close FIRST
                            _streamEndedIntentionally = true;
                             this._state.isStreaming = false; // <<< Set state AFTER close
                             this._notifyWebviewState();      // <<< Notify AFTER close
                             break; // <<< Exit the 'for await' loop explicitly
                        case 'history': 
                            if (Array.isArray(parsedData.payload) && this._state.messages.length <= 1) {
                                this._state.messages = parsedData.payload;
                                this._notifyWebviewState();
                            }
                            break;
                        case 'info': 
                            break;
                        default: 
                            break;
                    }
                 } catch (parseError) {
                     this._state.error = "Failed to parse message.";
                     this._state.isStreaming = false;
                     this._notifyWebviewState();
                     _streamEndedIntentionally = true;
                     this._eventSourceInstance?.close();
                     return; 
                 }
            }

        } catch (connectionError: any) {
             let errorMessage = "Chat connection failed.";
             if (connectionError instanceof Error) { errorMessage = connectionError.message; }
             if (errorMessage.includes("401")) { errorMessage = "Authentication failed (401)."; }
             if (!_streamEndedIntentionally) {
                if (!this._state.limitReachedError) { this._state.error = errorMessage; }
             }
        } finally {
             if (this._state.assistantStreamContent.trim() && !this._state.error && !this._state.limitReachedError) {
                const finalMsg = new MessageDto('assistant', this._state.assistantStreamContent.trim(), new Date());
                const lastMsg = this._state.messages[this._state.messages.length - 1];
                if (!(lastMsg?.role === 'assistant' && lastMsg.content === finalMsg.content)) { this._state.messages.push(finalMsg); }
             }
            
             if (this._eventSourceInstance) {
                this._eventSourceInstance.close(); // Ensure closure if not already done
                this._eventSourceInstance = null;
             }

             this._state.isStreaming = false; // Assure que c'est false
             this._state.assistantStreamContent = "";

             this._notifyWebviewState(); 
        }
    }

    /** Charge les vulnérabilités (SAST/IaC) */
    private async _loadVulnerabilities(): Promise<void> {
        if (!this._state.projectId || this._state.isVulnListLoading) return;
        this._state.isVulnListLoading = true; this._state.error = null;
        this._notifyWebviewState();
        try {
            const [sastResults, iacResults] = await Promise.all([
                this._apiService.getScanResults(this._state.projectId, 'sast', { pageSizeNumber: 500 }).catch(e => { console.error("SAST load failed:", e); return null; }),
                this._apiService.getScanResults(this._state.projectId, 'iac', { pageSizeNumber: 500 }).catch(e => { console.error("IaC load failed:", e); return null; })
            ]);
            const combined = [...(sastResults?.vulnerabilities || []), ...(iacResults?.vulnerabilities || [])].filter(v => v != null);
            this._state.vulnerabilities = combined;
        } catch (error: any) {
            console.error("[ChatbotViewProvider] Error loading vulnerabilities:", error);
            this._state.error = "Failed to load vulnerabilities list."; this._state.vulnerabilities = [];
        } finally {
            this._state.isVulnListLoading = false; this._notifyWebviewState();
        }
    }

    /** Prépare la liste simplifiée pour le dropdown */
    private _prepareVulnerabilitiesForWebview(fullVulnerabilities: DetailedVulnerability[]): VulnerabilityInfoForWebview[] {
        return (fullVulnerabilities || [])
            .filter(v => v?.vulnerability?.vulnerabilityType === 'sast' || v?.vulnerability?.vulnerabilityType === 'iac' || v?.vulnerability?.vulnerabilityType === 'sca')
            .map(vuln => {
                let fullPath = '';
                // Vérification type-safe de 'path'
                if (vuln && 'path' in vuln && typeof vuln.path === 'string') { fullPath = vuln.path; }
                const shortPath = fullPath ? path.basename(fullPath) : '(path unknown)';
                return { id: vuln.id, name: vuln.vulnerability?.name || vuln.id, type: vuln.vulnerability.vulnerabilityType as 'sast' | 'iac' | 'sca', fullPath: fullPath, shortPath: shortPath };
            });
    }

    /** Notifie l'état complet à la Webview */
    private _notifyWebviewState() {
        if (!this._view?.webview) { return; }
        const currentState = this._state;
        const simplifiedVulns = this._prepareVulnerabilitiesForWebview(currentState.vulnerabilities);
        const statePayload: StateForWebview = {
            messages: currentState.messages, isLoading: currentState.isLoading, isStreaming: currentState.isStreaming,
            isVulnListLoading: currentState.isVulnListLoading, error: currentState.error, limitReachedError: currentState.limitReachedError,
            assistantStreamContent: currentState.assistantStreamContent, vulnerabilities: simplifiedVulns,
            vulnerabilitiesFull: currentState.vulnerabilities, selectedVulnerabilityId: currentState.selectedVulnerability?.id || null,
            conversationId: currentState.conversationId, projectId: currentState.projectId
         };
        const command: ProviderCommand = { command: 'updateState', state: statePayload };
        this._view.webview.postMessage(command);
    }

    /** Génère le HTML */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        return getChatbotHtml(webview, this.context.extensionUri, this._state);
    }

    /** Ferme la connexion SSE et finalise le message si nécessaire */
    private disposeSSEConnection() {
        // Finaliser message si un stream était en cours au moment de l'appel
        if (this._state.isStreaming && this._state.assistantStreamContent.trim()) {
            const finalMsg = new MessageDto('assistant', this._state.assistantStreamContent.trim(), new Date());
            const lastMsg = this._state.messages[this._state.messages.length - 1];
            if (!(lastMsg?.role === 'assistant' && lastMsg.content === finalMsg.content)) { this._state.messages.push(finalMsg); }
        }
        // Fermer connexion `eventsource-client`
        if (this._eventSourceInstance) {
            this._eventSourceInstance.close(); // Utiliser la méthode close() de l'instance
            this._eventSourceInstance = null;
        }
        // Reset état streaming et notifier si l'état était actif
        if (this._state.isStreaming || this._state.assistantStreamContent) {
            this._state.isStreaming = false; this._state.assistantStreamContent = "";
            this._notifyWebviewState(); // Notifier l'arrêt
        }
    }

    /** Réinitialise l'état de la conversation */
    public resetConversationState() {
        this.disposeSSEConnection(); // Ferme SSE et finalise
        // Reset état conversationnel
        this._state.messages = []; this._state.conversationId = null; this._state.error = null;
        this._state.limitReachedError = null; this._state.selectedVulnerability = null;
        this._state.isLoading = false; this._state.isStreaming = false; this._state.assistantStreamContent = "";
        this._notifyWebviewState(); // Notifier reset
    }

    /** Gère la destruction de la vue */
    private handleDispose() {
        this.disposeSSEConnection();
        this._view = undefined;
    }

    /** Méthode de l'interface vscode.Disposable */
    dispose() {
        this.handleDispose(); // Nettoyage interne
        // Nettoyage listeners VS Code
        while (this._disposables.length) { this._disposables.pop()?.dispose(); }
    }
}