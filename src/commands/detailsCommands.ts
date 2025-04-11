// src/commands/detailsCommands.ts
import * as vscode from 'vscode';
import { ApiService, ScanType } from '../api/apiService';
import { DetailsWebviewViewProvider } from '../providers/detailsWebviewProvider';
import { DetailedVulnerability } from '../dtos/result/details';
import { getProjectId } from '../utilities/config';
import path from 'path';
import { createMockDetailsResponse } from '../test/mocks/mockVulnerabilities';

const USE_MOCK_DATA_DETAILS = true;

/**
 * Handles showing the details for a selected vulnerability.
 * Uses the WebviewPanel based approach instead of the WebviewView.
 */
export async function showVulnerabilityDetailsCommand(
    vulnerabilityDataFromList: DetailedVulnerability,
    inferredType: ScanType | undefined,
    apiService: ApiService,
    detailsViewProvider: DetailsWebviewViewProvider
) {
    if (!vulnerabilityDataFromList) { 
        vscode.window.showErrorMessage('No vulnerability data provided');
        return; 
    }
    
    console.log(`[DetailsCommand] Received request for ID: ${vulnerabilityDataFromList.id}`);
    
    if (USE_MOCK_DATA_DETAILS) { /* ... logique mock ... */
        try {
            const projectId = getProjectId() || 'mock-project-id';
            const mockDetailedResponse = createMockDetailsResponse(vulnerabilityDataFromList);
            detailsViewProvider.updateContent(mockDetailedResponse);
        } catch (mockError: any) {
            console.error("Error creating or showing mock details:", mockError);
            vscode.window.showErrorMessage(`Failed to show mock details: ${mockError.message}`);
            detailsViewProvider.updateContent(undefined);
        }
    } else { /* ... logique API réelle ... */
        const projectId = getProjectId();
        if (!projectId) { 
            vscode.window.showErrorMessage('Project ID not configured'); 
            detailsViewProvider.updateContent(undefined); 
            return; 
        }
        
        const vulnerabilityId = vulnerabilityDataFromList.id;
        if (!vulnerabilityId) { 
            vscode.window.showErrorMessage('Invalid vulnerability ID'); 
            detailsViewProvider.updateContent(undefined); 
            return; 
        }
        
        let scanType: ScanType | undefined = inferredType;
        if (!scanType) {
            const metaType = (vulnerabilityDataFromList as any).vulnerability?.vulnerabilityType;
            if (metaType === 'sast' || 'dataFlowItems' in vulnerabilityDataFromList) scanType = 'sast';
            else if (metaType === 'iac') scanType = 'iac';
            else if (metaType === 'sca' || 'scaDetectedPackage' in vulnerabilityDataFromList) scanType = 'sca';
        }
        
        if (!scanType) { 
            vscode.window.showErrorMessage(`Could not determine vulnerability type`); 
            detailsViewProvider.updateContent(undefined); 
            return; 
        }
        
        console.log(`[DetailsCommand] Using Real API Details for ${scanType} vulnerability: ${vulnerabilityId}`);
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Window, title: `Loading details...`}, 
                async () => {
                    const detailedResponse = await apiService.getVulnerabilityDetails(projectId, vulnerabilityId, scanType);
                    detailsViewProvider.updateContent(detailedResponse);
                }
            );
        } catch (error: any) {
            console.error(`Failed to get or show real details for ${vulnerabilityId}:`, error);
            vscode.window.showErrorMessage(`Could not load vulnerability details: ${error.message}`);
            detailsViewProvider.updateContent(undefined);
        }
    }
}

/**
 * Handles opening the file location specified by the details webview,
 * preserving focus on the current view.
 */
export async function openFileLocationCommand(filePath?: string, lineNumber?: number): Promise<void> {
    if (!filePath) {
        vscode.window.showWarningMessage("Cannot open file: File path is missing.");
        return;
    }
    const line = (lineNumber && lineNumber > 0) ? lineNumber : 1;
    const zeroBasedLine = Math.max(0, line - 1);
    const position = new vscode.Position(zeroBasedLine, 0);

    try {
        console.log(`Opening file: ${filePath} at line ${line} (0-based: ${zeroBasedLine})`);
        const uri = vscode.Uri.file(filePath);
        const document = await vscode.workspace.openTextDocument(uri);

        // --- CORRECTION ICI ---
        // 1. Montre le document avec les options de focus et de sélection
        const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside, // Ouvre à côté
            preserveFocus: true,                // Garde le focus sur la webview
            selection: new vscode.Selection(position, position) // Sélectionne la ligne cible
        });

        // 2. Révèle la plage séparément APRÈS que l'éditeur est montré
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport // Centre la vue
        );
        // --- FIN CORRECTION ---

        console.log(`File ${path.basename(filePath)} opened and revealed.`);

    } catch (error: any) {
        console.error(`Failed to open file location: ${filePath}:${line}`, error);
        const simpleFileName = path.basename(filePath);
        vscode.window.showErrorMessage(`Could not open file "${simpleFileName}": ${error.message}`);
    }
}