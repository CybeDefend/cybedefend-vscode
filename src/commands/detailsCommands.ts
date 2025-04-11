// src/commands/detailsCommands.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from '../api/apiService';
import { DetailsWebviewProvider } from '../providers/detailsWebviewProvider';
import { DetailedVulnerability } from '../dtos/result/details'; // Ajuste chemin
import { getProjectId } from '../utilities/config';
import path from 'path';

/**
 * Handles showing the details for a selected vulnerability.
 * Fetches full details from the API.
 */
export async function showVulnerabilityDetailsCommand(
    vulnerabilityDataFromList: DetailedVulnerability, // Reçu comme argument du TreeItem
    inferredType: ScanType | undefined, // Reçu comme 2e argument du TreeItem
    apiService: ApiService, // Injecté ou instancié
    detailsProvider: DetailsWebviewProvider // Injecté ou instancié
) {
    if (!vulnerabilityDataFromList) {
        vscode.window.showErrorMessage('Cannot show details: No vulnerability data provided from the list.');
        return;
    }

    const projectId = getProjectId();
    if (!projectId) {
        vscode.window.showErrorMessage('Cannot show details: Project ID is not configured.');
        return;
    }

    // Utilise l'ID de la *détection* spécifique
    const vulnerabilityId = vulnerabilityDataFromList.id;
    if (!vulnerabilityId) {
         vscode.window.showErrorMessage('Cannot show details: Vulnerability ID is missing.');
         return;
    }

    // --- Déterminer le type de scan ---
    // Priorise le type inféré par le TreeItem, sinon essaie de deviner
    let scanType: ScanType | undefined = inferredType;
    if (!scanType) {
        console.warn("ScanType not passed from TreeItem, attempting inference...");
        // Logique de secours (moins fiable, préférer passer le type depuis le TreeItem)
         const metaType = (vulnerabilityDataFromList as any).vulnerability?.vulnerabilityType;
         if (metaType === 'sast' || 'dataFlowItems' in vulnerabilityDataFromList) scanType = 'sast';
         else if (metaType === 'iac') scanType = 'iac'; // Moins de propriétés distinctives
         else if (metaType === 'sca' || 'scaDetectedPackage' in vulnerabilityDataFromList) scanType = 'sca';
    }

    if (!scanType) {
        vscode.window.showErrorMessage(`Cannot determine vulnerability type for ID: ${vulnerabilityId}. Cannot fetch details.`);
        return;
    }

    console.log(`Workspaceing details for ${scanType} vulnerability: ${vulnerabilityId}`);

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Window, // Indicateur discret
            title: `Loading vulnerability details...`,
            cancellable: false // Pas annulable pour une requête rapide
        }, async () => {
            // Récupérer les détails COMPLETS depuis l'API
            const detailedResponse = await apiService.getVulnerabilityDetails(projectId, vulnerabilityId, scanType as ScanType);

            // Afficher les détails dans le webview
            // 'detailedResponse' est GetProjectVulnerabilityByIdResponseDto
            // 'show' attend cet objet maintenant
            detailsProvider.show(detailedResponse);
        });

    } catch (error: any) {
        console.error(`Failed to get or show details for ${vulnerabilityId}:`, error);
        vscode.window.showErrorMessage(`Could not load vulnerability details: ${error.message}`);
    }
}

/**
 * Handles opening the file location specified by the details webview.
 */
export async function openFileLocationCommand(filePath?: string, lineNumber?: number) {
   if (!filePath) {
       vscode.window.showWarningMessage("Cannot open file: File path is missing.");
       return;
   }
   // Utilise 1 comme ligne par défaut si non fourni ou invalide
   const line = (lineNumber && lineNumber > 0) ? lineNumber : 1;

   try {
       console.log(`Opening file: ${filePath} at line ${line}`);
       const uri = vscode.Uri.file(filePath); // Crée l'URI à partir du chemin absolu
       const document = await vscode.workspace.openTextDocument(uri);
       const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);

       // Aller à la ligne (ajuster lineNumber si 0-based vs 1-based)
       const lineToGo = Math.max(0, line - 1); // Convertir en 0-based pour l'API
       const position = new vscode.Position(lineToGo, 0); // Début de la ligne
       const range = new vscode.Range(position, position);
       editor.selection = new vscode.Selection(position, position); // Placer le curseur
       editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport); // Centrer la vue
   } catch (error: any) {
       console.error(`Failed to open file location: ${filePath}:${line}`, error);
       vscode.window.showErrorMessage(`Could not open file "${path.basename(filePath)}": ${error.message}`);
   }
}