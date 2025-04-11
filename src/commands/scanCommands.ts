// src/commands/scanCommands.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver'; // Assure-toi que @types/archiver est installé
import { glob } from 'glob'; // Assure-toi que glob et @types/glob sont installés
import { ApiService, ScanType } from '../api/apiService';
import { AuthService } from '../auth/authService';
import { ActivityBarProvider } from '../providers/activityBarProvider';
import axios from 'axios'; // Import axios pour isAxiosError
import { getProjectId } from '../utilities/config'; // Vérifie le chemin
// --- Importe les données mockées ---
import { createMockVulnerabilitiesResponse } from '../test/mocks/mockVulnerabilities'; // Ajuste le chemin si nécessaire

const POLLING_INTERVAL_MS = 5000; // 5 secondes
const MAX_POLLING_ATTEMPTS = 60; // 5 minutes max

// --- ============================================= ---
// --- Bascule pour activer/désactiver les données mockées ---
// --- Mets à true pour tester l'UI sans API.          ---
// --- Mets à false pour utiliser l'API réelle.         ---
const USE_MOCK_DATA = true;
// --- ============================================= ---


/**
 * Handles the logic for the 'Start Scan' command.
 * @param context The extension context.
 * @param authService Authentication service instance.
 * @param apiService API service instance.
 * @param activityBarProvider Activity Bar data provider instance.
 */
export async function startScanCommand(
    context: vscode.ExtensionContext,
    authService: AuthService,
    apiService: ApiService,
    activityBarProvider: ActivityBarProvider
): Promise<void> {

    // 1. Vérifier le dossier de travail
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Please open a project folder before starting a scan.');
        return;
    }
    const workspacePath = workspaceFolder.uri.fsPath;

    // 2. Vérifier la clé API (invite si manquante)
    if (!await authService.ensureApiKeyIsSet()) {
        return; // L'utilisateur a annulé
    }

    // 3. Vérifier le Project ID
    const projectId = getProjectId();
    if (!projectId) {
        vscode.window.showErrorMessage('Project ID is not configured. Please set "cybexScanner.projectId" in your VS Code settings.');
        return;
    }

    // --- ============================================= ---
    // --- Logique pour utiliser les données mockées      ---
    // --- ============================================= ---
    if (USE_MOCK_DATA) {
        console.log("--- Using Mock Data (USE_MOCK_DATA is true) ---");
        activityBarProvider.setLoading(true);
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Cybex Scanner: Loading mock data...`,
                cancellable: false // Pas d'annulation pour les mocks
            },
            async (progress) => {
                progress.report({ increment: 50, message: 'Generating mock results...' });
                // Simule une petite attente
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    const mockResponse = createMockVulnerabilitiesResponse(projectId); // Utilise la fonction du fichier mock
                    activityBarProvider.refresh(mockResponse); // Met à jour l'UI avec les mocks
                    vscode.window.showInformationMessage(`Mock Scan Complete: Displaying ${mockResponse.vulnerabilities.length} mock vulnerabilities.`);
                } catch (mockError: any) {
                     console.error("Error loading/processing mock data:", mockError);
                     vscode.window.showErrorMessage(`Failed to load mock data: ${mockError.message}`);
                     activityBarProvider.refresh(null, `Failed to load mock data: ${mockError.message}`);
                 } finally {
                    activityBarProvider.setLoading(false);
                }
            }
        );
        return; // Important: Sortir ici pour ne pas exécuter le code de l'API réelle
    }
    // --- ============================================= ---
    // --- Fin de la logique pour les données mockées    ---
    // --- Le code ci-dessous ne s'exécute que si      ---
    // --- USE_MOCK_DATA est false                     ---
    // --- ============================================= ---


    // 4. Mettre l'UI en mode chargement (pour l'appel réel)
    console.log("--- Using Real API (USE_MOCK_DATA is false) ---");
    activityBarProvider.setLoading(true);

    // 5. Exécuter le scan réel avec indicateur de progression
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Cybex Scanner: Starting scan for '${workspaceFolder.name}'...`,
            cancellable: true,
        },
        async (progress, token) => {
            let zipFilePath: string | undefined = undefined;
            let scanId: string | undefined = undefined;

            try {
                // A. Créer l'archive ZIP
                progress.report({ increment: 10, message: 'Archiving project...' });
                zipFilePath = await createWorkspaceZip(workspacePath, token);
                // L'annulation est gérée dans createWorkspaceZip

                // B. Démarrer le scan via l'API
                progress.report({ increment: 20, message: 'Initiating scan via API...' });
                const startResponse = await apiService.startScan(projectId!, zipFilePath);

                // --- ADAPTATION REQUISE ICI pour scanId ---
                 scanId = startResponse.message; // Ou startResponse.scanId si tu as corrigé le DTO/API
                 if (!scanId) { throw new Error('API did not return a valid scan ID after starting the scan.'); }
                 console.log(`Scan initiated with ID: ${scanId}`);
                 if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }

                // C. Attendre la fin du scan (Polling)
                progress.report({ increment: 30, message: `Scan ${scanId} running... Waiting...` });
                const finalScanStatus = await pollScanStatus(projectId!, scanId, apiService, progress, token);
                if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }

                if (finalScanStatus !== 'COMPLETED') {
                    throw new Error(`Scan finished with status: ${finalScanStatus}.`);
                }

                // D. Récupérer les résultats (Exemple: SAST)
                progress.report({ increment: 80, message: 'Fetching scan results...' });
                const results = await apiService.getScanResults(projectId!, 'sast', { pageSizeNumber: 500 });
                // TODO: Récupérer et fusionner potentiellement IAC/SCA ici
                if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }

                // E. Mettre à jour l'UI
                progress.report({ increment: 100, message: 'Displaying results...' });
                activityBarProvider.refresh(results);
                const count = results.vulnerabilities?.length || 0;
                vscode.window.showInformationMessage(`Scan complete. Found ${count} vulnerabilities.`);

            } catch (error: any) {
                 handleCommandError(error, activityBarProvider);
            } finally {
                // F. Nettoyer le ZIP
                if (zipFilePath) {
                    await cleanupZipFile(zipFilePath);
                }
                // Assurer que le loading est enlevé (sauf si annulé plus tôt et déjà géré)
                 activityBarProvider.setLoading(false);
            }
        }
    );
}

// --- Fonctions Helper (pollScanStatus, createWorkspaceZip, cleanupZipFile, handleCommandError) ---
// (Ces fonctions restent inchangées par rapport à la version précédente, assure-toi qu'elles sont présentes)

/** Polls the scan status */
async function pollScanStatus(
    projectId: string,
    scanId: string,
    apiService: ApiService,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
): Promise<string> {
    let attempts = 0;
    while (attempts < MAX_POLLING_ATTEMPTS) {
        if (token.isCancellationRequested) { throw new Error('Cancelled by user.'); }
        attempts++;
        try {
            const statusResponse = await apiService.getScanStatus(projectId, scanId);
            const currentStatus = statusResponse.state?.toUpperCase() || 'UNKNOWN';
            progress.report({
                increment: Math.round(50 / MAX_POLLING_ATTEMPTS),
                message: `Status: ${currentStatus} (Attempt ${attempts}/${MAX_POLLING_ATTEMPTS})`
            });
            if (currentStatus === 'COMPLETED' || currentStatus === 'FAILED') {
                return currentStatus;
            }
        } catch (pollError: any) {
            console.error(`Polling attempt ${attempts} failed:`, pollError);
            if (axios.isAxiosError(pollError) && pollError.response?.status && [401, 403, 404].includes(pollError.response.status)) {
                throw new Error(`Failed to poll scan status (${pollError.response.status}). Aborting.`);
            }
        }
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));
    }
    throw new Error(`Scan polling timed out after ${attempts} attempts.`);
}

/** Creates a zip archive */
async function createWorkspaceZip(workspacePath: string, token: vscode.CancellationToken): Promise<string> {
     const tempDir = os.tmpdir();
     const zipFileName = `cybex-scan-${Date.now()}.zip`;
     const zipFilePath = path.join(tempDir, zipFileName);
     console.log(`Creating archive at: ${zipFilePath}`);
     const output = fs.createWriteStream(zipFilePath);
     const archive = archiver('zip', { zlib: { level: 9 } });
     const archivePromise = new Promise<void>((resolve, reject) => {
         let cancellationListener: vscode.Disposable | undefined;
         if (token) {
             cancellationListener = token.onCancellationRequested(() => {
                 console.log('Cancellation requested during archiving.');
                 archive.abort();
                 output.close(() => fs.unlink(zipFilePath, (err) => reject(new Error('Cancelled by user.'))));
             });
         }
         output.on('close', () => { cancellationListener?.dispose(); if (!token.isCancellationRequested) { resolve(); } });
         output.on('error', (err) => { cancellationListener?.dispose(); reject(err); });
         archive.on('warning', (err) => { if (err.code !== 'ENOENT') { cancellationListener?.dispose(); reject(err); } else { console.warn('Archiver warning:', err); }});
         archive.on('error', (err) => { cancellationListener?.dispose(); reject(err); });
     });
     archive.pipe(output);
     const files = await glob('**/*', { cwd: workspacePath, dot: false, nodir: true, ignore: ['node_modules/**', '.git/**', '**/.*', '.*'], absolute: false });
     if (token.isCancellationRequested) throw new Error('Cancelled by user.');
     for (const file of files) { if (token.isCancellationRequested) throw new Error('Cancelled by user.'); archive.file(path.join(workspacePath, file), { name: file }); }
     await archive.finalize();
     await archivePromise;
     console.log(`Archive finalized: ${zipFilePath}`);
     return zipFilePath;
}

/** Cleans up the temporary zip file */
async function cleanupZipFile(zipFilePath: string): Promise<void> {
     try {
         await fs.promises.unlink(zipFilePath);
         console.log('Temporary zip file deleted:', zipFilePath);
     } catch (cleanupError) {
         console.error('Failed to delete temporary zip file:', cleanupError);
     }
}

/** Centralized error handling */
function handleCommandError(error: any, activityBarProvider: ActivityBarProvider): void {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    if (errorMessage !== 'Cancelled by user.') {
        console.error('Command Execution Error:', error);
        vscode.window.showErrorMessage(`Operation Failed: ${errorMessage}`);
        activityBarProvider.refresh(null, errorMessage);
    } else {
        vscode.window.showInformationMessage('Operation cancelled by user.');
        activityBarProvider.refresh(null, 'Operation Cancelled');
    }
}