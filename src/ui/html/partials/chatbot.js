// /Users/julienzammit/Documents/GitHub/extensions/cybedefend-vscode/src/ui/html/partials/chatbot.js

// This script runs inside the webview context.
// It receives initialData and initialFullVulnerabilities from the HTML template.

// Wrap in an IIFE (Immediately Invoked Function Expression) to avoid polluting the global scope
(function () {
    /**
     * VS Code API for interacting with the extension host.
     * @type {import("vscode").WebviewApi}
     */
    const vscode = acquireVsCodeApi();

    // --- DOM Element References ---
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesDiv = document.getElementById('messages');
    const vulnSelect = document.getElementById('vuln-select');
    const vulnSelectorDiv = document.getElementById('vuln-selector');
    const resetButton = document.getElementById('reset-button');
    const contextDisplayDiv = document.getElementById('context-display'); // Reference for the context display area
    const contextVulnNameSpan = document.getElementById('context-vuln-name'); // Reference for the context vuln name span
    const loadingIndicatorContainer = document.createElement('div'); // Container for loading/streaming indicators
    loadingIndicatorContainer.id = 'loading-indicator-container';

    // --- Local State Variables ---
    /**
     * Holds the current state of the webview, received from the provider.
     * @typedef {object} StateForWebview
     * @property {Array<object>} messages - Array of message objects { role: string, content: string, createdAt: Date }
     * @property {boolean} isLoading - True if waiting for a POST response.
     * @property {boolean} isStreaming - True if receiving an SSE stream.
     * @property {boolean} isVulnListLoading - True if the vulnerability list is loading.
     * @property {string | null} error - General error message.
     * @property {string | null} limitReachedError - Specific error for message limits.
     * @property {string} assistantStreamContent - Content being streamed from the assistant.
     * @property {Array<object>} vulnerabilities - Simplified vulnerability list for the dropdown { id, name, type, fullPath, shortPath }.
     * @property {Array<object>} vulnerabilitiesFull - Full detailed vulnerability data.
     * @property {string | null} selectedVulnerabilityId - ID of the currently selected vulnerability context.
     * @property {string | null} conversationId - Current conversation ID.
     * @property {string | null} projectId - Current project ID.
     */
    /** @type {StateForWebview} */
    let currentState = initialData || {
        messages: [], isLoading: false, isStreaming: false, isVulnListLoading: false,
        error: null, limitReachedError: null, assistantStreamContent: "",
        vulnerabilities: [], vulnerabilitiesFull: [], selectedVulnerabilityId: null,
        conversationId: null, projectId: null
    };

    /**
     * Holds the full vulnerability data received from the provider.
     * @type {Array<object>} - Array of DetailedVulnerability objects.
     */
    let fullVulnerabilitiesData = initialFullVulnerabilities || [];


    // --- Helper Functions ---

    /** Scrolls the messages container to the bottom. */
    function scrollToBottom() {
        if (messagesDiv) {
            // Scroll down a bit more aggressively to ensure visibility of the input area or indicators below messages
            messagesDiv.scrollTop = messagesDiv.scrollHeight + 50;
        }
    }

    /**
     * Escapes HTML special characters in a string for safe rendering.
     * @param {string | undefined | null} unsafe The string to escape.
     * @returns {string} The escaped string.
     */
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') { return ''; }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Formats raw message content using Marked.js for Markdown rendering
     * and DOMPurify for sanitization. Falls back to basic escaping on error or if libraries aren't loaded.
     * @param {string | undefined | null} rawContent Raw message content.
     * @returns {string} Sanitized HTML formatted string.
     */
    function formatMessageContent(rawContent) {
        if (typeof rawContent !== 'string' || !rawContent) { return ''; }
        try {
            // Check if Marked and DOMPurify libraries are loaded and available
            if (typeof marked === 'undefined') {
                console.warn("Marked library not loaded. Falling back to basic HTML formatting.");
                return escapeHtml(rawContent).replace(/\n/g, '<br>');
            }
            if (typeof DOMPurify === 'undefined') {
                console.warn("DOMPurify library not loaded. Falling back to basic HTML formatting.");
                return escapeHtml(rawContent).replace(/\n/g, '<br>');
            }

            // Configure Marked for GitHub Flavored Markdown
            // This ensures code blocks, tables, checklists, etc. are properly rendered
            marked.setOptions({
                gfm: true,          // GitHub Flavored Markdown
                breaks: true,       // Convert \n to <br>
                headerIds: true,    // Add IDs to headers
                mangle: false,      // Don't mangle header IDs
                pedantic: false,    // Don't be pedantic
                smartLists: true,   // Use smart lists
                smartypants: true   // Use smart typography
            });

            // 1. Parse Markdown to HTML using Marked.js
            const dirtyHtml = marked.parse(rawContent);

            // 2. Sanitize the generated HTML using DOMPurify
            // Allow common HTML tags and attributes needed for formatting
            const cleanHtml = DOMPurify.sanitize(dirtyHtml, {
                USE_PROFILES: { html: true },
                ALLOWED_TAGS: [
                    'p', 'br', 'b', 'i', 'strong', 'em', 'mark', 'small', 'del', 'ins', 'sub', 'sup',
                    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'a', 'blockquote', 'code', 'pre', 'hr',
                    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'div', 'span', 'img'
                ],
                ALLOWED_ATTR: [
                    'href', 'target', 'rel', 'id', 'class', 'style', 'src', 'alt', 'title'
                ]
            });

            return cleanHtml;

        } catch (e) {
            console.error("Error processing Markdown content:", e);
            // Fallback on error: Simple escape and newline conversion
            return escapeHtml(rawContent).replace(/\n/g, '<br>');
        }
    }


    // --- UI Rendering Functions ---

    /**
     * Renders the entire chat UI based on the current state, including messages,
     * indicators, vulnerability selector, and context display.
     * @param {StateForWebview} state - The complete state object from the provider.
     */
    function renderUI(state) {
        if (!messagesDiv) {
            console.error("Messages container div not found!");
            return;
        }
        // Clear previous messages and indicators
        messagesDiv.innerHTML = '';

        // Render Messages History
        if (!state.messages?.length && !state.isLoading && !state.isStreaming && !state.error && !state.limitReachedError) {
            messagesDiv.innerHTML = '<p class="empty-chat-message">Ask the Security Champion anything...</p>';
        } else {
            const messagesToRender = [...(state.messages || [])].sort((a, b) =>
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );

            messagesToRender.forEach(function (msg) {
                const msgEl = document.createElement('div');
                const alignClass = msg.role === 'user' ? 'message-user' : 'message-ai';
                const icon = msg.role === 'user' ? 'codicon-account' : 'codicon-hubot';
                const formattedContent = formatMessageContent(msg.content); // Use Markdown formatter
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

        // Render AI response message if loading or streaming
        if (state.isLoading || state.isStreaming) {
            const aiResponseEl = document.createElement('div');
            const formattedStreamingContent = state.isStreaming ? formatMessageContent(state.assistantStreamContent) : '';
            aiResponseEl.className = 'message message-ai streaming';
            aiResponseEl.innerHTML = `
                 <span class="codicon codicon-hubot message-icon" title="AI"></span>
                 <div class="message-content">
                     ${formattedStreamingContent}<span class="blinking-cursor"></span>
                 </div>
             `;
            messagesDiv.appendChild(aiResponseEl);
        }

        // Render Loading/Error Indicators (below messages)
        loadingIndicatorContainer.innerHTML = ''; // Clear previous
        if (state.isLoading) {
            const loadingEl = document.createElement('div');
            loadingEl.className = 'loading-indicator info-message';
            loadingIndicatorContainer.appendChild(loadingEl);
        }
        if (state.limitReachedError) {
            const limitErrorEl = document.createElement('div');
            limitErrorEl.className = 'error-message';
            limitErrorEl.innerHTML = `<span class="codicon codicon-stop-circle"></span> ${escapeHtml(state.limitReachedError)}`;
            loadingIndicatorContainer.appendChild(limitErrorEl);
        } else if (state.error) {
            const errorEl = document.createElement('div');
            errorEl.className = 'error-message';
            errorEl.innerHTML = `<span class="codicon codicon-error"></span> ${escapeHtml(state.error)}`;
            loadingIndicatorContainer.appendChild(errorEl);
        }
        if (loadingIndicatorContainer.hasChildNodes()) {
            messagesDiv.appendChild(loadingIndicatorContainer);
        }

        // Update Vulnerability Selector Dropdown
        renderVulnSelect(state.vulnerabilities, state.selectedVulnerabilityId, state.isVulnListLoading, state.projectId);

        // Update Vulnerability Context Display Area
        renderContextDisplay(state.selectedVulnerabilityId);

        // Update Input Area State (disabled/enabled)
        updateInputState(state);

        // Scroll to Bottom (after a short delay to allow DOM updates)
        setTimeout(scrollToBottom, 50);
    }

    /**
     * Updates the vulnerability dropdown (<select>) content and state.
     * @param {Array<VulnerabilityInfoForWebview>} vulnerabilities - Simplified/escaped list.
     * @param {string | null} selectedVulnId - Currently selected ID.
     * @param {boolean} isVulnListLoading - Is the list loading?
     * @param {string | null} projectId - Current project ID.
     */
    function renderVulnSelect(vulnerabilities, selectedVulnId, isVulnListLoading, projectId) {
        if (!vulnSelect || !vulnSelectorDiv) { return; }

        const hasProject = !!projectId;
        const hasVulns = vulnerabilities && vulnerabilities.length > 0;
        const shouldShowSelector = hasProject && hasVulns; // Only show if project set and vulns loaded

        vulnSelectorDiv.classList.toggle('hidden', !shouldShowSelector);
        vulnSelectorDiv.classList.toggle('loading', isVulnListLoading);

        if (isVulnListLoading) {
            vulnSelect.innerHTML = '<option value="">Loading vulnerabilities...</option>';
            vulnSelect.disabled = true;
            return;
        }

        vulnSelect.disabled = false;

        if (!shouldShowSelector) {
            // Use a more generic default if no vulns available yet or no project
            vulnSelect.innerHTML = '<option value="">Select vulnerability (Optional)...</option>';
            return;
        }


        // Populate Dropdown
        vulnSelect.innerHTML = ''; // Clear previous options
        const defaultOption = document.createElement('option');
        defaultOption.value = "";
        // Adjust default text based on whether a context is already set
        defaultOption.textContent = selectedVulnId ? "Change vulnerability context..." : "Select vulnerability (Optional)...";
        vulnSelect.appendChild(defaultOption);

        // Group vulnerabilities by type
        const groups = { sast: [], iac: [], sca: [] };
        (vulnerabilities || []).forEach(v => {
            if (v.type === 'sast') { groups.sast.push(v); }
            else if (v.type === 'iac') { groups.iac.push(v); }
            else if (v.type === 'sca') { groups.sca.push(v); } // Include SCA if present
        });

        const createOptionElement = function (vuln) {
            const option = document.createElement('option');
            option.value = vuln.id;
            // Data in `vulnerabilities` is already escaped where needed by the provider/html generator
            option.textContent = `${vuln.name} (${vuln.shortPath})`;
            option.title = `${vuln.name} in ${vuln.fullPath || '(path unknown)'}`;
            return option;
        };

        // Add options grouped by type
        const addGroup = (label, group) => {
            if (group.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = label;
                group.sort((a, b) => a.name.localeCompare(b.name)) // Sort alphabetically within group
                    .forEach(v => optgroup.appendChild(createOptionElement(v)));
                vulnSelect.appendChild(optgroup);
            }
        };

        addGroup("Code Vulnerabilities (SAST)", groups.sast);
        addGroup("Infrastructure Vulnerabilities (IaC)", groups.iac);
        addGroup("Software Composition (SCA)", groups.sca); // Add SCA group

        // Set the current selection in the dropdown
        vulnSelect.value = selectedVulnId || "";
    }

    /**
     * Shows or hides the vulnerability context display area and updates its content.
     * @param {string | null} selectedVulnId - The ID of the currently selected vulnerability.
     */
    function renderContextDisplay(selectedVulnId) {
        if (!contextDisplayDiv || !contextVulnNameSpan) {
            return;
        }

        if (selectedVulnId && fullVulnerabilitiesData) {
            // Find the full vulnerability object using the ID
            const selectedVuln = fullVulnerabilitiesData.find(v => v?.id === selectedVulnId);

            if (selectedVuln) {
                // Extract necessary details safely
                const name = selectedVuln.vulnerability?.name || selectedVuln.id || 'Unknown Vulnerability';
                let displayPath = '(path unknown)';
                if (selectedVuln.path) { displayPath = selectedVuln.path.split(/[\\/]/).pop(); } // Get basename
                else if (selectedVuln.scaFilePath) { displayPath = selectedVuln.scaFilePath.split(/[\\/]/).pop(); }

                const displayName = selectedVuln.vulnerability?.vulnerabilityType === 'sca'
                    ? `${selectedVuln.scaPackageName || 'Package'}@${selectedVuln.scaPackageVersion || 'Version'}`
                    : name;

                // Update the text content (safer than innerHTML for dynamic text)
                contextVulnNameSpan.textContent = `${displayName} (${displayPath})`;
                contextDisplayDiv.title = `Context: ${displayName} in ${selectedVuln.path || selectedVuln.scaFilePath || '(path unknown)'}`;
                contextDisplayDiv.classList.remove('hidden'); // Show the div
                return; // Exit after showing
            } else {
                console.warn(`Selected vulnerability ID ${selectedVulnId} not found in full data.`);
            }
        }

        // Hide the context display if no ID is selected or the vuln wasn't found
        contextDisplayDiv.classList.add('hidden');
        contextVulnNameSpan.textContent = ''; // Clear content
        contextDisplayDiv.title = '';
    }


    /**
     * Updates the enabled/disabled state of input elements based on the current application state.
     * @param {StateForWebview} state - The current application state.
     */
    function updateInputState(state) {
        const isDisabled = !!state.isLoading || !!state.isStreaming || !!state.limitReachedError;
        const isInputEmpty = !messageInput || messageInput.value.trim().length === 0;

        if (sendButton) { sendButton.disabled = isDisabled || isInputEmpty; }
        if (messageInput) {
            messageInput.disabled = isDisabled;
            messageInput.placeholder = isDisabled ? "Waiting for response..." : "Ask the Security Champion...";
        }
        if (resetButton) { resetButton.disabled = !!state.isLoading || !!state.isStreaming; } // Disable during processing
        if (vulnSelect) { vulnSelect.disabled = isDisabled || state.isVulnListLoading; } // Disable during processing or list load
    }


    // --- Event Handlers ---

    /** Handles sending the message text to the extension provider. */
    function handleSendMessage() {
        if (!messageInput || !sendButton) { return; }
        const text = messageInput.value.trim();
        // Prevent sending if disabled or empty
        if (!text || currentState.isLoading || currentState.isStreaming || currentState.limitReachedError) {
            console.warn("[Chatbot Webview] Send message blocked by current state or empty input.");
            return;
        }

        // --- 1. Send message to the extension ---
        vscode.postMessage({ command: 'sendMessage', text: text });

        // --- 2. Clean the input ---
        messageInput.value = '';
        // Trigger the 'input' event to update the send button state (via updateInputState in the listener)
        messageInput.dispatchEvent(new Event('input'));

        // --- 3. IMMEDIATE UI UPDATE (Optimistic Rendering) ---
        // Create a copy of the current state and modify it to reflect the beginning of loading
        const optimisticState = {
            ...currentState, // Keep the current state (messages, context, etc.)
            isLoading: true, // Indicate that loading has begun NOW
            error: null,     // Clear previous errors when sending a new message
            limitReachedError: null, // Same for limit errors
            // Ensure existing messages are included in this optimistic rendering
            messages: [...(currentState.messages || [])]
        };

        // Call renderUI with this optimistic state to display immediately
        // the placeholder AI with the blinking cursor.
        renderUI(optimisticState);

        // Updating the input state controls is also important,
        // renderUI calls updateInputState at the end, but we can do it here explicitly
        // to ensure the input is disabled immediately.
        updateInputState(optimisticState);
        // --- End of modification ---

        // The context (selectedVulnerabilityId) is NOT cleared here.
        // It persists until it is explicitly changed or reset.
    }

    /** Handles resetting the conversation state. */
    function handleResetConversation() {
        // Prevent reset if already processing
        if (currentState.isLoading || currentState.isStreaming) {
            console.warn("[Chatbot Webview] Reset blocked by current state.");
            return;
        }
        // Send reset command to the extension
        vscode.postMessage({ command: 'resetConversation' });
        // UI will update fully when the state message comes back from the provider
    }


    // --- Event Listeners Setup ---

    // Send Button Click
    if (sendButton) { sendButton.addEventListener('click', handleSendMessage); }
    else { console.error("Send button not found!"); }

    // Message Input: Enter key (without Shift) sends message, Input event updates send button state
    if (messageInput) {
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
            }
        });
        messageInput.addEventListener('input', () => updateInputState(currentState));
    } else { console.error("Message input not found!"); }

    // Reset Button Click
    if (resetButton) { resetButton.addEventListener('click', handleResetConversation); }
    else { console.error("Reset button not found!"); }

    // Vulnerability Select Dropdown Change
    if (vulnSelect) {
        console.log("ChatbotJS: Adding change listener to vulnerability select.");

        vulnSelect.addEventListener('change', function (e) {
            const selectedId = e.target.value;
            console.log(`ChatbotJS: Vulnerability selection changed. Selected ID: ${selectedId}`);

            vscode.postMessage({
                command: 'vulnerabilitySelected',
                vulnerabilityId: selectedId || null
            });
        });
    } else {
        console.error("ChatbotJS: Vulnerability select dropdown element (#vuln-select) not found!");
    }

    // Listener for state updates FROM the extension provider
    window.addEventListener('message', function (event) {
        const message = event.data;
        if (message.command === 'updateState') {
            console.log("[Chatbot Webview] Received state update from provider:", message.state); // Debug log
            // Update local state copy
            currentState = message.state;
            // Update local full vulnerability data if provided in the state update
            if (currentState.vulnerabilitiesFull) {
                fullVulnerabilitiesData = currentState.vulnerabilitiesFull;
            }
            // Re-render the entire UI based on the new state
            renderUI(currentState);
        }
    });

    // --- Initial UI Render ---
    console.log("[Chatbot Webview] Initializing UI with data:", currentState);
    renderUI(currentState);

    // --- Request Initial Data Load if Necessary ---
    // Request vulnerability list load if projectId is set but list is empty and not already loading
    const needsInitialVulnLoad = !!currentState.projectId &&
        (!currentState.vulnerabilities || currentState.vulnerabilities.length === 0) &&
        !currentState.isVulnListLoading;
    if (needsInitialVulnLoad) {
        console.log("[Chatbot Webview] Requesting initial vulnerability load.");
        vscode.postMessage({ command: 'loadInitialData' });
    }

})(); // End of IIFE