// src/commands/scanCommands.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import { glob } from 'glob';
import axios from 'axios';
import { ApiService, ScanType } from '../api/apiService'; // Assure-toi que ScanType est exporté depuis apiService ou défini globalement
import { AuthService } from '../auth/authService';
import { SummaryViewProvider } from '../providers/summaryViewProvider';
import { SastViewProvider } from '../providers/sastViewProvider';
import { IacViewProvider } from '../providers/iacViewProvider';
import { ScaViewProvider } from '../providers/scaViewProvider';
import { getProjectId } from '../utilities/config';
import { createMockVulnerabilitiesResponse } from '../test/mocks/mockVulnerabilities'; // Ajuste le chemin si nécessaire
import { DetailedVulnerability, IacVulnerabilityDetectionDto, SastVulnerabilityDetectionDto, ScaVulnerabilityWithCvssDto } from '../dtos/result/details';
import { GetProjectVulnerabilitiesResponseDto, CountVulnerabilitiesCountByType, ScanProjectInfoDto } from '../dtos/result/response/get-project-vulnerabilities-response.dto';

const POLLING_INTERVAL_MS = 5000; // 5 seconds polling interval
const MAX_POLLING_ATTEMPTS = 60; // 5 minutes timeout (60 * 5s)

// --- Development Switch ---
// Set to true to use mock data for UI testing, false to use the real API.
const USE_MOCK_DATA = true;
// --- ------------------ ---

/**
 * Executes the 'Start Scan' command logic.
 * This involves checking prerequisites, optionally using mock data,
 * archiving the workspace, calling the API, polling for results,
 * and updating the relevant webview providers.
 *
 * @param context The extension context.
 * @param authService The authentication service instance.
 * @param apiService The API service instance.
 * @param summaryProvider The provider for the Summary webview.
 * @param sastProvider The provider for the SAST findings webview.
 * @param iacProvider The provider for the IaC findings webview.
 * @param scaProvider The provider for the SCA findings webview.
 */
export async function startScanCommand(
    context: vscode.ExtensionContext,
    authService: AuthService,
    apiService: ApiService,
    summaryProvider: SummaryViewProvider,
    sastProvider: SastViewProvider,
    iacProvider: IacViewProvider,
    scaProvider: ScaViewProvider
): Promise<void> {

    // 1. Check for an open workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a project folder before starting a scan.');
        return;
    }
    const workspacePath = workspaceFolder.uri.fsPath;

    // 2. Ensure API Key is configured (prompts user if needed)
    if (!await authService.ensureApiKeyIsSet()) {
        console.log('[ScanCommand] API Key setup cancelled or failed.');
        return; // Exit if user cancelled key input
    }

    // 3. Ensure Project ID is configured
    const projectId = getProjectId();
    if (!projectId) {
        vscode.window.showErrorMessage('Project ID is not configured. Please set "cybedefendScanner.projectId" in your VS Code settings.');
        return;
    }

    // --- ============================ ---
    // --- MOCK DATA HANDLING SECTION ---
    // --- ============================ ---
    if (USE_MOCK_DATA) {
        console.log("[ScanCommand] --- Using Mock Data (USE_MOCK_DATA is true) ---");
        summaryProvider.setLoading(true, "Loading mock data...");
        sastProvider.updateFindings([]); iacProvider.updateFindings([]); scaProvider.updateFindings([]); // Clear previous findings
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `CybeDefend: Loading mock data...`,
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Generating mock results...' });
                await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay
                try {
                    const mockResponse = createMockVulnerabilitiesResponse(projectId);
                    summaryProvider.updateSummary({ // Update summary view
                        total: mockResponse.total,
                        counts: mockResponse.vulnCountByType,
                        scanInfo: mockResponse.scanProjectInfo
                    });
                    distributeFindingsToProviders( // Update findings views
                        mockResponse.vulnerabilities,
                        sastProvider, iacProvider, scaProvider
                    );
                    vscode.window.showInformationMessage(`Mock Scan Complete: Displaying ${mockResponse.vulnerabilities.length} mock vulnerabilities.`);
                } catch (mockError: any) {
                     console.error("Error loading/processing mock data:", mockError);
                     summaryProvider.updateError(`Failed to load mock data: ${mockError.message}`);
                }
            }
        );
        return; // Exit command after handling mock data
    }
    // --- ============================ ---
    // --- END MOCK DATA HANDLING     ---
    // --- ============================ ---


    // --- REAL API LOGIC ---
    console.log("[ScanCommand] --- Using Real API (USE_MOCK_DATA is false) ---");
    summaryProvider.setLoading(true, "Starting scan...");
    sastProvider.updateFindings([]); iacProvider.updateFindings([]); scaProvider.updateFindings([]);

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `CybeDefend: Scanning '${workspaceFolder.name}'...`,
            cancellable: true,
        },
        async (progress, token) => {
            let zipFilePath: string | undefined = undefined;
            let scanId: string | undefined = undefined;

            try {
                // Step A: Create project archive (Zip)
                progress.report({ increment: 10, message: 'Archiving project...' });
                summaryProvider.setLoading(true, "Archiving project...");
                zipFilePath = await createWorkspaceZip(workspacePath, token);
                // Cancellation check is handled within createWorkspaceZip

                // Step B: Initiate scan via API
                progress.report({ increment: 20, message: 'Initiating API scan...' });
                summaryProvider.setLoading(true, "Initiating API scan...");
                const startResponse = await apiService.startScan(projectId, zipFilePath);

                // --- TODO: Critical adaptation needed here ---
                 scanId = startResponse.message; // Or startResponse.scanId ? Verify your DTO and API!
                 if (!scanId) { throw new Error('API did not return a valid scan ID.'); }
                 console.log(`[ScanCommand] Scan initiated with ID: ${scanId}`);
                 if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }

                // Step C: Poll for scan completion
                progress.report({ increment: 30, message: `Scan ${scanId} running...` });
                summaryProvider.setLoading(true, `Scan ${scanId} running... Waiting...`);
                const finalScanStatus = await pollScanStatus(projectId, scanId, apiService, progress, token);
                if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }
                if (finalScanStatus !== 'COMPLETED') { throw new Error(`Scan finished with status: ${finalScanStatus}.`); }

                // Step D: Fetch results (run in parallel for efficiency)
                progress.report({ increment: 80, message: 'Fetching results...' });
                summaryProvider.setLoading(true, "Fetching results...");

                 const [sastResults, iacResults, scaResults] = await Promise.all([
                     apiService.getScanResults(projectId, 'sast', { pageSizeNumber: 500 }).catch(e => { console.error("Failed to fetch SAST results:", e); return null; }),
                     apiService.getScanResults(projectId, 'iac', { pageSizeNumber: 500 }).catch(e => { console.error("Failed to fetch IAC results:", e); return null; }),
                     apiService.getScanResults(projectId, 'sca', { pageSizeNumber: 500 }).catch(e => { console.error("Failed to fetch SCA results:", e); return null; })
                 ]);
                 if (token.isCancellationRequested) { throw new Error('Cancelled.'); }

                // Step E: Process results and update UI
                progress.report({ increment: 100, message: 'Processing results...' });

                 const firstValidResponse = sastResults || iacResults || scaResults;
                 const allVulnerabilities = [
                     ...(sastResults?.vulnerabilities || []),
                     ...(iacResults?.vulnerabilities || []),
                     ...(scaResults?.vulnerabilities || [])
                 ];

                 if (firstValidResponse) {
                     const summaryData = {
                         total: allVulnerabilities.length,
                         counts: new CountVulnerabilitiesCountByType(
                             sastResults?.vulnerabilities?.length || 0,
                             iacResults?.vulnerabilities?.length || 0,
                             scaResults?.vulnerabilities?.length || 0
                         ),
                         scanInfo: firstValidResponse.scanProjectInfo ?? new ScanProjectInfoDto(scanId, 'COMPLETED', new Date())
                     };
                     summaryProvider.updateSummary(summaryData);
                 } else {
                      throw new Error("Failed to fetch any scan results.");
                 }

                 distributeFindingsToProviders(allVulnerabilities, sastProvider, iacProvider, scaProvider);
                 vscode.window.showInformationMessage(`Scan complete. Found ${allVulnerabilities.length} total vulnerabilities.`);

            } catch (error: any) {
                 handleCommandError(error, summaryProvider); // Show error in summary
                 // Clear other views on error
                 sastProvider.updateFindings([]);
                 iacProvider.updateFindings([]);
                 scaProvider.updateFindings([]);
            } finally {
                // Step F: Cleanup zip file
                if (zipFilePath) { await cleanupZipFile(zipFilePath); }
                // Setting loading to false is handled by updateSummary/updateError
                // summaryProvider.setLoading(false); // No longer needed here
            }
        }
    );
}


// =============================================================================
// Helper Functions (Moved here for clarity within the command's context)
// =============================================================================

/**
 * Polls the API for the status of a given scan ID until it completes or fails.
 * Updates the progress indicator during polling.
 * @param projectId The project ID.
 * @param scanId The scan ID to poll.
 * @param apiService API service instance.
 * @param progress Progress reporter.
 * @param token Cancellation token.
 * @returns The final status string ('COMPLETED' or 'FAILED').
 * @throws Error if scan fails, times out, or polling encounters critical API errors.
 */
async function pollScanStatus(
    projectId: string,
    scanId: string,
    apiService: ApiService,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
): Promise<string> {
    let attempts = 0;
    const maxAttempts = MAX_POLLING_ATTEMPTS;
    const interval = POLLING_INTERVAL_MS;
    console.log(`[ScanCommand] Starting polling for scan ${scanId} (Interval: ${interval}ms, Max Attempts: ${maxAttempts})`);

    while (attempts < maxAttempts) {
        if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }
        attempts++;
        try {
            const statusResponse = await apiService.getScanStatus(projectId, scanId);
            const currentStatus = statusResponse.state?.toUpperCase() || 'UNKNOWN';
            console.log(`[ScanCommand] Poll attempt ${attempts}: Status = ${currentStatus}`);

            // Calculate progress increment (distribute remaining progress over polling attempts)
            // Example: If polling starts at 30% and ends at 80%, distribute 50% over maxAttempts.
            const progressIncrement = (80 - 30) / maxAttempts;
            progress.report({
                increment: progressIncrement,
                message: `Status: ${currentStatus} (Attempt ${attempts}/${maxAttempts})`
            });

            if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED') {
                console.log(`[ScanCommand] Polling finished for scan ${scanId} with status: ${currentStatus}`);
                return currentStatus;
            }
        } catch (pollError: any) {
            console.error(`[ScanCommand] Polling attempt ${attempts} failed:`, pollError.message);
            // Stop polling immediately on critical errors
            if (axios.isAxiosError(pollError) && pollError.response?.status && [401, 403, 404].includes(pollError.response.status)) {
                throw new Error(`Polling failed: API returned status ${pollError.response.status}. Aborting.`);
            }
            // Optionally add a condition to stop after several consecutive errors
        }
        // Wait before the next polling attempt
        await new Promise(resolve => setTimeout(resolve, interval));
    } // End while loop

    // If the loop finishes without returning a final status
    throw new Error(`Scan polling timed out after ${attempts} attempts.`);
}

/**
 * Creates a zip archive of the workspace directory, filtering common excludes.
 * @param workspacePath Absolute path to the workspace folder.
 * @param token CancellationToken to observe for cancellation requests.
 * @returns Promise resolving with the path to the created zip file.
 */
async function createWorkspaceZip(workspacePath: string, token: vscode.CancellationToken): Promise<string> {
     const tempDir = os.tmpdir();
     const zipFileName = `cybedefend-scan-${Date.now()}.zip`;
     const zipFilePath = path.join(tempDir, zipFileName);
     console.log(`[ZipUtil] Creating archive at: ${zipFilePath}`);

     const output = fs.createWriteStream(zipFilePath);
     const archive = archiver('zip', { zlib: { level: 9 } }); // Use compression

     const archivePromise = new Promise<void>((resolve, reject) => {
         let cancellationListener = token?.onCancellationRequested(() => {
             console.log('[ZipUtil] Cancellation requested.');
             archive.abort();
             // Ensure stream is closed before unlinking, handle potential errors
             output.close((err) => {
                 if (err) console.error("Error closing output stream on cancel:", err);
                 fs.unlink(zipFilePath, (unlinkErr) => {
                     if (unlinkErr) console.error("Error removing partial zip on cancel:", unlinkErr);
                     reject(new Error('Cancelled by user.'));
                 });
             });
         });

         output.on('close', () => { cancellationListener?.dispose(); if (!token?.isCancellationRequested) { resolve(); } });
         output.on('error', (err) => { cancellationListener?.dispose(); console.error('[ZipUtil] Output stream error:', err); reject(err); });
         archive.on('warning', (err) => { if (err.code !== 'ENOENT') { cancellationListener?.dispose(); console.error('[ZipUtil] Archiver warning:', err); reject(err); } else { console.warn('[ZipUtil] Archiver warning (ENOENT ignored):', err); }});
         archive.on('error', (err) => { cancellationListener?.dispose(); console.error('[ZipUtil] Archiver fatal error:', err); reject(err); });
     });

     archive.pipe(output);

     // Use glob for efficient file finding and exclusion
     console.log(`[ZipUtil] Globbing files in: ${workspacePath}`);
     const files = await glob('**/*', {
         cwd: workspacePath,
         dot: false,         // Exclude dotfiles/folders like .git, .vscode
         nodir: true,        // Include only files
         ignore: ['node_modules/**', '.git/**', '**/.*', '.*', 'dist/**', 'out/**'], // Common ignores + build outputs
         absolute: false     // Relative paths needed for archive structure
     });
      if (token.isCancellationRequested) throw new Error('Cancelled by user.');
     console.log(`[ZipUtil] Found ${files.length} files to archive.`);

     // Add files to archive
     for (const file of files) {
          if (token.isCancellationRequested) throw new Error('Cancelled by user.');
         const sourcePath = path.join(workspacePath, file);
         archive.file(sourcePath, { name: file }); // name: use relative path inside archive
     }

     console.log('[ZipUtil] Finalizing archive...');
     await archive.finalize(); // Wait for archive data to be written
     await archivePromise;     // Wait for stream 'close' or 'error'
     console.log(`[ZipUtil] Archive finalized: ${zipFilePath}`);
     return zipFilePath;
}

/**
 * Safely deletes the temporary zip file.
 * @param zipFilePath Path to the zip file to delete.
 */
async function cleanupZipFile(zipFilePath: string): Promise<void> {
     try {
         await fs.promises.unlink(zipFilePath);
         console.log('[ZipUtil] Temporary zip file deleted:', zipFilePath);
     } catch (cleanupError) {
         console.error('[ZipUtil] Failed to delete temporary zip file:', cleanupError);
     }
}

/**
 * Handles command errors by logging, showing a message, and updating the summary view.
 * @param error The caught error object.
 * @param summaryProvider The SummaryViewProvider instance.
 */
function handleCommandError(error: any, summaryProvider: SummaryViewProvider): void {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    // Avoid showing 'Cancelled' as an error notification
    if (!errorMessage.toLowerCase().includes('cancel')) {
        console.error('[Command Error]', error); // Log full error for debugging
        vscode.window.showErrorMessage(`Operation Failed: ${errorMessage}`);
        summaryProvider.updateError(errorMessage); // Update summary view with error state
    } else {
        vscode.window.showInformationMessage('Operation cancelled.');
        summaryProvider.updateState({ isReady: true }); // Reset summary to ready state
    }
}

/**
 * Distributes the fetched vulnerabilities to the corresponding view providers.
 * @param allVulns Array of all vulnerabilities (mixed types).
 * @param sastProvider Provider for SAST findings.
 * @param iacProvider Provider for IaC findings.
 * @param scaProvider Provider for SCA findings.
 */
function distributeFindingsToProviders(
    allVulns: DetailedVulnerability[],
    sastProvider: SastViewProvider,
    iacProvider: IacViewProvider,
    scaProvider: ScaViewProvider
): void {
    const sastVulns: SastVulnerabilityDetectionDto[] = [];
    const iacVulns: IacVulnerabilityDetectionDto[] = [];
    const scaVulns: ScaVulnerabilityWithCvssDto[] = [];

    for (const vuln of allVulns) {
        // Use the reliable discriminator
        const type = vuln.vulnerability?.vulnerabilityType;
        if (type === 'sast') {
            sastVulns.push(vuln as SastVulnerabilityDetectionDto);
        } else if (type === 'iac') {
            iacVulns.push(vuln as IacVulnerabilityDetectionDto);
        } else if (type === 'sca') {
            scaVulns.push(vuln as ScaVulnerabilityWithCvssDto);
        } else {
            console.warn(`[Distribute] Unknown vulnerability type found:`, vuln);
        }
    }

    // Update each provider with its filtered list
    sastProvider.updateFindings(sastVulns);
    iacProvider.updateFindings(iacVulns);
    scaProvider.updateFindings(scaVulns);

    console.log(`[Distribute] Findings distributed: SAST(${sastVulns.length}), IAC(${iacVulns.length}), SCA(${scaVulns.length})`);
}