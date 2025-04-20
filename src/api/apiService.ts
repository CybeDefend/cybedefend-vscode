// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/api/apiService.ts
import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosError, AxiosRequestHeaders } from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import type { AuthService } from '../auth/authService';
import { StartScanResponseDto } from '../dtos/security-scanning/response/start-scan-response.dto';
import { GetProjectVulnerabilitiesResponseDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { GetProjectVulnerabilityByIdResponseDto } from '../dtos/result/response/get-project-vulnerability-by-id-response.dto';
import { ScanResponseDto } from '../dtos/security-scanning/response/scan-response.dto';
import { getApiBaseUrl } from '../utilities/config';
import { AddMessageConversationRequestDto } from '../dtos/ai/request/add-message-conversation-request.dto';
import { StartConversationRequestDto } from '../dtos/ai/request/start-conversation-request.dto';
import { OrganizationInformationsResponseDto } from '../dtos/organization/organization-informations-response.dto';
import { GetRepositoriesResponseDto } from '../dtos/repository/get-repositories-response.dto';
import { PaginatedProjectsAllInformationsResponseDto } from '../dtos/project/paginate-project-all-informations-response.dto';
import { TeamInformationsResponseDto } from '../dtos/team/team-informations-response.dto';
import { ProjectCreateRequestDto } from '../dtos/project/project-create-request.dto';
import { ProjectInformationsResponseDto } from '../dtos/project/project-informations-response.dto';
import { LinkRepositoryRequestDto } from '../dtos/repository/link-repository-request.dto';
import { RepositoryDto as LinkRepositoryResponseDto } from '../dtos/repository/repository.dto';

export type ScanType = 'sast' | 'iac' | 'sca';

export interface InitiateConversationResponse {
    conversationId: string;
}

export class ApiService {
    private axiosInstance: AxiosInstance;
    // Store AuthService for the interceptor
    private authServiceInstance: AuthService;

    constructor(authService: AuthService) { // AuthService is injected
        this.authServiceInstance = authService; // Store the instance
        const baseURL = getApiBaseUrl();

        this.axiosInstance = axios.create({
            baseURL: baseURL,
        });

        this.axiosInstance.interceptors.request.use(
            async (config) => {
                // Use the stored instance to getApiKey
                const apiKey = await this.authServiceInstance.getApiKey();
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
                    console.error('[ApiService Interceptor] API Key is missing!');
                    // Reject to prevent API call without key
                    return Promise.reject(new Error('API Key is not configured.'));
                }
                return config;
            },
            (error) => {
                return Promise.reject(error);
            }
        );
    }

    // Method to allow external access (ex: Chatbot provider) to get the key
    public async getApiKey(): Promise<string | undefined> {
        return this.authServiceInstance.getApiKey();
    }

    async startScan(projectId: string, zipFilePath: string): Promise<StartScanResponseDto> {
        const operation = 'startScan';
        try {
            const formData = new FormData();
            formData.append('scan', fs.createReadStream(zipFilePath), 'workspace.zip');
            const response = await this.axiosInstance.post<StartScanResponseDto>(
                `/project/${projectId}/scan/start`,
                formData,
                {
                    headers: formData.getHeaders ? formData.getHeaders() : undefined,
                    timeout: 180000
                 }
            );
            const responseData = response.data as any;
            return new StartScanResponseDto(
                responseData?.success ?? true,
                responseData?.scanId ?? responseData?.message ?? 'Scan initiation info missing',
                responseData?.detectedLanguages
            );
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

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
                 console.warn(`[ApiService] ${operation} response missing 'vulnerabilities' array for projectId ${projectId}.`);
                 const baseResponse = response.data || { projectId: projectId, total: 0, vulnerabilities: [] };
                 return { ...baseResponse, vulnerabilities: [] };
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, projectId);
            return {
                projectId: projectId,
                projectName: '',
                page: 1,
                limit: 500,
                totalPages: 1,
                sort: '',
                order: '',
                severity: [],
                status: [],
                language: '',
                priority: [],
                vulnerabilities: [],
                total: 0,
                scanProjectInfo: {
                    scanId: '',
                    state: '',
                    createAt: new Date(),
                    scanType: ''
                },
                vulnCountByType: {
                    sast: 0,
                    iac: 0,
                    sca: 0
                }
            };
        }
    }

     async getVulnerabilityDetails(
        projectId: string, // Accept projectId here
        vulnerabilityId: string,
        scanType: ScanType
    ): Promise<GetProjectVulnerabilityByIdResponseDto> {
        const operation = `getVulnerabilityDetails (${scanType})`;
        try {
            // Use the provided projectId
            const response = await this.axiosInstance.get<GetProjectVulnerabilityByIdResponseDto>(
                `/project/${projectId}/results/${scanType}/${vulnerabilityId}`
            );
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, projectId);
            throw error;
        }
    }

    async getScanStatus(projectId: string, scanId: string): Promise<ScanResponseDto> {
        const operation = 'getScanStatus';
        try {
            const response = await this.axiosInstance.get<ScanResponseDto>(
                `/project/${projectId}/scan/${scanId}`
            );
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, projectId);
            throw error;
        }
    }

    async startConversation(requestDto: StartConversationRequestDto): Promise<InitiateConversationResponse> {
        const operation = 'startConversation';
        if (!requestDto.projectId) {
             const error = new Error(`[ApiService] ${operation} Error: Project ID is required.`);
             console.error(error.message);
             throw error;
        }
        const projectId = requestDto.projectId;
        try {
            const body = {
                 isVulnerabilityConversation: requestDto.isVulnerabilityConversation,
                 vulnerabilityId: requestDto.vulnerabilityId,
                 vulnerabilityType: requestDto.vulnerabilityType,
            };
            const response = await this.axiosInstance.post<InitiateConversationResponse>(
                 `/project/${projectId}/ai/conversation/start`,
                 body
            );
            if (response.data && typeof response.data.conversationId === 'string') {
                 return response.data;
            } else {
                 throw new Error(`Unexpected response format from ${operation}. Expected { conversationId: string }. Got: ${JSON.stringify(response.data)}`);
            }
        } catch (error) {
             this.handleApiError(error, operation, projectId);
             throw error;
        }
    }

    async continueConversation(requestDto: AddMessageConversationRequestDto): Promise<InitiateConversationResponse> {
        const operation = 'continueConversation';
         if (!requestDto.projectId || !requestDto.idConversation) {
             const error = new Error(`[ApiService] ${operation} Error: Project ID and Conversation ID are required.`);
             console.error(error.message);
             throw error;
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
                  throw new Error(`Unexpected response format from ${operation}. Expected { conversationId: string }. Got: ${JSON.stringify(response.data)}`);
             }
        } catch (error) {
             this.handleApiError(error, operation, projectId);
             throw error;
        }
    }

    // --- NOUVELLES MÉTHODES API (inchangées par rapport à la réponse précédente) ---
    async getOrganizations(): Promise<OrganizationInformationsResponseDto[]> {
        const operation = 'getOrganizations';
        try {
            const response = await this.axiosInstance.get<OrganizationInformationsResponseDto[]>('/organizations');
            if (!Array.isArray(response.data)) {
                 console.error(`[ApiService] ${operation}: Invalid response format. Expected an array. Got:`, response.data);
                 throw new Error(`Invalid response format from ${operation}. Expected an array.`);
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation);
            throw error;
        }
    }

    async getRepositories(organizationId: string): Promise<GetRepositoriesResponseDto> {
        const operation = 'getRepositories';
        try {
            const response = await this.axiosInstance.get<GetRepositoriesResponseDto>(`/organization/${organizationId}/github/repositories`);
             if (!response.data || !Array.isArray(response.data.repositories)) {
                console.warn(`[ApiService] ${operation}: Response format might be invalid for organization ${organizationId}.`, response.data);
                return { repositories: [], organizationId: organizationId };
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, `Org: ${organizationId}`);
            throw error;
        }
    }

    async getTeams(organizationId: string): Promise<TeamInformationsResponseDto[]> {
        const operation = 'getTeams';
        try {
            const response = await this.axiosInstance.get<TeamInformationsResponseDto[]>(`/organization/${organizationId}/teams`);
             if (!Array.isArray(response.data)) {
                 console.error(`[ApiService] ${operation}: Invalid response format for organization ${organizationId}. Expected an array. Got:`, response.data);
                 throw new Error(`Invalid response format from ${operation}. Expected an array.`);
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, `Org: ${organizationId}`);
            throw error;
        }
    }

    async createProject(teamId: string, projectName: string): Promise<ProjectInformationsResponseDto> {
        const operation = 'createProject';
        try {
            const requestBody = { name: projectName }; // Body simplifié basé sur l'API
            const response = await this.axiosInstance.post<ProjectInformationsResponseDto>(`/team/${teamId}/project`, requestBody);
             if (!response.data || !response.data.projectId) {
                console.error(`[ApiService] ${operation}: Invalid response format. Missing projectId.`, response.data);
                 throw new Error(`Invalid response format from ${operation}. Missing projectId.`);
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, `Team: ${teamId}`);
            throw error;
        }
    }

     async linkProject(organizationId: string, projectId: string, repositoryId: string): Promise<LinkRepositoryResponseDto> {
        const operation = 'linkProject';
        try {
            const requestBody = { repositoryId: repositoryId };
            const response = await this.axiosInstance.post<LinkRepositoryResponseDto>(
                `/organization/${organizationId}/project/${projectId}/github/link`, requestBody);
             if (!response.data || !response.data.id || response.data.projectId !== projectId) {
                console.error(`[ApiService] ${operation}: Invalid response format or projectId mismatch.`, response.data);
                 throw new Error(`Invalid response format or projectId mismatch from ${operation}.`);
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, `Org: ${organizationId}, Proj: ${projectId}`);
            throw error;
        }
    }

    async getProjectsOrganization(
        organizationId: string, pageSize: number = 100, page: number = 1, searchQuery: string = ''
    ): Promise<PaginatedProjectsAllInformationsResponseDto> {
        const operation = 'getProjectsOrganization';
        try {
            const params = { page: page.toString(), pageSize: pageSize.toString(), search: searchQuery };
            const response = await this.axiosInstance.get<PaginatedProjectsAllInformationsResponseDto>(
                `/organization/${organizationId}/projects`, { params });
             if (!response.data || !Array.isArray(response.data.projects)) {
                console.warn(`[ApiService] ${operation}: Response format might be invalid for organization ${organizationId}.`, response.data);
                 return { projects: [], totalPages: 0, totalProjects: 0, mainStatistics: response.data?.mainStatistics };
            }
            return response.data;
        } catch (error) {
            this.handleApiError(error, operation, `Org: ${organizationId}`);
            return { projects: [], totalPages: 0, totalProjects: 0, mainStatistics: undefined as any };
        }
    }

    // --- Gestionnaire d'erreurs (inchangé) ---
    private handleApiError(error: any, operation: string, contextInfo?: string): void {
        let userMessage = `Operation '${operation}' failed${contextInfo ? ` (${contextInfo})` : ''}.`;
        if (axios.isAxiosError(error)) {
             const axiosError = error as AxiosError<any>;
             if (axiosError.response) {
                 const status = axiosError.response.status;
                 const data = axiosError.response.data;
                 const apiErrorMessage = data?.message || data?.error || (typeof data === 'object' ? JSON.stringify(data) : data);
                 userMessage = `API Error (${status}) during ${operation}: ${apiErrorMessage || 'No additional details'}`;

                 if (status === 401) userMessage = 'API Authentication Failed: Invalid or missing API Key. Please check extension settings or use the "Update API Key" command.';
                 else if (status === 403) userMessage = `API Authorization Failed for ${operation}: Access Denied. Check permissions or Project ID validity.`;
                 else if (status === 404) userMessage = `API Error: Resource not found for ${operation}. Check context: ${contextInfo || 'N/A'}.`;
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
        console.error(`[ApiService] ${userMessage}`, error);

        if (error instanceof Error) {
            error.message = userMessage;
        } else {
            error = new Error(userMessage);
        }
    }
}