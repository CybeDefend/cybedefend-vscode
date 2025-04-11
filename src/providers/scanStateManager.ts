// src/providers/scanStateManager.ts
import * as vscode from 'vscode';
// Imports remain largely the same for DTOs and helpers
import { GetProjectVulnerabilitiesResponseDto, ScanProjectInfoDto, CountVulnerabilitiesCountByType } from '../dtos/result/response/get-project-vulnerabilities-response.dto';
import { DetailedVulnerability, VulnerabilitySeverityEnum } from '../dtos/result/details';
import { ScanType } from '../api/apiService';

// Constants for severity order/label remain the same
const SEVERITY_ORDER_MAP: Record<string, { order: number; label: string }> = {
    [VulnerabilitySeverityEnum.CRITICAL]: { order: 1, label: 'Critical' },
    [VulnerabilitySeverityEnum.HIGH]:     { order: 2, label: 'High' },
    [VulnerabilitySeverityEnum.MEDIUM]:   { order: 3, label: 'Medium' },
    [VulnerabilitySeverityEnum.LOW]:      { order: 4, label: 'Low' },
    [VulnerabilitySeverityEnum.INFO]:     { order: 5, label: 'Info' },
    [VulnerabilitySeverityEnum.UNKNOWN]:  { order: 99, label: 'Unknown' },
};
const getSeverityLabel = (severity?: string): string => {
    return SEVERITY_ORDER_MAP[severity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN]?.label || 'Unknown';
};
const getSeverityOrder = (severity?: string): number => {
    return SEVERITY_ORDER_MAP[severity?.toUpperCase() || VulnerabilitySeverityEnum.UNKNOWN]?.order || 99;
};


/**
 * Manages the state of the Cybex Scanner (loading, errors, results)
 * and notifies listeners (WebviewViewProviders) of changes.
 */
export class ScanStateManager { // Renamed class

    /** Event emitter for when state data changes. */
    // Renamed emitter to be more generic
    private _onDidStateChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidStateChange: vscode.Event<void> = this._onDidStateChange.event;

    // --- Public State (Readonly access recommended for consumers) ---
    private _isLoading: boolean = false;
    private _currentError: string | null = null;
    private _scanInfo?: ScanProjectInfoDto;
    private _vulnCounts?: CountVulnerabilitiesCountByType;
    private _totalVulnerabilities: number = 0;
    /** Stores vulnerabilities grouped by ScanType, then by normalized Severity Label. */
    private _groupedVulnerabilities: Map<ScanType, Map<string, DetailedVulnerability[]>> = new Map();

    // --- Public Getters for State ---
    public get isLoading(): boolean { return this._isLoading; }
    public get currentError(): string | null { return this._currentError; }
    public get scanInfo(): ScanProjectInfoDto | undefined { return this._scanInfo; }
    public get vulnCounts(): CountVulnerabilitiesCountByType | undefined { return this._vulnCounts; }
    public get totalVulnerabilities(): number { return this._totalVulnerabilities; }
    public get groupedVulnerabilities(): Map<ScanType, Map<string, DetailedVulnerability[]>> { return this._groupedVulnerabilities; }
    /** Helper to get vulnerabilities for a specific scan type, sorted by severity */
    public getVulnerabilitiesByType(scanType: ScanType): DetailedVulnerability[] {
        const typeMap = this._groupedVulnerabilities.get(scanType);
        if (!typeMap) return [];

        const sortedVulns: DetailedVulnerability[] = [];
        // Get severities, sort them by defined order, then flatten
        Array.from(typeMap.keys())
            .sort((a, b) => getSeverityOrder(a) - getSeverityOrder(b))
            .forEach(severityLabel => {
                sortedVulns.push(...(typeMap.get(severityLabel) || []));
            });
        return sortedVulns;
    }


    /**
     * Updates the manager's state based on API response or error, and notifies listeners.
     * @param response The full API response object, or null/undefined if clearing or error.
     * @param error Optional error message string.
     */
    public updateState(response?: GetProjectVulnerabilitiesResponseDto | null, error?: string): void {
        console.log('[ScanStateManager] Updating state...');
        this._isLoading = false; // Reset loading flag when updating
        this._currentError = error || null;

        if (this._currentError) {
            console.error('[ScanStateManager] Updating with error:', this._currentError);
            this.clearDataInternal(); // Clear data on error
        } else if (response) {
            this._scanInfo = response.scanProjectInfo;
            this._vulnCounts = response.vulnCountByType;
            this._totalVulnerabilities = response.total ?? response.vulnerabilities?.length ?? 0;
            this._groupVulnerabilities(response.vulnerabilities || []); // Group new vulnerabilities
            console.log(`[ScanStateManager] State updated. Total: ${this._totalVulnerabilities}`);
        } else {
            // No error, no response -> clear data
            this.clearDataInternal();
            console.log('[ScanStateManager] State cleared.');
        }

        // Notify listeners that the state has changed
        this._onDidStateChange.fire();
    }

    /**
     * Sets the manager to a loading state and notifies listeners.
     * @param loading Whether the manager is currently loading data.
     */
    public setLoading(loading: boolean): void {
        console.log(`[ScanStateManager] Setting loading state: ${loading}`);
        const stateChanged = this._isLoading !== loading || (loading && this._currentError !== null);
        this._isLoading = loading;
        if (loading) {
             // Clear previous data and error when loading starts
            this.clearDataInternal();
            this._currentError = null;
        }

        if (stateChanged) {
             this._onDidStateChange.fire(); // Notify about loading state change
        }
    }

    /** Clears all vulnerability data and summary info internally. */
    private clearDataInternal(): void {
        this._groupedVulnerabilities.clear();
        this._scanInfo = undefined;
        this._vulnCounts = undefined;
        this._totalVulnerabilities = 0;
        // Note: We don't clear _isLoading or _currentError here,
        // those are managed by setLoading and updateState.
    }


    /**
     * Groups vulnerabilities from the API response by ScanType and then by Severity Label.
     * (This logic remains the same as before)
     * @param vulnerabilities The flat list of vulnerabilities.
     */
    private _groupVulnerabilities(vulnerabilities: DetailedVulnerability[]): void {
        this._groupedVulnerabilities.clear(); // Start fresh

        for (const vuln of vulnerabilities) {
            const type: ScanType | undefined = vuln.vulnerability?.vulnerabilityType as ScanType;
            const severityLabel = getSeverityLabel(vuln.currentSeverity);

            if (type) {
                if (!this._groupedVulnerabilities.has(type)) {
                    this._groupedVulnerabilities.set(type, new Map<string, DetailedVulnerability[]>());
                }
                const typeMap = this._groupedVulnerabilities.get(type)!;

                if (!typeMap.has(severityLabel)) {
                    typeMap.set(severityLabel, []);
                }
                typeMap.get(severityLabel)!.push(vuln);
            } else {
                console.warn("[ScanStateManager] Could not determine scan type for vulnerability:", vuln.id);
            }
        }
         // No need to return anything, the state is updated internally
    }
}