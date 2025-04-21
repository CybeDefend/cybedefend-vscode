// src/providers/scanStateManager.ts
import * as vscode from 'vscode';
import { DetailedVulnerability } from '../dtos/result/details'; // Adjust path if needed
import { CountVulnerabilitiesCountByType, GetProjectVulnerabilitiesResponseDto, ScanProjectInfoDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto'; // Adjust path if needed

/**
 * Manages and notifies about the state of the last scan results.
 * Used to decouple scan command from UI providers needing updates.
 */
export class ScanStateManager {
    private _isLoading: boolean = false;
    private _error: string | null = null;
    // Store the full last successful response for comprehensive state
    private _lastScanResponse: GetProjectVulnerabilitiesResponseDto | null = null;

    private readonly _onDidChangeState = new vscode.EventEmitter<void>();
    /** Event fired when the loading state, error, or results data changes. */
    public readonly onDidStateChange: vscode.Event<void> = this._onDidChangeState.event;

    /** Gets whether a scan is currently considered in progress. */
    public get isLoading(): boolean {
        return this._isLoading;
    }

    /** Gets the error message from the last failed scan/fetch, or null. */
    public get error(): string | null {
        return this._error;
    }

    /** Gets the full results DTO of the last successful scan, or null. */
    public get lastScanResponse(): GetProjectVulnerabilitiesResponseDto | null {
        return this._lastScanResponse;
    }

    /** Gets the Scan info from the last scan */
    public get scanInfo(): ScanProjectInfoDto | undefined {
        return this._lastScanResponse?.scanProjectInfo;
    }

    /** Gets the counts by type from the last scan */
    public get vulnCounts(): CountVulnerabilitiesCountByType | undefined {
        return this._lastScanResponse?.vulnCountByType;
    }

    /** Gets the total number of vulnerabilities from the last successful scan. */
    public get totalVulnerabilities(): number {
        return this._lastScanResponse?.total ?? 0;
    }

    /** Gets the raw vulnerability list from the last successful scan. */
    public get vulnerabilities(): DetailedVulnerability[] {
        return this._lastScanResponse?.vulnerabilities || [];
    }


    /**
     * Sets the loading state. Clears errors when loading starts.
     * Notifies listeners if the loading state changes.
     * @param loading - True if loading, false otherwise.
     */
    public setLoading(loading: boolean): void {
        const stateChanged = this._isLoading !== loading || (loading && this._error !== null);
        this._isLoading = loading;
        if (loading) {
            this._error = null;
        }
        if (stateChanged) {
            this._onDidChangeState.fire();
        }
    }

    /**
     * Updates the state with new scan results or an error.
     * Implicitly sets loading to false. Notifies listeners.
     * @param results - The combined scan results DTO, or null if an error occurred.
     * @param error - An error object if the scan failed.
     */
    public updateState(results: GetProjectVulnerabilitiesResponseDto | null, error?: Error | null): void {
        this._isLoading = false;

        if (error) {
            const errorMessage = error.message || 'An unknown error occurred during the scan.';
            console.error("[ScanStateManager] Updating with error:", errorMessage);
            this._error = errorMessage;
            this.clearDataInternal(); // Clear data on error
        } else if (results) {
            this._error = null;
            this._lastScanResponse = results;
        } else {
            this._error = null;
            this.clearDataInternal();
        }
        this._onDidChangeState.fire(); // Notify listeners
    }

    /** Resets the state, e.g., when opening a new workspace or clearing results */
    public resetState(): void {
        const changed = this._isLoading || this._error !== null || this._lastScanResponse !== null;
        this._isLoading = false;
        this._error = null;
        this.clearDataInternal();
        if (changed) {
            this._onDidChangeState.fire();
        }
    }

    /** Clears all vulnerability data and summary info internally. */
    private clearDataInternal(): void {
        this._lastScanResponse = null;
        // Note: isLoading and _error are handled by setLoading/updateState
    }
}