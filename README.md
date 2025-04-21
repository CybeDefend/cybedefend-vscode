# CybeDefend VS Code Extension

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
<!-- Add other relevant badges here, e.g., build status, version -->

Seamlessly integrates [CybeDefend](https://cybedefend.com/) into Visual Studio Code, enabling real-time vulnerability scanning of your codebase. Authenticate via API key, configure your project, and visualize detected issues with severity-based filtering and detailed insights. Includes an integrated AI Security Champion chatbot for assistance.

## ✨ Features

*   **Comprehensive Scanning:** Perform SAST, SCA, and IaC vulnerability scans directly within VS Code.
*   **Unified Dashboard:** View a summary of findings across all scan types in a dedicated panel.
*   **Detailed Results:** Explore vulnerabilities categorized by type (SAST, SCA, IaC) in separate, dedicated views.
*   **Vulnerability Details:** Click on a vulnerability to see detailed information, including description, severity, file location, and remediation advice (where available).
*   **Direct Code Navigation:** Click on file paths within vulnerability details to jump directly to the affected line of code.
*   **API Key Authentication:** Securely store your CybeDefend API key globally within VS Code.
*   **Workspace Project Configuration:** Easily configure the CybeDefend Project ID for each workspace.
*   **AI Security Champion:** Interact with an integrated chatbot (powered by the CybeDefend API) to ask security-related questions about your code or vulnerabilities.
*   **Intuitive UI:** Access all features through a dedicated CybeDefend Activity Bar icon and clear commands.

## 🚀 Installation

1.  Open Visual Studio Code.
2.  Go to the Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3.  Search for "CybeDefend".
4.  Click **Install** on the "cybedefend-vscode" extension.
5.  Reload VS Code if prompted.

## ⚙️ Configuration

Before you can start scanning, you need to configure your CybeDefend API Key and the Project ID for your current workspace.

1.  **API Key (Global):**
    *   Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Run the command: `CybeDefend: Update API Key (Global)`.
    *   Enter your CybeDefend API key when prompted. This is stored securely in VS Code's global secret storage.
2.  **Project ID (Workspace):**
    *   Ensure you have a workspace open (`File > Open Folder...` or `File > Open Workspace from File...`).
    *   The extension will automatically prompt you to select your Organization and Project if it hasn't been configured for the current workspace upon activation or before the first scan.
    *   Alternatively, open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Run the command: `CybeDefend: Update Project ID (Current Workspace)`.
    *   Follow the prompts to select the Organization and Project associated with the code in your current VS Code workspace. This ID is stored in the workspace settings.

## 🎮 Usage

1.  **Open the CybeDefend View:** Click the CybeDefend icon in the Activity Bar (typically on the left or right side of VS Code). This will open the view container with the Summary, SAST, SCA, IaC, and Security Champion panels.
2.  **Start a Scan:**
    *   Navigate to the "Summary" view within the CybeDefend container.
    *   Click the "Play" icon (▶️) labeled "Start Vulnerability Scan" in the view's title bar.
    *   Alternatively, run the `CybeDefend: Start Vulnerability Scan` command from the Command Palette.
    *   The scan will run in the background. Progress and status updates will be shown in the different view panels.
3.  **View Results:**
    *   **Summary:** Provides an overview of the total vulnerabilities found, categorized by severity and type.
    *   **SAST/SCA/IaC:** Navigate to the respective panels to see a list of vulnerabilities specific to that scan type. You can often filter or sort these lists (future enhancement).
    *   **Details:** Click on any vulnerability item in the SAST, SCA, or IaC lists. This will populate a separate "Details" webview (if configured, or potentially display inline/modal) with comprehensive information about the selected finding.
    *   **Navigate to Code:** Within the vulnerability details, click on the file path and line number to automatically open the relevant file and jump to the specific line of code.
4.  **Interact with the Security Champion:**
    *   Navigate to the "Security Champion" panel.
    *   Type your security-related questions into the input box and press Enter. The AI will provide responses based on its knowledge and potentially the context of your project (depending on implementation).
5.  **Update Settings:**
    *   Use the `CybeDefend: Update API Key (Global)` and `CybeDefend: Update Project ID (Current Workspace)` commands as needed.
    *   Access general extension settings via `File > Preferences > Settings` and searching for "CybeDefend Scanner".

## 🏗️ Architecture Overview

The extension follows a modular structure within the `src/` directory:

```
src/
├── api/         # Handles communication with the CybeDefend backend API.
├── auth/        # Manages API key storage and project configuration (Org/Project ID).
├── commands/    # Implements the logic for VS Code commands (e.g., start scan, update settings).
├── constants/   # Stores shared constants like command IDs, view IDs, and configuration keys.
├── dtos/        # Data Transfer Objects: Defines the structure of data exchanged with the API.
├── providers/   # Contains VS Code WebviewViewProviders for each panel (Summary, SAST, SCA, IaC, Chatbot, Details).
├── test/        # Unit and integration tests.
├── ui/          # Potentially reusable UI components or logic for webviews (e.g., rendering tables, formatting).
├── utilities/   # General helper functions (e.g., file system operations, logging).
└── extension.ts # Main activation and deactivation point for the extension, registers commands and providers.
```

## ⌨️ Commands

The following commands are available via the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

*   `CybeDefend: Start Vulnerability Scan`: Initiates a scan for the current workspace.
*   `CybeDefend: Update API Key (Global)`: Prompts for and saves the CybeDefend API key.
*   `CybeDefend: Update Project ID (Current Workspace)`: Prompts for Organization and Project selection for the active workspace.
*   `CybeDefend: Show Scanner Views`: Brings focus to the main CybeDefend view container.
*   `CybeDefend: Show Security Champion`: Brings focus to the Security Champion chatbot view.
*   `CybeDefend: Open Scanner Settings`: Opens the VS Code settings filtered for CybeDefend. (May be integrated directly into UI)
*   `CybeDefend: Show Vulnerability Details`: (Internal command, usually triggered by clicking a vulnerability) Displays details for a specific finding.
*   `CybeDefend: Open File Location`: (Internal command, usually triggered from details view) Opens the file mentioned in a vulnerability report.

## <0xF0><0x9F><0xA7><0xAD> Future Enhancements

*   **Scan on Save/Open:** Option to automatically trigger scans when files are saved or opened.
*   **Incremental Scanning:** Only scan changed files for faster results.
*   **Advanced Filtering/Sorting:** More options to filter and sort vulnerabilities in the result views (e.g., by severity, file, CWE).
*   **Remediation Guidance:** Offer more specific code snippets or suggestions for fixing vulnerabilities.
*   **Ignoring Vulnerabilities:** Ability to mark specific findings as ignored (with reason) within a workspace.
*   **CI/CD Integration Information:** Display links or information related to CI/CD scan results for the same project.
*   **Enhanced Chatbot Context:** Provide more project-specific context to the Security Champion.
*   **Problem Matchers:** Integrate scan results directly into the VS Code "Problems" panel.

## 🤝 Contributing

Contributions are welcome! Please refer to the `CONTRIBUTING.md` file (to be created) for guidelines on how to contribute to this project, including reporting issues, proposing features, and submitting pull requests.

## 📜 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
