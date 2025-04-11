// src/providers/chatbotViewProvider.ts
import * as vscode from 'vscode';
import { ApiService } from '../api/apiService';
import { MessageDto } from '../dtos/ai/response/message.dto';
import { DetailedVulnerability } from '../dtos/result/details';
import { getProjectId } from '../utilities/config'; // Pour obtenir le projectId
import { ConversationResponseDto } from '../dtos/ai/response/conversation-response.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { getChatbotHtml } from '../ui/html/chatbotHtml';

// Interface pour les messages échangés avec la webview
interface ChatbotMessage {
    command: 'sendMessage' | 'loadInitialData' | 'setSelectedVulnerability';
    text?: string;
    vulnerability?: DetailedVulnerability | null; // Pour envoyer la vulnérabilité sélectionnée
}

interface WebviewState {
    messages: MessageDto[];
    isLoading: boolean;
    error: string | null;
    vulnerabilities: DetailedVulnerability[]; // Pour la liste de sélection
    selectedVulnerability: DetailedVulnerability | null;
    conversationId: string | null;
    projectId: string | null;
}

export class ChatbotViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {

    public static readonly viewType = 'cybedefendScanner.chatbotView';

    private _view?: vscode.WebviewView;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _apiService: ApiService;

    // État interne de la vue
    private _state: WebviewState = {
        messages: [],
        isLoading: false,
        error: null,
        vulnerabilities: [],
        selectedVulnerability: null,
        conversationId: null,
        projectId: getProjectId() || null // Récupérer le projectId au démarrage et s'assurer qu'il est string | null
    };

    constructor(
        private readonly context: vscode.ExtensionContext,
        apiService: ApiService // Injecter ApiService
    ) {
        this._extensionUri = context.extensionUri;
        this._apiService = apiService;
        console.log("[ChatbotViewProvider] Initialized.");
        if (!this._state.projectId) {
            console.warn("[ChatbotViewProvider] Project ID not configured, chatbot features might be limited.");
            // Peut-être afficher un message dans la vue ?
        }
    }

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
                 vscode.Uri.joinPath(this._extensionUri, 'media') // Si nécessaire
            ]
        };

        // Définir le HTML initial et mettre à jour l'état
        this._updateWebview();

        // Listeners
        const messageSubscription = webviewView.webview.onDidReceiveMessage(async (message: ChatbotMessage) => {
            console.log("[ChatbotViewProvider] Message received:", message.command);
            switch (message.command) {
                case 'sendMessage':
                    if (message.text) {
                        await this._handleSendMessage(message.text);
                    }
                    return;
                case 'loadInitialData':
                     // Charger la liste des vulnérabilités SAST/IAC
                     await this._loadVulnerabilities();
                     // Pas besoin de renvoyer un message ici, _loadVulnerabilities met à jour l'état et la vue
                    return;
                 case 'setSelectedVulnerability':
                     this._state.selectedVulnerability = message.vulnerability ?? null;
                     console.log("Selected Vulnerability:", this._state.selectedVulnerability?.id);
                     // Mettre à jour la vue pour refléter la sélection (optionnel)
                     this._updateWebview(); // Pourrait rafraîchir l'UI pour montrer la sélection
                     return;
            }
        });

        const disposeSubscription = webviewView.onDidDispose(() => {
            console.log('[ChatbotViewProvider] Disposed.');
            if (this._view === webviewView) { this._view = undefined; }
            messageSubscription.dispose();
            disposeSubscription.dispose();
            this._disposables = this._disposables.filter(d => d !== messageSubscription && d !== disposeSubscription);
        });

        this._disposables.push(messageSubscription, disposeSubscription);

         // Charger les données initiales (liste de vulnérabilités) quand la vue est prête
         webviewView.webview.postMessage({ command: 'askForInitialData' }); // Demande au script de renvoyer 'loadInitialData'
    }

    // --- Logique Métier ---

    private async _handleSendMessage(text: string): Promise<void> {
        if (this._state.isLoading || !this._state.projectId) return; // Empêcher envois multiples ou sans projet

        this._state.isLoading = true;
        this._state.error = null;
        // Ajoute le message utilisateur immédiatement (pour réactivité)
        this._state.messages.push({ role: 'user', content: text, createdAt: new Date() });
        this._updateWebview(); // Met à jour l'UI avec le message utilisateur

        try {
            let response: ConversationResponseDto;
            if (this._state.conversationId) {
                // Continuer la conversation
                const request = new AddMessageConversationRequestDto(
                    this._state.conversationId,
                    text,
                    this._state.projectId
                );
                response = await this._apiService.continueConversation(request);
            } else {
                // Démarrer une nouvelle conversation (avec ou sans contexte vulnérabilité)
                 const isContextual = !!this._state.selectedVulnerability;
                 const request = new StartConversationRequestDto({
                     projectId: this._state.projectId,
                     isVulnerabilityConversation: isContextual,
                     vulnerabilityId: isContextual ? this._state.selectedVulnerability?.id : undefined,
                     // Déterminer le type SAST/IAC de la vulnérabilité sélectionnée
                      vulnerabilityType: isContextual ? (this._state.selectedVulnerability?.vulnerability.vulnerabilityType === 'sast' ? 'sast' : 'iac') : undefined
                 });
                 // Envoyer le premier message dans le cadre du démarrage si l'API le permet
                 // Sinon, il faudra peut-être appeler start puis continue ? Ici on suppose que start peut prendre le 1er message
                 // Si l'API start ne prend pas de message, il faudrait adapter :
                 // 1. Call startConversation (sans message)
                 // 2. Récupérer l'ID
                 // 3. Call continueConversation avec le message 'text'
                 // Actuellement, l'API semble séparer start et continue. Appelons start, puis continue.

                 // Appel 1: Start (pour obtenir l'ID et potentiellement une réponse initiale si vulnérabilité liée)
                  const startResponse = await this._apiService.startConversation(request);
                  this._state.conversationId = startResponse.conversationId;
                  // Ajouter les messages initiaux de l'IA si l'API en renvoie au démarrage
                  if (startResponse.messages && startResponse.messages.length > 0) {
                       this._state.messages.push(...startResponse.messages);
                  }

                  // Appel 2: Continue (pour envoyer le message utilisateur)
                  const continueRequest = new AddMessageConversationRequestDto(
                     this._state.conversationId,
                     text,
                     this._state.projectId
                  );
                  response = await this._apiService.continueConversation(continueRequest);

            }

            // Mettre à jour la liste de messages avec la réponse complète de l'IA
             // Assumons que la réponse contient TOUS les messages de la conversation
             // ou juste le dernier ? Si juste le dernier : this._state.messages.push(response.messages[response.messages.length-1])
             // Ici on suppose qu'elle contient au moins le dernier message de l'IA
            if (response.messages && response.messages.length > 0) {
                // Pour éviter les doublons, on pourrait filtrer ou simplement ajouter le dernier
                 const lastAiMessage = response.messages[response.messages.length - 1];
                 if (lastAiMessage && lastAiMessage.role !== 'user') { // S'assurer qu'on ajoute bien la réponse IA
                     // Trouve l'index du message utilisateur qu'on a ajouté localement
                      const userMsgIndex = this._state.messages.findIndex(m => m.role === 'user' && m.content === text && !m.createdAt); // Trouver le message temporaire
                      if (userMsgIndex !== -1) {
                          this._state.messages[userMsgIndex].createdAt = new Date(); // Marquer comme "envoyé"
                      }
                     this._state.messages.push(lastAiMessage);
                 } else {
                     // Si la réponse ne contient pas de nouveau message IA, logguer
                     console.warn("Continue conversation didn't return a new AI message.");
                 }
            }
            this._state.conversationId = response.conversationId; // Mettre à jour au cas où

        } catch (error: any) {
            console.error("Error during AI conversation:", error);
            this._state.error = error.message || "Failed to communicate with the Security Champion.";
            // Retirer le message utilisateur "optimiste" si l'envoi échoue ? Ou le marquer comme échoué ?
             const userMsgIndex = this._state.messages.findIndex(m => m.role === 'user' && m.content === text && !m.createdAt);
             if (userMsgIndex !== -1) this._state.messages[userMsgIndex].content += " (Error Sending)";
        } finally {
            this._state.isLoading = false;
            // Réinitialiser la vulnérabilité sélectionnée après l'envoi du message contextuel ? A discuter.
             // this._state.selectedVulnerability = null;
            this._updateWebview(); // Mettre à jour l'UI finale
        }
    }

     private async _loadVulnerabilities(): Promise<void> {
         if (!this._state.projectId) {
             this._state.error = "Project ID is not set. Cannot load vulnerabilities.";
             this._updateWebview();
             return;
         }
         this._state.isLoading = true;
         this._state.error = null;
         this._updateWebview();

         try {
             const [sastResults, iacResults] = await Promise.all([
                 this._apiService.getScanResults(this._state.projectId, 'sast', { pageSizeNumber: 500 }), // Taille max ?
                 this._apiService.getScanResults(this._state.projectId, 'iac', { pageSizeNumber: 500 })
             ]);
             this._state.vulnerabilities = [
                 ...(sastResults?.vulnerabilities || []),
                 ...(iacResults?.vulnerabilities || [])
             ];
             console.log(`Loaded ${this._state.vulnerabilities.length} SAST/IaC vulnerabilities for chatbot context.`);
         } catch (error: any) {
             console.error("Failed to load vulnerabilities for chatbot:", error);
             this._state.error = "Failed to load vulnerabilities for context selection.";
             this._state.vulnerabilities = [];
         } finally {
             this._state.isLoading = false;
             this._updateWebview();
         }
     }

    /** Met à jour le contenu HTML de la webview avec l'état actuel */
    private _updateWebview() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    /** Génère le HTML pour la webview du chatbot */
    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Appeler la future fonction getChatbotHtml
        return getChatbotHtml(webview, this.context.extensionUri, this._state);
    }

    /** Nettoie les ressources */
    dispose() {
        console.log("[ChatbotViewProvider] Disposing.");
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
        this._view = undefined;
    }
}