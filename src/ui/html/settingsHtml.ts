// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/ui/html/settingsHtml.ts
import * as vscode from 'vscode';
import { getNonce } from '../../utilities/utils'; // Ensure the path is correct

/**
 * Generates the HTML content for the settings webview.
 *
 * @param {vscode.Webview} webview The webview instance.
 * @param {vscode.Uri} extensionUri The URI of the extension directory.
 * @param {boolean} isApiKeySet Indicates if a global API key is currently stored.
 * @param {string | undefined} currentProjectId The currently stored Project ID for the workspace, if any.
 * @param {string | undefined} workspaceName The name of the current workspace, if any.
 * @returns {string} The HTML string for the webview.
 */
export function getSettingsWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    isApiKeySet: boolean, // Pass the current state of the key
    currentProjectId: string | undefined, // Pass the current project ID
    workspaceName: string | undefined // Pass the workspace name
): string {
    const nonce = getNonce();

    // Dynamic message for the API key
    const apiKeyStatusMessage = isApiKeySet
        ? "A global API key is configured. You can update it if necessary."
        : "No global API key is configured. Please set one.";

    // Dynamic message for the Project ID
    const projectIdStatusMessage = currentProjectId
        ? `The Project ID for the current workspace (${workspaceName || 'unknown'}) is: <strong>${currentProjectId}</strong>.`
        : `No Project ID is configured for this workspace (${workspaceName || 'unknown'}).`;

    // URIs for resources (if using the toolkit or icons)
    // const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode/webview-ui-toolkit', 'dist', 'toolkit.js'));
    // For this example, we keep it simple without the toolkit.

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        img-src ${webview.cspSource} https: data:;
        script-src 'nonce-${nonce}';
    ">
    <title>CybeDefend Scanner Settings</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-weight: var(--vscode-font-weight);
            font-size: var(--vscode-font-size);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 25px; /* Space between sections */
        }
        h1 {
            color: rgb(120, 69, 255); /* Changed from theme variable */
            font-size: 1.5em;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-editorWidget-border, #ccc);
        }
        .settings-section {
            padding: 15px;
            background-color: var(--vscode-sideBar-background); /* Slightly different background */
            border: 1px solid var(--vscode-sideBar-border, #ddd);
            border-radius: 4px;
        }
        .settings-section h2 {
            font-size: 1.1em;
            margin-top: 0;
            margin-bottom: 10px;
            color: rgb(120, 69, 255);
        }
        p {
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
            margin-bottom: 15px;
            line-height: 1.4;
        }
        strong {
            color: var(--vscode-editor-foreground); /* Make bold text more visible */
        }
        button {
            background-color: rgb(120, 69, 255);
            color: white;
            border: 1px solid rgb(120, 69, 255);
            padding: 8px 18px;
            cursor: pointer;
            border-radius: 3px;
            font-size: var(--vscode-font-size);
            transition: background-color 0.2s ease;
            margin-top: 10px;
        }
        button:focus {
            outline: 1px solid rgb(120, 69, 255);
            outline-offset: 2px;
        }
        button:active {
            background-color: rgb(120, 69, 255); /* Click feedback */
        }
    </style>
</head>
<body>
    <h1>CybeDefend Scanner Settings</h1>

    <div class="settings-section">
        <h2>API Key (Global)</h2>
        <p>${apiKeyStatusMessage}</p>
        <button id="update-key-button">Update API Key</button>
    </div>

    <div class="settings-section">
        <h2>Project ID (Current Workspace)</h2>
        <p>${projectIdStatusMessage}</p>
        <p>The Project ID is specific to each workspace and is required to launch scans.</p>
        <button id="update-project-id-button" ${!workspaceName ? 'disabled title="Please open a folder to set a Project ID"' : ''}>
            ${currentProjectId ? 'Update' : 'Set'} Project ID for "${workspaceName || 'no folder open'}"
        </button>
    </div>

    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();

            // Button for the API key
            const updateKeyButton = document.getElementById('update-key-button');
            if (updateKeyButton) {
                updateKeyButton.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'triggerUpdateApiKey'
                    });
                });
            }

            // Button for the Project ID
            const updateProjectIdButton = document.getElementById('update-project-id-button');
            if (updateProjectIdButton && !updateProjectIdButton.disabled) { // Only add the listener if the button is not disabled
                 updateProjectIdButton.addEventListener('click', () => {
                     vscode.postMessage({
                         command: 'triggerUpdateProjectId' // New message command
                     });
                 });
            }
        }());
    </script>
</body>
</html>`;
}