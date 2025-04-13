// src/api/apiService.ts
import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError, AxiosRequestHeaders } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { AuthService } from '../auth/authService';
import { StartScanResponseDto } from '../dtos/security-scanning/response/start-scan-response.dto';
import { GetProjectVulnerabilitiesResponseDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
import { ScanResponseDto } from '../dtos/security-scanning/response/scan-response.dto';
import { getApiBaseUrl } from '../utilities/config';
import { ConversationResponseDto } from '../dtos/ai/response/conversation-response.dto';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';

export type ScanType = 'sast' | 'iac' | 'sca';

/**
 * Service for interacting with the CybeDefend backend API.
 * Handles request authentication and error formatting.
 */
export class ApiService {
    private axiosInstance: AxiosInstance;
    private authService: AuthService;

    /**
     * Creates an instance of ApiService.
     * @param authService - The authentication service to retrieve the API key.
     */
    constructor(authService: AuthService) {
        this.authService = authService;
        const baseURL = getApiBaseUrl();
        console.log(`[ApiService] Initializing with base URL: ${baseURL}`);

        this.axiosInstance = axios.create({
            baseURL: baseURL,
        });

        // Axios Request Interceptor to add authentication headers
        this.axiosInstance.interceptors.request.use(
            async (config) => {
                const apiKey = await this.authService.getApiKey();
                if (!config.headers) {
                    config.headers = {} as AxiosRequestHeaders; // Initialize headers object
                }

                if (apiKey) {
                    // **CORRECTION: Add BOTH Authorization and X-API-Key headers**
                    config.headers['X-API-Key'] = apiKey;
                    // console.log('[ApiService] Auth headers added (Bearer + X-API-Key)');

                    // Adjust Content-Type only if not FormData
                    if (!(config.data instanceof FormData)) {
                        if (!config.headers['Content-Type']) { // Set default if not present
                            config.headers['Content-Type'] = 'application/json';
                        }
                    } else {
                        // For FormData, remove Content-Type header; library will set it with boundaries
                        delete config.headers['Content-Type'];
                    }
                } else {
                    // Handle missing API key case
                    console.error('[ApiService] API Key is missing for request.');
                    vscode.window.showErrorMessage('API Key is missing or not configured. Please set it via settings.');
                    return Promise.reject(new Error('API Key is not configured.')); // Reject the request
                }
                return config;
            },
            (error) => {
                console.error('[ApiService] Request Interceptor Error:', error);
                return Promise.reject(error);
            }
        );
    }

    /**
     * Starts a scan by uploading a project archive.
     * @param projectId - The ID of the project to scan.
     * @param zipFilePath - The path to the zip archive of the project.
     * @returns A promise resolving to the scan start response.
     */
    async startScan(projectId: string, zipFilePath: string): Promise<StartScanResponseDto> {
        const operation = 'startScan';
        console.log(`[ApiService] ${operation} called for project ${projectId}`);
        try {
            const formData = new FormData();
            formData.append('scan', fs.createReadStream(zipFilePath), 'workspace.zip');

            const response = await this.axiosInstance.post<StartScanResponseDto>(
                `/project/${projectId}/scan/start`,
                formData,
                {
                    // Headers are handled by the interceptor + FormData library
                    timeout: 180000 // 3 minutes timeout
                }
            );
            console.log(`[ApiService] ${operation} successful:`, response.data);
             const responseData = response.data as any;
             // Adapt response based on actual API return vs DTO definition
             return new StartScanResponseDto(
                 responseData.success ?? true, // Assume success if not present
                 responseData.scanId ?? responseData.message ?? 'Scan initiation info missing',
                 responseData.detectedLanguages
             );
        } catch (error) {
            this.handleApiError(error, operation);
            throw error; // Re-throw for command handler
        }
    }

    /**
     * Gets the list of vulnerabilities for a specific scan type.
     * @param projectId - The ID of the project.
     * @param scanType - The type of scan results to fetch ('sast', 'iac', 'sca').
     * @param params - Optional parameters for pagination and filtering.
     * @returns A promise resolving to the vulnerability list response.
     */
    async getScanResults(
        projectId: string,
        scanType: ScanType,
        params?: { pageNumber?: number; pageSizeNumber?: number; severity?: string[] }
    ): Promise<GetProjectVulnerabilitiesResponseDto> {
        const operation = `getScanResults (${scanType})`;
        console.log(`[ApiService] ${operation} called for project ${projectId} with params:`, params);
        try {
             const queryParams = {
                 pageNumber: params?.pageNumber ?? 1,
                 pageSizeNumber: params?.pageSizeNumber ?? 500, // Fetch more for UI lists
                 severity: params?.severity,
             };
            const response = await this.axiosInstance.get<GetProjectVulnerabilitiesResponseDto>(
                `/project/${projectId}/results/${scanType}`,
                { params: queryParams }
            );
            console.log(`[ApiService] ${operation} successful. Found ${response.data?.vulnerabilities?.length ?? 0} items.`);
            // Ensure vulnerabilities array exists, return empty array otherwise
            if (!response.data?.vulnerabilities) {
                console.warn(`[ApiService] ${operation} response missing 'vulnerabilities' array.`);
                 // Create a valid structure if response.data itself is missing
                 const baseResponse = response.data || { projectId, total: 0, vulnerabilities: [] };
                 return { ...baseResponse, vulnerabilities: [] };
             }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    /**
     * Gets detailed information for a specific vulnerability.
     * @param projectId - The ID of the project.
     * @param vulnerabilityId - The ID of the vulnerability.
     * @param scanType - The type of scan the vulnerability belongs to.
     * @returns A promise resolving to the detailed vulnerability response.
     */
    async getVulnerabilityDetails(
        projectId: string,
        vulnerabilityId: string,
        scanType: ScanType
    ): Promise<GetProjectVulnerabilityByIdResponseDto> {
        const operation = `getVulnerabilityDetails (${scanType})`;
        console.log(`[ApiService] ${operation} called for project ${projectId}, vuln ${vulnerabilityId}`);
        try {
            const response = await this.axiosInstance.get<GetProjectVulnerabilityByIdResponseDto>(
                `/project/${projectId}/results/${scanType}/${vulnerabilityId}`
            );
            console.log(`[ApiService] ${operation} successful.`);
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

     /**
      * Gets the status of a specific scan.
      * @param projectId - The ID of the project.
      * @param scanId - The ID of the scan to check.
      * @returns A promise resolving to the scan status response.
      */
     async getScanStatus(projectId: string, scanId: string): Promise<ScanResponseDto> {
         const operation = 'getScanStatus';
         console.log(`[ApiService] ${operation} called for project ${projectId}, scan ${scanId}`);
         try {
             const response = await this.axiosInstance.get<ScanResponseDto>(
                 `/project/${projectId}/scan/${scanId}`
             );
             console.log(`[ApiService] ${operation} successful: State is ${response.data?.state}`);
             return response.data;
         } catch (error) {
             this.handleApiError(error, operation);
             throw error;
         }
     }

    /**
     * Starts a new AI conversation, potentially with vulnerability context.
     * @param requestDto - DTO containing necessary info (projectId, context).
     * @returns A promise resolving to the initial conversation state.
     */
    async startConversation(requestDto: StartConversationRequestDto): Promise<ConversationResponseDto> {
        const operation = 'startConversation';
        if (!requestDto.projectId) throw new Error(`[ApiService] ${operation} Error: Project ID is required.`);
        const projectId = requestDto.projectId;
        console.log(`[ApiService] ${operation} called for project ${projectId}`);
        try {
             const body = {
                 isVulnerabilityConversation: requestDto.isVulnerabilityConversation,
                 vulnerabilityId: requestDto.vulnerabilityId,
                 vulnerabilityType: requestDto.vulnerabilityType
             };
             const response = await this.axiosInstance.post<ConversationResponseDto | ConversationResponseDto[]>(
                 `/project/${projectId}/ai/conversation/start`,
                 body
             );
             console.log(`[ApiService] ${operation} successful.`);
             // Handle potential array response
             if (Array.isArray(response.data)) {
                  console.warn(`[ApiService] ${operation} received an array, returning first element.`);
                  return response.data[0] || { conversationId: '', messages: [] };
             }
             return response.data && response.data.conversationId ? response.data : { conversationId: '', messages: [] }; // Ensure valid response structure
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    /**
     * Sends a message to continue an existing AI conversation.
     * @param requestDto - DTO containing conversation/project IDs and the message.
     * @returns A promise resolving to the updated conversation state.
     */
    async continueConversation(requestDto: AddMessageConversationRequestDto): Promise<ConversationResponseDto> {
        const operation = 'continueConversation';
        if (!requestDto.projectId || !requestDto.idConversation) {
            throw new Error(`[ApiService] ${operation} Error: Project ID and Conversation ID are required.`);
        }
        const { projectId, idConversation, message } = requestDto;
        console.log(`[ApiService] ${operation} called for project ${projectId}, conversation ${idConversation}`);
        try {
             const body = { message };
             const response = await this.axiosInstance.post<ConversationResponseDto | ConversationResponseDto[]>(
                 `/project/${projectId}/ai/conversation/${idConversation}/message`,
                 body
             );
              console.log(`[ApiService] ${operation} successful.`);
             if (Array.isArray(response.data)) {
                 console.warn(`[ApiService] ${operation} received an array, returning first element.`);
                 return response.data[0] || { conversationId: idConversation, messages: [] };
             }
              return response.data && response.data.conversationId ? response.data : { conversationId: idConversation, messages: [] }; // Ensure valid response structure
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    /**
     * Handles API errors, logging details and creating a user-friendly message.
     * The error message is updated in place.
     * @param error - The error object (can be AxiosError or other).
     * @param operation - A string identifying the operation that failed.
     */
    private handleApiError(error: any, operation: string): void {
        let userMessage = `Operation '${operation}' failed.`;
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError<any>;
            console.error(`[ApiService] Axios Error during ${operation}:`, error.message);
            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data;
                const apiErrorMessage = data?.message || data?.error || (typeof data === 'object' ? JSON.stringify(data) : data);
                console.error(`[ApiService] Response Status: ${status}`);
                console.error(`[ApiService] Response Data:`, data);
                userMessage = `API Error (${status}) during ${operation}: ${apiErrorMessage || 'No additional details'}`;
                 if (status === 401) userMessage = 'API Authentication Failed: Invalid or missing API Key/Token.';
                 else if (status === 403) userMessage = 'API Authorization Failed: Access Denied.';
                 else if (status === 404) userMessage = `API Error: Resource not found for ${operation}. Check IDs/URL.`;
                 else if (status === 400) userMessage = `API Error: Invalid Request for ${operation}. ${apiErrorMessage}`;
            } else if (axiosError.request) {
                console.error('[ApiService] Request Error: No response received.', axiosError.config?.url);
                userMessage = `Network Error for ${operation}: No response from server at ${this.axiosInstance.defaults.baseURL}. Check URL/Connection.`;
            } else { userMessage = `Request Setup Error for ${operation}: ${error.message}`; }
        } else if (error instanceof Error) {
            console.error(`[ApiService] Non-Axios Error during ${operation}:`, error);
            userMessage = `Unexpected Error during ${operation}: ${error.message}`;
        } else {
            console.error(`[ApiService] Unknown Error during ${operation}:`, error);
            userMessage = `An unexpected error occurred during ${operation}.`;
        }
        console.error(`[ApiService] Final User Message for ${operation}: ${userMessage}`);
        // Modify the original error to include the user-friendly message
        if (error instanceof Error) error.message = userMessage;
        else error = new Error(userMessage); // Wrap non-errors
    }
}