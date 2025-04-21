# CybeDefend: Secure Your Code Directly in VS Code

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/CybeDefend/cybedefend-vscode/blob/main/LICENSE.md) 
[![Version](https://img.shields.io/visual-studio-marketplace/v/CybeDefend.cybedefend-vscode?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=CybeDefend.cybedefend-vscode)
<!-- Add build status badge later -->

**Scan early, fix as you develop: integrate CybeDefend's powerful security scanning into your VS Code workflow.**

Identify and address vulnerabilities in your code, dependencies, and infrastructure configurations without leaving your IDE. The CybeDefend extension provides actionable insights directly within VS Code, helping you build more secure applications efficiently.

## ✨ Key Features

*   **Comprehensive Security Analysis:**
    *   **Code Security (SAST):** Find vulnerabilities in your custom code.
    *   **Dependencies Security (SCA):** Detect known vulnerabilities in your open-source libraries.
    *   **Infrastructure Security (IaC):** Uncover misconfigurations in your infrastructure-as-code files.
*   **In-IDE Results:** View scan summaries and detailed vulnerability information directly within dedicated VS Code panels.
*   **Direct Code Navigation:** Quickly jump from a vulnerability report to the exact line of code that needs attention.
*   **AI Security Champion:** Get assistance and ask security-related questions using the integrated chatbot powered by CybeDefend.
*   **Simple Configuration:** Easily connect to your CybeDefend account using an API key and automatically configure projects per workspace.

## 🚀 Getting Started

1.  **Install:** Search for "CybeDefend" in the VS Code Extensions view (`Ctrl+Shift+X` or `Cmd+Shift+X`) and click **Install**.
2.  **Authenticate:** Run the `CybeDefend: Update API Key (Global)` command from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and enter your CybeDefend API key.
3.  **Configure Project:** Open your project folder. The extension will guide you to select the corresponding CybeDefend Organization and Project for your workspace upon activation or before the first scan. You can also use the `CybeDefend: Update Project ID (Current Workspace)` command.
4.  **Scan:** Open the CybeDefend view from the Activity Bar, navigate to the "Summary" panel, and click the "Start Vulnerability Scan" (▶️) icon.

## ❓ Support

Need help or have questions? Please contact us at: **contact@cybedefend.com**

For bug reports or feature requests, please visit our [GitHub Issues page](https://github.com/CybeDefend/cybedefend-vscode/issues).

---

*This extension requires a CybeDefend account.* Find out more at [cybedefend.com](https://cybedefend.com/).
