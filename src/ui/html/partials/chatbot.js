// src/ui/html/partials/chatbot.js

// This script runs inside the webview context.
// It receives initialData and initialFullVulnerabilities from the HTML template.

// Wrap in an IIFE to avoid polluting the global scope
(function () {
    /** @type {import("vscode").WebviewApi} */
    const vscode = acquireVsCodeApi();

    // --- DOM Element References ---
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesDiv = document.getElementById('messages');
    const vulnSelect = document.getElementById('vuln-select');
    const vulnSelectorDiv = document.getElementById('vuln-selector');
    const resetButton = document.getElementById('reset-button');
    const loadingIndicatorContainer = document.createElement('div'); // Container for loading/streaming indicators
    loadingIndicatorContainer.id = 'loading-indicator-container'; // Assign ID for potential styling/selection

    // --- Local State Variables ---
    // Initialize state from data injected via the HTML template
    /** @type {StateForWebview} Holds the main state received from the provider */
    let currentState = initialData || {
        messages: [],
        isLoading: false,
        isStreaming: false, // Added
        isVulnListLoading: false,
        error: null,
        limitReachedError: null, // Added
        assistantStreamContent: "", // Added
        vulnerabilities: [],
        selectedVulnerabilityId: null,
        conversationId: null,
        projectId: null
    };
    /** @type {Array<DetailedVulnerability>} Holds the full vulnerability objects */
    let fullVulnerabilitiesData = initialFullVulnerabilities || [];


    // --- Helper Functions ---

    /** Scrolls the messages container to the bottom. */
    function scrollToBottom() {
        if (messagesDiv) {
            // Scroll down a bit more aggressively to ensure visibility of input area or indicators
            messagesDiv.scrollTop = messagesDiv.scrollHeight + 50;
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
     * Formats raw message content for display, handling basic Markdown (code blocks, inline code, newlines).
     * Input should already be appropriately escaped for HTML where necessary *before* calling this,
     * especially if dealing with user-generated content directly, though here we expect content from the provider.
     * @param {string | undefined | null} rawContent Raw message content.
     * @returns {string} HTML formatted string.
     */
    function formatMessageContent(rawContent) {
        let formatted = rawContent || ''; // Start with raw content

        // --- Basic Markdown-like Formatting ---
        try {
            // 1. Fenced Code Blocks (```lang\ncode\n```)
            // Important: Temporarily replace escaped backticks within potential code blocks
            // to prevent the regex from breaking them. Use a placeholder.
            const backtickPlaceholder = "__TEMP_BACKTICK__";
            formatted = formatted.replace(/\\`/g, backtickPlaceholder);

            const fencedCodeBlockRegex = /```(\w*)?\n?([\s\S]*?)\n?```/g;
            formatted = formatted.replace(fencedCodeBlockRegex, (match, lang, code) => {
                // Restore placeholders inside the captured code block
                const restoredCode = code.replace(new RegExp(backtickPlaceholder, 'g'), '`');
                // Escape the *content* of the code block before putting it in the pre/code tags
                const escapedCode = escapeHtml(restoredCode.trim());
                return `<pre><code class="language-${escapeHtml(lang || '')}">${escapedCode}</code></pre>`;
            });

            // Restore any remaining placeholders outside code blocks (shouldn't be many)
            formatted = formatted.replace(new RegExp(backtickPlaceholder, 'g'), '`');

            // 2. Inline Code (`code`) - Process *after* fenced blocks
            // Use a negative lookbehind/lookahead or split/map approach to avoid matching backticks within <pre>
            const inlineCodeRegex = /`([^`]+?)`/g;
            const parts = formatted.split(/(<pre[\s\S]*?<\/pre>)/); // Split by <pre> blocks
            formatted = parts.map((part, index) => {
                if (index % 2 === 0) { // Text outside <pre>
                    // Escape the content *before* wrapping in <code>
                    return part.replace(inlineCodeRegex, (match, code) => `<code>${escapeHtml(code)}</code>`);
                }
                return part; // Return <pre> block unchanged (its content is already escaped)
            }).join('');


            // 3. Newlines (\n to <br>) - Process *last*, outside of <pre>
            const finalParts = formatted.split(/(<pre[\s\S]*?<\/pre>)/);
            formatted = finalParts.map((part, index) => {
                if (index % 2 === 0) { // Outside <pre>
                    return part.replace(/\n/g, '<br>');
                }
                // Inside <pre>, browsers handle newlines correctly, so return as is
                return part;
            }).join('');

        } catch (e) {
            console.error("Error formatting message content:", e);
            // Fallback: Simple escape and newline conversion
            formatted = escapeHtml(rawContent || '').replace(/\n/g, '<br>');
        }
        return formatted;
    }


    // --- UI Rendering Functions ---

    /**
     * Renders messages, loading indicators, streaming content, and errors based on the current state.
     * @param {StateForWebview} state - The complete state object from the provider.
     */
    function renderUI(state) {
        if (!messagesDiv) return;
        messagesDiv.innerHTML = ''; // Clear previous messages and indicators

        // --- Render Messages History ---
        if (!state.messages?.length && !state.isLoading && !state.isStreaming && !state.error && !state.limitReachedError) {
            // Initial empty state message
            messagesDiv.innerHTML = '<p class="empty-chat-message">Ask the Security Champion anything...</p>';
        } else {
            // Sort messages chronologically
            const messagesToRender = [...(state.messages || [])].sort((a, b) =>
                new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
            );

            messagesToRender.forEach(function (msg) {
                const msgEl = document.createElement('div');
                const alignClass = msg.role === 'user' ? 'message-user' : 'message-ai';
                const icon = msg.role === 'user' ? 'codicon-account' : 'codicon-hubot';
                // Format content *before* adding to innerHTML
                const formattedContent = formatMessageContent(msg.content);
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
        }

        // --- Render Streaming Assistant Message ---
        if (state.isStreaming) {
            const streamingEl = document.createElement('div');
            const formattedStreamingContent = formatMessageContent(state.assistantStreamContent);
            streamingEl.className = 'message message-ai streaming'; // Add streaming class
            // Add a blinking cursor effect using CSS (defined in chatbot.css)
            streamingEl.innerHTML = `
                 <span class="codicon codicon-hubot message-icon" title="AI"></span>
                 <div class="message-content">
                     ${formattedStreamingContent}<span class="blinking-cursor">▎</span>
                 </div>
             `;
            messagesDiv.appendChild(streamingEl);
        }

        // --- Render Loading/Error Indicators Below Messages ---
        loadingIndicatorContainer.innerHTML = ''; // Clear previous indicators in this container

        if (state.isLoading) { // Show during POST request phase
            const loadingEl = document.createElement('div');
            loadingEl.className = 'loading-indicator info-message';
            loadingEl.innerHTML = '<span class="codicon codicon-loading codicon-modifier-spin"></span> Waiting for Security Champion...';
            loadingIndicatorContainer.appendChild(loadingEl);
        }

        if (state.limitReachedError) { // Specific limit error
            const limitErrorEl = document.createElement('div');
            limitErrorEl.className = 'error-message';
            limitErrorEl.innerHTML = `<span class="codicon codicon-stop-circle"></span> ${escapeHtml(state.limitReachedError)}`;
            loadingIndicatorContainer.appendChild(limitErrorEl);
        } else if (state.error) { // General error
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.innerHTML = `<span class="codicon codicon-error"></span> ${escapeHtml(state.error)}`;
            loadingIndicatorContainer.appendChild(errorEl);
        }

        // Append the indicator container below the messages div if it has content
        if (loadingIndicatorContainer.hasChildNodes()) {
            messagesDiv.appendChild(loadingIndicatorContainer);
        }

        // --- Update Vulnerability Selector ---
        renderVulnSelect(
            state.vulnerabilities,
            state.selectedVulnerabilityId,
            state.isVulnListLoading,
            state.error, // Pass error state for potential context
            state.projectId
        );

        // --- Update Input & Button States ---
        updateInputState(state);

        // --- Scroll to Bottom ---
        // Use setTimeout to ensure scrolling happens after DOM updates, especially for streaming
        setTimeout(scrollToBottom, 50);
    }


    /**
     * Updates the vulnerability dropdown options and visibility.
     * @param {Array<VulnerabilityInfoForWebview>} vulnerabilities - Simplified/escaped list from state.
     * @param {string | null} selectedVulnId - ID of the currently selected vulnerability.
     * @param {boolean} isVulnListLoading - Whether the list is currently loading.
     * @param {string | null} _error - General error state (currently unused in this function but passed).
     * @param {string | null} projectId - Project ID.
     */
    function renderVulnSelect(vulnerabilities, selectedVulnId, isVulnListLoading, _error, projectId) {
        if (!vulnSelect || !vulnSelectorDiv) return;

        const hasProject = !!projectId;
        const hasVulns = vulnerabilities && vulnerabilities.length > 0;
        const shouldShowSelector = hasProject && hasVulns; // Show if project and vulns loaded

        vulnSelectorDiv.classList.toggle('hidden', !shouldShowSelector);
        vulnSelectorDiv.classList.toggle('loading', isVulnListLoading); // Add loading class

        if (isVulnListLoading) {
            vulnSelect.innerHTML = '<option value="">Loading vulnerabilities...</option>';
            vulnSelect.disabled = true;
            return;
        }

        vulnSelect.disabled = false; // Re-enable after loading

        if (!shouldShowSelector) {
            vulnSelect.innerHTML = '<option value="">Select vulnerability (Optional)...</option>';
            return;
        }

        // --- Populate Dropdown ---
        vulnSelect.innerHTML = ''; // Clear previous options
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        defaultOption.textContent = "Select vulnerability (Optional)...";
        vulnSelect.appendChild(defaultOption);

        const groups = { sast: [], iac: [] };
        (vulnerabilities || []).forEach(v => {
            if (v.type === 'sast') groups.sast.push(v);
            else if (v.type === 'iac') groups.iac.push(v);
        });

        const createOptionElement = function (vuln) {
            const option = document.createElement('option');
            option.value = vuln.id;
            // Data received in 'vulnerabilities' is already escaped by the provider/html generator
            option.textContent = `${vuln.name} (${vuln.shortPath})`; // Use escaped data
            option.title = `${vuln.name} in ${vuln.fullPath || '(path unknown)'}`; // Use escaped data
            return option;
        };

        if (groups.sast.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Code Vulnerabilities (SAST)";
            groups.sast.sort((a, b) => a.name.localeCompare(b.name)).forEach(v => optgroup.appendChild(createOptionElement(v)));
            vulnSelect.appendChild(optgroup);
        }
        if (groups.iac.length > 0) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = "Infrastructure Vulnerabilities (IaC)";
            groups.iac.sort((a, b) => a.name.localeCompare(b.name)).forEach(v => optgroup.appendChild(createOptionElement(v)));
            vulnSelect.appendChild(optgroup);
        }

        vulnSelect.value = selectedVulnId || ""; // Restore selection
    }

    /**
     * Updates the enabled/disabled state of input elements based on the application state.
     * @param {StateForWebview} state - The current application state.
     */
    function updateInputState(state) {
        const isDisabled = !!state.isLoading || !!state.isStreaming || !!state.limitReachedError;
        const isInputEmpty = !messageInput || messageInput.value.trim().length === 0;

        if (sendButton) {
            sendButton.disabled = isDisabled || isInputEmpty;
        }
        if (messageInput) {
            messageInput.disabled = isDisabled;
            messageInput.placeholder = isDisabled ? "Waiting for response..." : "Ask the Security Champion...";
        }
        if (resetButton) {
            // Also disable reset while loading/streaming to prevent interrupting operations
            resetButton.disabled = !!state.isLoading || !!state.isStreaming;
        }
        if (vulnSelect) {
            // Disable vuln select while loading/streaming or if limit reached
            vulnSelect.disabled = isDisabled || state.isVulnListLoading;
        }
    }


    // --- Event Handlers ---

    /** Handles sending the message text to the extension provider. */
    function handleSendMessage() {
        if (!messageInput || !sendButton) return;
        const text = messageInput.value.trim();
        // Check all disabling conditions
        if (!text || text.length > 1000 || currentState.isLoading || currentState.isStreaming || currentState.limitReachedError) {
            console.warn("[Chatbot Webview] Send message blocked by current state.");
            return;
        }

        vscode.postMessage({ command: 'sendMessage', text: text });

        // Clear input and disable button immediately (state update will confirm)
        messageInput.value = '';
        updateInputState({ ...currentState, isLoading: true }); // Simulate immediate loading state

        // Deselect vulnerability after sending message with it
        if (currentState.selectedVulnerabilityId && vulnSelect) {
            vulnSelect.value = "";
            // Notify provider immediately about deselection (though handleSendMessage implies context was used)
            vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: null });
        }
    }

    /** Handles resetting the conversation */
    function handleResetConversation() {
        // Prevent reset if loading or streaming
        if (currentState.isLoading || currentState.isStreaming) {
            console.warn("[Chatbot Webview] Reset blocked by current state.");
            return;
        }

        vscode.postMessage({ command: 'resetConversation' });

        // Clear UI elements immediately (state update will confirm)
        if (messageInput) messageInput.value = '';
        if (vulnSelect) vulnSelect.value = '';
        updateInputState({ ...currentState, isLoading: false, isStreaming: false, messages: [], error: null, limitReachedError: null }); // Simulate reset state
    }


    // --- Event Listeners Setup ---

    // Send Button and Message Input
    if (sendButton && messageInput) {
        sendButton.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); // Prevent newline
                handleSendMessage();
            }
        });
        // Update button state on input change
        messageInput.addEventListener('input', function () {
            updateInputState(currentState);
        });
    } else {
        console.error("Chatbot input/button elements not found!");
    }

    // Reset Button
    if (resetButton) {
        resetButton.addEventListener('click', handleResetConversation);
    } else {
        console.error("Reset button element not found!");
    }

    // Vulnerability Select Dropdown
    if (vulnSelect) {
        vulnSelect.addEventListener('change', function (e) {
            const selectedId = e.target.value;
            // Find the FULL object from the locally stored full data
            // Ensure fullVulnerabilitiesData is populated before searching
            const selectedVulnFull = selectedId && fullVulnerabilitiesData
                ? fullVulnerabilitiesData.find(v => v?.id === selectedId)
                : null;
            // Notify provider, sending the full object (or null)
            vscode.postMessage({ command: 'setSelectedVulnerability', vulnerability: selectedVulnFull });
        });
    } else {
        console.error("Chatbot vulnerability select element not found!");
    }

    // Listener for messages FROM the extension provider
    window.addEventListener('message', function (event) {
        const message = event.data; // { command: 'updateState', state: { ... } }
        if (message.command === 'updateState') {
            // Update the entire local state
            currentState = message.state;

            // Update the local store of full vulnerability data if present in the update
            if (currentState.vulnerabilitiesFull) {
                fullVulnerabilitiesData = currentState.vulnerabilitiesFull;
            }

            // Re-render the entire UI based on the new state
            renderUI(currentState);

        }
    });

    // --- Initial UI Render ---
    renderUI(currentState); // Initial render based on injected state

    // --- Request Initial Data Load if Necessary ---
    // Check if we have a project ID but no vulnerabilities loaded yet
    const needsInitialVulnLoad = !!currentState.projectId
        && (!currentState.vulnerabilities || currentState.vulnerabilities.length === 0)
        && !currentState.isVulnListLoading; // Don't request if already loading
    if (needsInitialVulnLoad) {
        vscode.postMessage({ command: 'loadInitialData' });
    }

})(); // End of IIFE