// src/api/apiService.ts
import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { AuthService } from '../auth/authService';

// --- Import Core DTOs ---
// Ajuste les chemins si ta structure dans src/dtos/ est différente (ex: src/dtos/index.ts)
import { StartScanResponseDto } from '../dtos/security-scanning/response/start-scan-response.dto';
import { GetProjectVulnerabilitiesRequestDto } from '../dtos/result/request/get-project-vulnerabilities-request.dto';
import { GetProjectVulnerabilitiesResponseDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { GetProjectVulnerabilityByIdRequestDto } from '../dtos/result/request/get-project-vulnerability-by-id-request.dto';
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
// Importe d'autres DTOs si nécessaire (ex: ScanResponseDto pour getScanStatus)
import { ScanResponseDto } from '../dtos/security-scanning/response/scan-response.dto';
import { getApiBaseUrl } from '../utilities/config';
import { ConversationResponseDto } from '../dtos/ai/response/conversation-response.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';

// Définir les types de scan valides basés sur tes endpoints
export type ScanType = 'sast' | 'iac' | 'sca';

export class ApiService {
    private axiosInstance: AxiosInstance;
    private authService: AuthService;

    constructor(authService: AuthService) {
        this.authService = authService;
        const baseURL = getApiBaseUrl(); // Utilise ta fonction pour lire depuis la config

        this.axiosInstance = axios.create({
            baseURL: baseURL,
            headers: {
                'Content-Type': 'application/json', // Default
            },
            // Tu peux ajouter un timeout par défaut ici
            // timeout: 30000, // 30 seconds
        });

        // Intercepteur pour ajouter le token d'authentification
        this.axiosInstance.interceptors.request.use(
            async (config) => {
                const apiKey = await this.authService.getApiKey();
                if (apiKey) {
                    config.headers.Authorization = `Bearer ${apiKey}`;
                } else {
                    // Gérer le cas où la clé API est manquante avant l'appel
                    console.error('ApiService: API Key is missing for request.');
                    // Rejeter la promesse pour arrêter la requête
                    return Promise.reject(new Error('API Key is not configured.'));
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    /**
     * Starts a scan by uploading a project archive.
     * Corresponds to POST /project/{projectId}/scan/start
     */
    async startScan(projectId: string, zipFilePath: string): Promise<StartScanResponseDto> {
        try {
            const formData = new FormData();
            // Le nom du champ 'scan' doit correspondre à FileInterceptor('scan') dans le contrôleur NestJS
            formData.append('scan', fs.createReadStream(zipFilePath), 'workspace.zip');

            const response = await this.axiosInstance.post<StartScanResponseDto>(
                `/project/${projectId}/scan/start`,
                formData,
                {
                    headers: {
                        // Important: Laisse Axios définir Content-Type avec les boundaries pour FormData
                        ...formData.getHeaders(),
                    },
                    // Augmenter le timeout pour les uploads potentiellement longs
                    timeout: 120000 // 2 minutes example
                }
            );
            // Le contrôleur retourne directement StartScanResponseDto (pas de message, juste success, scanId, languages)
            // Assure-toi que ton DTO StartScanResponseDto correspond bien à la réponse réelle.
            // Il semble y avoir une incohérence: le contrôleur retourne { success, scanId, detectedLanguages },
            // mais ton DTO a { success, message, detectedLanguages }. Adaptes le DTO ou la logique ici.
            // Supposons que le contrôleur renvoie scanId et que le DTO doit être adapté.
            // Si le DTO est correct tel quel, la réponse de l'API doit être adaptée.
            console.log('Start Scan API Response:', response.data);
            // Temporairement, on crée un objet correspondant au DTO si l'API renvoie différemment
            // Ceci est à adapter en fonction de la VRAIE réponse API ou en corrigeant le DTO
             const responseData = response.data as any; // Cast pour accéder aux propriétés potentiellement manquantes
             return new StartScanResponseDto(
                 responseData.success ?? false, // Utilise ce que l'API renvoie
                 responseData.scanId ?? responseData.message ?? 'Scan initiated', // Utilise scanId si présent, sinon message
                 responseData.detectedLanguages
             );
             // return response.data; // Utilise ceci si le DTO correspond PARFAITEMENT à la réponse API
        } catch (error) {
            this.handleApiError(error, 'startScan');
            throw error; // Re-throw pour que le command handler puisse le gérer
        }
    }

    /**
     * Gets the list of vulnerabilities for a specific scan type after completion.
     * Corresponds to GET /project/{projectId}/results/{scanType}
     * Note: Assumes the same response DTO for SAST, IAC, SCA list views for simplicity here.
     * You might need separate methods if request/response differs significantly.
     */
    async getScanResults(
        projectId: string,
        scanType: ScanType,
        // Ajoute des paramètres optionnels pour la pagination/filtres si nécessaire
        // basés sur GetProjectVulnerabilitiesRequestDto ou GetProjectScaVulnerabilitiesRequestDto
        params?: { pageNumber?: number; pageSizeNumber?: number; severity?: string[], /* autres filtres...*/ }
    ): Promise<GetProjectVulnerabilitiesResponseDto> {
        try {
            // Adapte les noms de paramètres si nécessaire pour correspondre à l'API (@Query)
             const queryParams = {
                 pageNumber: params?.pageNumber ?? 1, // Default page 1
                 pageSizeNumber: params?.pageSizeNumber ?? 100, // Default page size 100
                 severity: params?.severity, // Pass severity array if provided
                 // Ajoute d'autres paramètres ici
             };

            const response = await this.axiosInstance.get<GetProjectVulnerabilitiesResponseDto>(
                `/project/${projectId}/results/${scanType}`,
                { params: queryParams }
            );
            // Vérifie si la réponse contient bien un tableau 'vulnerabilities'
            if (!response.data || !Array.isArray(response.data.vulnerabilities)) {
                 console.warn(`API response for getScanResults (${scanType}) missing 'vulnerabilities' array.`);
                 // Retourne une structure vide valide pour éviter les erreurs en aval
                  return { ...response.data, vulnerabilities: [] };
             }

            console.log(`Get Scan Results (${scanType}) Response: Found ${response.data.vulnerabilities.length} vulnerabilities.`);
            return response.data;
        } catch (error) {
            this.handleApiError(error, `getScanResults (${scanType})`);
            throw error;
        }
    }

    /**
     * Gets detailed information for a specific vulnerability.
     * Corresponds to GET /project/{projectId}/results/{scanType}/{vulnerabilityId}
     */
    async getVulnerabilityDetails(
        projectId: string,
        vulnerabilityId: string,
        scanType: ScanType
    ): Promise<GetProjectVulnerabilityByIdResponseDto> {
        try {
            const response = await this.axiosInstance.get<GetProjectVulnerabilityByIdResponseDto>(
                `/project/${projectId}/results/${scanType}/${vulnerabilityId}`
            );
            console.log(`Get Vulnerability Details (${scanType}, ${vulnerabilityId}) Response received.`);
            return response.data;
        } catch (error) {
            this.handleApiError(error, `getVulnerabilityDetails (${scanType})`);
            throw error;
        }
    }

    /**
      * Gets the status of a specific scan.
      * Corresponds to GET /project/{projectId}/scan/{scanId}
      */
     async getScanStatus(projectId: string, scanId: string): Promise<ScanResponseDto> {
         try {
             const response = await this.axiosInstance.get<ScanResponseDto>(
                 `/project/${projectId}/scan/${scanId}`
             );
             console.log(`Get Scan Status (${scanId}) Response: State is ${response.data.state}`);
             return response.data;
         } catch (error) {
             this.handleApiError(error, 'getScanStatus');
             throw error;
         }
     }

     /**
     * Starts a new AI conversation.
     * POST /project/{projectId}/ai/conversation/start
     */
    async startConversation(requestDto: StartConversationRequestDto): Promise<ConversationResponseDto> {
        // Assure-toi que projectId est dans le DTO ou récupère-le autrement si nécessaire
        if (!requestDto.projectId) {
             throw new Error("Project ID is required to start a conversation.");
        }
        const projectId = requestDto.projectId;
        try {
             console.log(`Starting AI conversation for project ${projectId}:`, requestDto);
             // Le body de la requête est directement le DTO (sans le projectId dans le corps si l'endpoint le prend dans l'URL)
             const body = {
                 isVulnerabilityConversation: requestDto.isVulnerabilityConversation,
                 vulnerabilityId: requestDto.vulnerabilityId,
                 vulnerabilityType: requestDto.vulnerabilityType
             };
             const response = await this.axiosInstance.post<ConversationResponseDto>(
                 `/project/${projectId}/ai/conversation/start`,
                 body // Envoyer seulement les champs attendus par le Body DTO NestJS
             );
             console.log('Start Conversation Response:', response.data);
             // Supposer que l'API retourne directement ConversationResponseDto
             // L'endpoint retourne Observable<ConversationResponseDto[] | ErrorDto> - à clarifier si c'est un tableau ou objet unique
             // On suppose ici que c'est un objet unique pour simplifier
             if (Array.isArray(response.data)) { // Gérer le cas où c'est un tableau
                 return response.data[0] || { conversationId: '', messages: [] }; // Prend le premier ou un vide
             }
             return response.data;
        } catch (error) {
            this.handleApiError(error, 'startConversation');
            throw error;
        }
    }

    /**
     * Sends a message to continue an existing AI conversation.
     * POST /project/{projectId}/ai/conversation/{idConversation}/message
     */
    async continueConversation(requestDto: AddMessageConversationRequestDto): Promise<ConversationResponseDto> {
        if (!requestDto.projectId || !requestDto.idConversation) {
             throw new Error("Project ID and Conversation ID are required to continue a conversation.");
        }
        const { projectId, idConversation, message } = requestDto;
        try {
             console.log(`Continuing AI conversation ${idConversation} for project ${projectId}`);
             const body = { message }; // Le body attend juste le message selon l'endpoint
             const response = await this.axiosInstance.post<ConversationResponseDto>(
                 `/project/${projectId}/ai/conversation/${idConversation}/message`,
                 body
             );
             console.log('Continue Conversation Response:', response.data);
             // Même remarque sur la réponse potentiellement tableau
             if (Array.isArray(response.data)) {
                 return response.data[0] || { conversationId: idConversation, messages: [] };
             }
             return response.data;
        } catch (error) {
            this.handleApiError(error, 'continueConversation');
            throw error;
        }
    }


    // --- Helper pour gérer les erreurs Axios ---
    private handleApiError(error: any, operation: string): void {
        let userMessage = `Operation '${operation}' failed.`; // Default message
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>; // Type avec les données d'erreur potentielles
            console.error(`Axios Error during ${operation}:`, error.message);
            if (axiosError.response) {
                console.error('Response Status:', axiosError.response.status);
                console.error('Response Data:', axiosError.response.data);
                // Essayer d'extraire un message d'erreur de l'API si disponible
                const apiErrorMessage = axiosError.response.data?.message || axiosError.response.data?.error || JSON.stringify(axiosError.response.data);
                userMessage = `API Error (${axiosError.response.status}) during ${operation}: ${apiErrorMessage}`;

                if (axiosError.response.status === 401) {
                    userMessage = 'API Authentication Failed: Invalid or missing API Key. Please update it in Settings.';
                    // On pourrait déclencher une action, comme demander la clé à nouveau
                    // vscode.commands.executeCommand(COMMAND_UPDATE_API_KEY);
                } else if (axiosError.response.status === 403) {
                    userMessage = 'API Authorization Failed: You do not have permission for this project or action.';
                } else if (axiosError.response.status === 404) {
                     userMessage = `API Error: Resource not found during ${operation}. Check Project ID or URL.`;
                 }
            } else if (axiosError.request) {
                console.error('Request Error:', axiosError.request);
                userMessage = `Network Error during ${operation}: No response received from the server at ${this.axiosInstance.defaults.baseURL}. Please check the URL and your connection.`;
            } else {
                userMessage = `Error setting up request for ${operation}: ${error.message}`;
            }
        } else {
            console.error(`Non-Axios Error during ${operation}:`, error);
             if (error instanceof Error) {
               userMessage = `Unexpected Error during ${operation}: ${error.message}`;
             } else {
                userMessage = `An unexpected error occurred during ${operation}.`;
             }
        }
        // Ne pas montrer d'erreur ici, laisser le Command Handler décider
        // vscode.window.showErrorMessage(userMessage);
        // On modifie l'erreur pour inclure le message utilisateur
         error.message = userMessage;
    }
}