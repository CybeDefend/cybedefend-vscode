// src/ui/html/partials/chatbot.js

// This script runs inside the webview context.
// It receives initialData and initialFullVulnerabilities from the HTML template.

// Wrap in an IIFE to avoid polluting the global scope
(function() {
    /** @type {import("vscode").WebviewApi} */
    const vscode = acquireVsCodeApi();

    // --- DOM Element References ---
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesDiv = document.getElementById('messages');
    const vulnSelect = document.getElementById('vuln-select');
    const vulnSelectorDiv = document.getElementById('vuln-selector');

    // --- Local State Variables ---
    // Initialize state from data injected via the HTML template
    /** @type {object} Holds the main state (messages, loading status, simplified vulns, etc.) */
    let currentState = initialData || { messages: [], isLoading: false, isVulnListLoading: false, error: "Failed to load initial state.", vulnerabilities: [], selectedVulnerabilityId: null, conversationId: null, projectId: null };
    /** @type {Array<object>} Holds the full vulnerability objects */
    let fullVulnerabilitiesData = initialFullVulnerabilities || [];

    console.log('[ChatbotView] Script loaded. Initial state:', currentState);
    console.log('[ChatbotView] Script loaded. Initial full vulnerabilities count:', fullVulnerabilitiesData.length);


    // --- Helper Functions ---

    /** Scrolls the messages container to the bottom. */
    function scrollToBottom() {
        if (messagesDiv) {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    }

    /**
     * Escapes HTML special characters in a string (client-side version).
     * @param {string | undefined | null} unsafe The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Formats raw message content for display, handling basic Markdown.
     * Assumes input is safe (already escaped if necessary).
     * @param {string | undefined | null} rawContent Raw message content.
     * @returns {string} HTML formatted string.
     */
    function formatMessageContent(rawContent) {
        // Start with safe, escaped content
        let formatted = escapeHtml(rawContent || '');
        try {
            // --- Format Fenced Code Blocks (```lang\ncode\n```) ---
            // Use RegExp constructor to avoid backtick conflicts in template literals (though not strictly needed here in a .js file, it's safer)
            // Match ``` optionally followed by a language, newline, code, newline, and ```
            const fencedCodeBlockRegex = new RegExp('(\\`{3})(\\w*)\\n?([\\s\\S]*?)\\n?(\\1)', 'g');
            formatted = formatted.replace(fencedCodeBlockRegex, (match, ticks, lang, code) => {
                const trimmedCode = code.trim();
                // Code inside <pre><code> should ideally be unescaped if it was HTML escaped before,
                // but for simplicity here, we keep it escaped as highlight.js or others might handle it.
                // If using a highlighter, ensure it gets the raw code *before* escaping.
                return `<pre><code class="language-${escapeHtml(lang || '')}">${trimmedCode}</code></pre>`;
            });

            // --- Format Inline Code (`code`) ---
            // Process text outside of <pre> tags to avoid altering code blocks.
            const inlineCodeRegex = new RegExp('\\`([^\\`]+)\\`', 'g');
            const parts = formatted.split(/(<pre[\s\S]*?<\/pre>)/); // Split by <pre> blocks
            formatted = parts.map((part, index) => {
                if (index % 2 === 0) { // Text outside <pre>
                    return part.replace(inlineCodeRegex, (match, code) => {
                       // 'code' content is already escaped from the initial escapeHtml call
                       return `<code>${code}</code>`;
                    });
                }
                return part; // Return <pre> block unchanged
            }).join('');


            // --- Format Newlines (\n to <br>) ---
            // Also process outside of <pre> tags.
            const finalParts = formatted.split(/(<pre[\s\S]*?<\/pre>)/);
            formatted = finalParts.map((part, index) => {
                if (index % 2 === 0) { // Outside <pre>
                    return part.replace(/\n/g, '<br>');
                }
                return part; // Inside <pre>, keep original newlines
            }).join('');

        } catch (e) {
            console.error("Error formatting message content:", e);
            // Fallback: Simple newline to <br> conversion on the escaped content
            formatted = escapeHtml(rawContent || '').replace(/\n/g, '<br>');
        }
        return formatted;
    }


    // --- UI Rendering Functions ---

    /**
     * Renders the list of messages in the chat UI.
     * @param {Array<object>} messages - Array of messages from the state.
     * @param {boolean} isLoading - Whether a response is currently loading.
     * @param {string | null} error - Any error message to display.
     */
    function renderMessages(messages, isLoading, error) {
        if (!messagesDiv) return;
        messagesDiv.innerHTML = ''; // Clear previous content

        if (!messages?.length && !isLoading && !error) {
            messagesDiv.innerHTML = '<p style="text-align:center; color: var(--secondary-text-color);">Ask the Security Champion any security-related question...</p>';
            return;
        }

        (messages || []).forEach(function(msg) {
            const msgEl = document.createElement('div');
            const alignClass = msg.role === 'user' ? 'message-user' : 'message-ai';
            const icon = msg.role === 'user' ? 'codicon-account' : 'codicon-hubot';
            const formattedContent = formatMessageContent(msg.content); // Format content here
            const timestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
            const fullTimestamp = msg.createdAt ? new Date(msg.createdAt).toLocaleString() : '';
            msgEl.className = `message ${alignClass}`;
            msgEl.innerHTML = `
                <span class="codicon ${icon} message-icon" title="${msg.role === 'user' ? 'You' : 'AI'}"></span>
                <div class="message-content">
                    ${formattedContent}
                    <div class="message-timestamp" title="${fullTimestamp}">${timestamp}</div>
                </div>
            `;
            messagesDiv.appendChild(msgEl);
        });

        if (isLoading) {
            const loadingEl = document.createElement('div');
            loadingEl.className = 'loading-indicator';
            loadingEl.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Answering...';
            messagesDiv.appendChild(loadingEl);
        }

        if (error) {
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.innerHTML = `<span class="codicon codicon-error"></span> ${escapeHtml(error)}`; // Ensure error is escaped
            messagesDiv.appendChild(errorEl);
        }
        scrollToBottom();
    }

    /**
     * Updates the vulnerability dropdown options and visibility.
     * @param {Array<object>} vulnerabilities - Simplified/escaped list from state.
     * @param {string | null} selectedVulnId - ID of the currently selected vulnerability.
     * @param {boolean} isVulnListLoading - Whether the list is currently loading.
     * @param {string | null} error - Any general error.
     * @param {string | null} projectId - Project ID.
     */
    function renderVulnSelect(vulnerabilities, selectedVulnId, isVulnListLoading, error, projectId) {
        if (!vulnSelect || !vulnSelectorDiv) return;

        const hasProject = !!projectId;
        const hasVulns = vulnerabilities && vulnerabilities.length > 0;
        const shouldShowSelector = hasProject && !isVulnListLoading && hasVulns;

        vulnSelectorDiv.classList.toggle('hidden', !shouldShowSelector);

        if (!shouldShowSelector) {
            vulnSelect.innerHTML = '<option value="">Select vulnerability (Optional)...</option>';
            return;
        }

        vulnSelect.innerHTML = ''; // Clear previous options
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Select vulnerability (Optional)...";
        vulnSelect.appendChild(defaultOption);

        const groups = { sast: [], iac: [] };
        (vulnerabilities || []).forEach(function(v) {
            if (v.type === 'sast') groups.sast.push(v);
            else if (v.type === 'iac') groups.iac.push(v);
        });

        const createOptionElement = function(vuln) {
            const option = document.createElement('option');
            option.value = vuln.id;
            // Data (name, shortPath, fullPath) received in 'vulnerabilities' is already escaped by the provider/html generator
            option.textContent = `${vuln.name} (${vuln.shortPath})`.trim();
            option.title = `${vuln.name} in ${vuln.fullPath || '(path unknown)'}`;
            return option;
        };

        if (groups.sast.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Code Vulnerabilities (SAST)";
            groups.sast.forEach(v => optgroup.appendChild(createOptionElement(v)));
            vulnSelect.appendChild(optgroup);
        }
        if (groups.iac.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Infrastructure Vulnerabilities (IaC)";
            groups.iac.forEach(v => optgroup.appendChild(createOptionElement(v)));
            vulnSelect.appendChild(optgroup);
        }

        vulnSelect.value = selectedVulnId || ""; // Restore selection
    }


    // --- Event Handlers ---

    /** Handles sending the message text to the extension provider. */
    function handleSendMessage() {
        if (!messageInput || !sendButton) return;
        const text = messageInput.value.trim();
        if (!text || text.length > 512 || currentState.isLoading) return;

        console.log(`[Chatbot Webview] Sending message: "${text}"`);
        vscode.postMessage({ command: 'sendMessage', text: text });

        messageInput.value = '';
        sendButton.disabled = true;
        if (vulnSelect) vulnSelect.value = "";
        vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: null });
    }


    // --- Event Listeners Setup ---

    // Send Button and Message Input
    if (sendButton && messageInput) {
        sendButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        messageInput.addEventListener('input', function() {
            sendButton.disabled = messageInput.value.trim().length === 0 || !!currentState.isLoading;
        });
    } else {
        console.error("Chatbot input/button elements not found!");
    }

    // Vulnerability Select Dropdown
    if (vulnSelect) {
        vulnSelect.addEventListener('change', function(e) {
            const selectedId = e.target.value;
            // Find the FULL object from the locally stored full data
            const selectedVulnFull = selectedId
                ? fullVulnerabilitiesData.find(v => v?.id === selectedId)
                : null;
            console.log(`[Chatbot Webview] Vulnerability selection changed: ID=${selectedId}`);
            // Notify provider, sending the full object (or null)
            vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: selectedVulnFull });
        });
    } else {
        console.error("Chatbot vulnerability select element not found!");
    }

    // Listener for messages FROM the extension provider
    window.addEventListener('message', function(event) {
        const message = event.data; // { command: 'updateState', state: { ... } }
        if (message.command === 'updateState') {
            console.log("[Chatbot Webview] Received state update:", message.state);
            // Update the entire local state
            currentState = message.state;

            // Specifically update the local store of full vulnerability data
            if (currentState.vulnerabilitiesFull) {
                fullVulnerabilitiesData = currentState.vulnerabilitiesFull;
                 console.log("[Chatbot Webview] Updated fullVulnerabilitiesData count:", fullVulnerabilitiesData.length);
            } else {
                console.warn("[Chatbot Webview] 'vulnerabilitiesFull' array missing in state update.");
            }

            // Re-render UI
            renderMessages(currentState.messages, currentState.isLoading, currentState.error);
            renderVulnSelect(
                currentState.vulnerabilities, // Use simplified list from state
                currentState.selectedVulnerabilityId,
                currentState.isVulnListLoading,
                currentState.error,
                currentState.projectId
            );

            // Update send button state
            if (sendButton && messageInput) {
                sendButton.disabled = !!currentState.isLoading || messageInput.value.trim().length === 0;
            }
            // Ensure scroll after potential message updates
            scrollToBottom();
        }
    });

    // --- Initial UI Render ---
    console.log("[Chatbot Webview] Performing initial UI render.");
    renderMessages(currentState.messages, currentState.isLoading, currentState.error);
    renderVulnSelect(
        currentState.vulnerabilities,
        currentState.selectedVulnerabilityId,
        currentState.isVulnListLoading,
        currentState.error,
        currentState.projectId
    );
    if (sendButton && messageInput) {
        sendButton.disabled = !!currentState.isLoading || messageInput.value.trim().length === 0;
    }
    scrollToBottom();

    // --- Request Initial Data Load if Necessary ---
    const needsInitialLoad = !!currentState.projectId
                              && (!currentState.vulnerabilities || currentState.vulnerabilities.length === 0)
                              && !currentState.isVulnListLoading;
    if (needsInitialLoad) {
        console.log("[Chatbot Webview] Requesting initial vulnerability load from provider...");
        vscode.postMessage({ command: 'loadInitialData' });
    }

})(); // End of IIFE