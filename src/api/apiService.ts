// src/api/apiService.ts
import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError, AxiosRequestHeaders } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import { AuthService } from '../auth/authService'; // Importer AuthService
import { StartScanResponseDto } from '../dtos/security-scanning/response/start-scan-response.dto';
import { GetProjectVulnerabilitiesResponseDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
import { ScanResponseDto } from '../dtos/security-scanning/response/scan-response.dto';
import { getApiBaseUrl } from '../utilities/config';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';

export type ScanType = 'sast' | 'iac' | 'sca';

/**
 * Interface for the expected successful response from start/continue conversation POST requests.
 */
export interface InitiateConversationResponse {
    conversationId: string;
}

/**
 * Service for interacting with the CybeDefend backend API.
 * Handles request authentication and error formatting.
 */
export class ApiService {
    private axiosInstance: AxiosInstance;
    // Garder authService privé pour une meilleure encapsulation
    private readonly authService: AuthService;

    /**
     * Creates an instance of ApiService.
     * @param authService - The authentication service to retrieve the API key.
     */
    constructor(authService: AuthService) { // Conserver la signature originale
        this.authService = authService; // Stocker l'instance injectée
        const baseURL = getApiBaseUrl();

        this.axiosInstance = axios.create({
            baseURL: baseURL,
        });

        // Axios Request Interceptor to add authentication headers
        this.axiosInstance.interceptors.request.use(
            async (config) => {
                // Utiliser la méthode interne pour obtenir la clé
                const apiKey = await this.authService.getApiKey();
                if (!config.headers) {
                    config.headers = {} as AxiosRequestHeaders;
                }

                if (apiKey) {
                    config.headers['X-API-Key'] = apiKey;

                    if (!(config.data instanceof FormData)) {
                        if (!config.headers['Content-Type']) {
                            config.headers['Content-Type'] = 'application/json';
                        }
                    } else {
                        delete config.headers['Content-Type'];
                    }
                } else {
                    vscode.window.showErrorMessage('API Key is missing or not configured. Please set it via settings.');
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
     * Public method to retrieve the API key via the internal AuthService.
     * Needed by ChatbotViewProvider for SSE headers.
     * @returns A promise resolving to the API key string, or undefined.
     */
    public async getApiKey(): Promise<string | undefined> {
        return this.authService.getApiKey();
    }

    /**
     * Starts a scan by uploading a project archive.
     * @param projectId - The ID of the project to scan.
     * @param zipFilePath - The path to the zip archive of the project.
     * @returns A promise resolving to the scan start response.
     */
    async startScan(projectId: string, zipFilePath: string): Promise<StartScanResponseDto> {
        const operation = 'startScan';
        try {
            const formData = new FormData();
            formData.append('scan', fs.createReadStream(zipFilePath), 'workspace.zip');

            const response = await this.axiosInstance.post<StartScanResponseDto>(
                `/project/${projectId}/scan/start`,
                formData,
                { timeout: 180000 }
            );
            const responseData = response.data as any;
            return new StartScanResponseDto(
                responseData.success ?? true,
                responseData.scanId ?? responseData.message ?? 'Scan initiation info missing',
                responseData.detectedLanguages
            );
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
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
        try {
            const queryParams = {
                pageNumber: params?.pageNumber ?? 1,
                pageSizeNumber: params?.pageSizeNumber ?? 500,
                severity: params?.severity,
            };
            const response = await this.axiosInstance.get<GetProjectVulnerabilitiesResponseDto>(
                `/project/${projectId}/results/${scanType}`,
                { params: queryParams }
            );
            if (!response.data?.vulnerabilities) {
                console.warn(`[ApiService] ${operation} response missing 'vulnerabilities' array.`);
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
        try {
            const response = await this.axiosInstance.get<GetProjectVulnerabilityByIdResponseDto>(
                `/project/${projectId}/results/${scanType}/${vulnerabilityId}`
            );
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
        try {
            const response = await this.axiosInstance.get<ScanResponseDto>(
                `/project/${projectId}/scan/${scanId}`
            );
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    /**
     * Initiates a new AI conversation via a POST request.
     * Expects only the conversation ID in the response upon success.
     * @param requestDto - DTO containing project ID and optional vulnerability context.
     * @returns A promise resolving to an object containing the conversation ID.
     */
    async startConversation(requestDto: StartConversationRequestDto): Promise<InitiateConversationResponse> {
        const operation = 'startConversation';
        if (!requestDto.projectId) {
            throw new Error(`[ApiService] ${operation} Error: Project ID is required.`);
        }
        const projectId = requestDto.projectId;
        try {
            const body = {
                isVulnerabilityConversation: requestDto.isVulnerabilityConversation,
                vulnerabilityId: requestDto.vulnerabilityId,
                vulnerabilityType: requestDto.vulnerabilityType,
                projectId: projectId
            };
            const response = await this.axiosInstance.post<InitiateConversationResponse>(
                `/project/${projectId}/ai/conversation/start`,
                body
            );

            if (response.data && typeof response.data.conversationId === 'string') {
                return response.data;
            } else {
                throw new Error(`Unexpected response format from ${operation}.`);
            }
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    /**
     * Sends a message to an existing AI conversation via a POST request.
     * Expects only the conversation ID in the response upon success.
     * @param requestDto - DTO containing project ID, conversation ID, and the message.
     * @returns A promise resolving to an object containing the conversation ID.
     */
    async continueConversation(requestDto: AddMessageConversationRequestDto): Promise<InitiateConversationResponse> {
        const operation = 'continueConversation';
        if (!requestDto.projectId || !requestDto.idConversation) {
            throw new Error(`[ApiService] ${operation} Error: Project ID and Conversation ID are required.`);
        }
        const { projectId, idConversation, message } = requestDto;
        try {
            const body = { message };
            const response = await this.axiosInstance.post<InitiateConversationResponse>(
                `/project/${projectId}/ai/conversation/${idConversation}/message`,
                body
            );

            if (response.data && typeof response.data.conversationId === 'string') {
                return response.data;
            } else {
                throw new Error(`Unexpected response format from ${operation}.`);
            }
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
            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data;
                const apiErrorMessage = data?.message || data?.error || (typeof data === 'object' ? JSON.stringify(data) : data);
                userMessage = `API Error (${status}) during ${operation}: ${apiErrorMessage || 'No additional details'}`;

                if (status === 401) userMessage = 'API Authentication Failed: Invalid or missing API Key. Please check extension settings.';
                else if (status === 403) userMessage = 'API Authorization Failed: Access Denied. Check permissions or API key validity.';
                else if (status === 404) userMessage = `API Error: Resource not found for ${operation}. Check Project ID or Conversation ID.`;
                else if (status === 400) userMessage = `API Error: Invalid Request for ${operation}. ${apiErrorMessage || 'Check input data.'}`;
                else if (status === 429) userMessage = `API Rate Limit Exceeded for ${operation}. Please try again later. ${apiErrorMessage || ''}`;
                else if (status >= 500) userMessage = `Server Error (${status}) during ${operation}. Please try again later or contact support. ${apiErrorMessage || ''}`;

            } else if (axiosError.request) {
                userMessage = `Network Error for ${operation}: Could not reach the server at ${this.axiosInstance.defaults.baseURL}. Check API URL configuration and network connection.`;
            } else {
                userMessage = `Request Setup Error for ${operation}: ${error.message}`;
            }
        } else if (error instanceof Error) {
            userMessage = `Unexpected Error during ${operation}: ${error.message}`;
        } else {
            userMessage = `An unexpected error occurred during ${operation}.`;
        }
        if (error instanceof Error) {
            error.message = userMessage;
        } else {
            error = new Error(userMessage);
        }
    }
}