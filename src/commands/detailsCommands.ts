// src/commands/detailsCommands.ts
import path from 'path';
import * as vscode from 'vscode';
import { ApiService, ScanType } from '../api/apiService';
import { DetailedVulnerability } from '../dtos/result/details';
import { DetailsWebviewViewProvider } from '../providers/detailsWebviewProvider';
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
    detailsViewProvider: DetailsWebviewViewProvider,
    projectId: string
) {
    if (!vulnerabilityDataFromList) {
        vscode.window.showErrorMessage('No vulnerability data provided');
        return;
    }


    if (USE_MOCK_DATA_DETAILS) {
        try {
            const mockDetailedResponse = createMockDetailsResponse(vulnerabilityDataFromList);
            detailsViewProvider.updateContent(mockDetailedResponse);
        } catch (mockError: any) {
            vscode.window.showErrorMessage(`Failed to show mock details: ${mockError.message}`);
            detailsViewProvider.updateContent(undefined);
        }
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
        if (metaType === 'sast' || 'dataFlowItems' in vulnerabilityDataFromList) { scanType = 'sast'; }
        else if (metaType === 'iac') { scanType = 'iac'; }
        else if (metaType === 'sca' || 'scaDetectedPackage' in vulnerabilityDataFromList) { scanType = 'sca'; }
    }

    if (!scanType) {
        vscode.window.showErrorMessage(`Could not determine vulnerability type`);
        detailsViewProvider.updateContent(undefined);
        return;
    }

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Window, title: `Loading details...` },
            async () => {
                const detailedResponse = await apiService.getVulnerabilityDetails(projectId, vulnerabilityId, scanType);
                detailsViewProvider.updateContent(detailedResponse);
            }
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Could not load vulnerability details: ${error.message}`);
        detailsViewProvider.updateContent(undefined);
    }
}

/**
 * Opens a file in the editor at a specific line number within the correct workspace.
 * Handles resolving relative paths, validates line number, and opens the editor permanently.
 * @param workspaceRoot - The absolute path to the root of the relevant workspace.
 * @param relativeFilePath - The file path relative to the workspace root (from vulnerability data).
 * @param lineNumber - The line number to navigate to (1-based).
 */
export async function openFileLocationCommand(workspaceRoot: string | undefined | null, relativeFilePath: string | undefined | null, lineNumber: number): Promise<void> {
    console.log(`[openFileLocationCommand] Received arguments: workspaceRoot='${workspaceRoot}', relativeFilePath='${relativeFilePath}', lineNumber=${lineNumber}`);

    if (!workspaceRoot) {
        console.error("[openFileLocationCommand] Cannot open file location: Workspace root is missing or invalid.");
        vscode.window.showErrorMessage("Configuration error: Workspace root not found. Cannot open file location.");
        return;
    }
    if (!relativeFilePath) {
        console.error("[openFileLocationCommand] Cannot open file location: Relative file path is missing or invalid.");
        return;
    }

    try {
        const workspaceRootUri = vscode.Uri.file(workspaceRoot);
        const fileUri = vscode.Uri.joinPath(workspaceRootUri, relativeFilePath);
        console.log(`[openFileLocationCommand] Resolved absolute file URI: ${fileUri.toString()}`);

        // Step 1: Open the document
        console.log(`[openFileLocationCommand] Opening document: ${fileUri.fsPath}`);
        const document = await vscode.workspace.openTextDocument(fileUri);
        console.log(`[openFileLocationCommand] Document opened. Showing editor...`);

        // Step 2: Show the editor by specifying to NOT be in preview mode
        const editor = await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside, // Opens beside
            preserveFocus: true,                // Keeps focus on the calling view
            preview: false
        });
        console.log(`[openFileLocationCommand] Editor shown (preview: false).`);

        // Step 3: Prepare the position and check its validity
        const lineToShow = Math.max(1, lineNumber);
        const zeroBasedLine = lineToShow - 1;

        if (zeroBasedLine >= 0 && zeroBasedLine < editor.document.lineCount) {
            console.log(`[openFileLocationCommand] Line number ${lineToShow} (0-based: ${zeroBasedLine}) is valid. Setting selection and revealing.`);
            const position = new vscode.Position(zeroBasedLine, 0);
            const range = new vscode.Range(position, position);

            // Step 4: Define the selection and reveal the range
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            console.log(`[openFileLocationCommand] Successfully revealed line ${lineToShow}.`);
        } else {
            console.warn(`[openFileLocationCommand] Line number ${lineToShow} is outside the document bounds (Total lines: ${editor.document.lineCount}). Skipping selection/reveal.`);
            vscode.window.showWarningMessage(`Could not navigate to line ${lineToShow} in "${path.basename(relativeFilePath)}" as it exceeds the file length (${editor.document.lineCount} lines).`);
        }

    } catch (error: any) {
        console.error(`[openFileLocationCommand] Failed to open file location: ${error.message}`, { workspaceRoot, relativeFilePath, error });
        const simpleFileName = relativeFilePath ? path.basename(relativeFilePath) : 'the file';
        if (error.code === 'FileNotFound' || error.message?.includes('Unable to resolve nonexistent file')) {
            vscode.window.showErrorMessage(`Could not open file: "${simpleFileName}". The file was not found at the expected location: ${relativeFilePath} within ${workspaceRoot}`);
        } else if (error.message?.includes('that is actually a directory')) {
            vscode.window.showErrorMessage(`Could not open "${simpleFileName}": The path points to a directory, not a file.`);
        } else if (error.message?.includes('Unable to read file')) {
            vscode.window.showErrorMessage(`Could not read file: "${simpleFileName}". Check file permissions.`);
        } else {
            vscode.window.showErrorMessage(`Failed to open file "${simpleFileName}". Reason: ${error.message}`);
        }
    }
}