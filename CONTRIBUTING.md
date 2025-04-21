# Contributing to CybeDefend VS Code Extension

First off, thank you for considering contributing to the CybeDefend VS Code Extension! We appreciate your time and effort to help make this tool better for everyone.

This document provides guidelines for contributing to the project. Please read it carefully to ensure a smooth collaboration process.

## Code of Conduct

This project and everyone participating in it is governed by a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior.

## How Can I Contribute?

### Reporting Bugs

If you encounter a bug, please help us by reporting it. Good bug reports are essential for improving the extension.

Before submitting a bug report, please check the following:

1.  **Search existing issues:** Make sure the bug hasn't already been reported by searching the [GitHub Issues](https://github.com/your-username/cybedefend-vscode/issues) for this repository.
2.  **Latest version:** Ensure you are using the latest version of the extension.
3.  **Reproducible steps:** Provide clear and concise steps to reproduce the bug. Include:
    *   Your operating system and VS Code version.
    *   The version of the CybeDefend extension.
    *   What you expected to happen.
    *   What actually happened.
    *   Any relevant error messages or screenshots.

Create a new issue using the "Bug Report" template if available.

### Suggesting Enhancements

We welcome suggestions for new features or improvements to existing functionality.

1.  **Search existing issues/discussions:** Check if your idea has already been proposed or discussed.
2.  **Provide context:** Clearly explain the enhancement you're suggesting and why it would be beneficial. Describe the problem it solves or the workflow it improves.
3.  **Be specific:** If possible, provide details about how you envision the feature working.

Create a new issue using the "Feature Request" template if available, or start a discussion.

### Code Contributions

If you'd like to contribute code (bug fixes, new features), please follow these steps:

1.  **Fork the Repository:** Create your own fork of the [cybedefend-vscode](https://github.com/your-username/cybedefend-vscode) repository on GitHub.
2.  **Clone Your Fork:** Clone your forked repository to your local machine:
    ```bash
    git clone https://github.com/YOUR_USERNAME/cybedefend-vscode.git
    cd cybedefend-vscode
    ```
3.  **Install Dependencies:** Install the necessary development dependencies:
    ```bash
    npm install
    ```
4.  **Create a Branch:** Create a new branch for your changes. Use a descriptive name (e.g., `fix/login-bug`, `feat/scan-on-save`):
    ```bash
    git checkout -b your-branch-name
    ```
5.  **Make Changes:** Implement your bug fix or feature. 
    *   Follow the existing code style and patterns.
    *   Add comments to explain non-obvious parts of your code.
    *   Ensure your code compiles without errors (`npm run compile`).
    *   Run linters (`npm run lint`) and fix any reported issues.
6.  **Test Your Changes:** (Add details about running tests here if applicable, e.g., `npm test`)
7.  **Commit Your Changes:** Use clear and concise commit messages. Follow conventional commit message formats if possible (e.g., `fix: resolve issue with API key validation`).
    ```bash
    git add .
    git commit -m "feat: Add scan on save functionality"
    ```
8.  **Push to Your Fork:** Push your changes to your forked repository on GitHub:
    ```bash
    git push origin your-branch-name
    ```
9.  **Open a Pull Request (PR):**
    *   Go to the original [cybedefend-vscode](https://github.com/your-username/cybedefend-vscode) repository.
    *   Click on "New Pull Request".
    *   Choose your fork and branch.
    *   Provide a clear title and description for your PR, explaining the changes you've made and referencing any related issues (e.g., "Closes #123").
    *   Submit the PR.

We will review your PR as soon as possible. We may provide feedback or request changes. Thank you for your contribution!

## Development Setup

*   Install [Node.js](https://nodejs.org/) (which includes npm).
*   Clone the repository (or your fork).
*   Run `npm install` in the root directory.
*   Open the project in VS Code.
*   Press `F5` to start a debugging session with the extension loaded in a new VS Code window (Extension Development Host).
*   Use `npm run watch` to automatically recompile the extension on file changes during development.

## Questions?

If you have questions about contributing, feel free to open an issue or join our community discussion forum (link if available). 