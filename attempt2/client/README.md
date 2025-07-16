# Coding AI IDE

A web-based Integrated Development Environment (IDE) designed for coding with AI assistance. It now includes enhanced project management with SQLite storage, and intelligent Python code validation with automatic AI arguing.

## Features

### Core Functionality
- **Monaco Editor**: A VS Code-like code editor with syntax highlighting and real-time updates for JavaScript, CSS, Python, and other languages.
- **Nested File/Directory Tree**: Create, rename, and delete files and folders in a hierarchical structure, now stored and managed in a SQLite database per project.
- **Project Management**: Create new projects, list existing projects, and load projects, with all files stored in SQLite.
- **Project Export**: Download the entire *current* project as a zip file using `jszip`.
- **Real-Time Collaboration**: File changes are propagated to all connected clients using `jsdiff` for efficient patch updates.

### AI Integration
- **Multi-Provider Support**: Integrates xAI (`grok-2-1212`), OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-sonnet-20241022`), and OpenRouter (e.g., `meta-llama/llama-3.1-8b-instruct:free`, `xai/grok-3`).
- **Failover Mechanism**: Automatically retries failed API calls (up to 3 times) and switches providers based on user-defined order if errors occur (e.g., 429 rate limit, 401 unauthorized).
- **Customizable Failover Order**: Set the priority of AI providers (xAI, OpenAI, Anthropic, OpenRouter) via a draggable list in the settings dialog.
- **OpenRouter Integration**: Select from multiple models (e.g., Llama, Grok-3) with a unified API endpoint.
- **Code Suggestions**: AI generates code blocks, which can be auto-applied to the selected file or manually applied via a button (when auto-apply is disabled).
- **Context-Aware AI**: Sends full project context (file tree and contents from the *current project* in SQLite) with each chat query, respecting the 131,072-token limit.
- **Python Code Validation**: Automatically validates AI-generated Python code for syntax errors (`python -m py_compile`) and PEP8 compliance (`pycodestyle`).
- **Automatic AI Arguing**: If enabled in settings, the IDE will automatically send a follow-up chat message to the AI explaining any detected Python code validation issues and request corrections.

### User Experience
- **Settings Dialog**: Configure API keys, OpenRouter model, failover order, auto-apply code toggle, and the new "Auto-Argue with AI (Python only)" toggle. Persists settings in `localStorage`.
- **Chat Interface**: Interact with AI via a chat window, displaying user (blue), AI (green), and system (yellow) messages with live feedback (e.g., "Processing with xAI...", "Failed with OpenAI, trying Anthropic...").
- **Rate Limit Progress Bar**: Displays API usage (e.g., "API Rate Limit: 50/60") with a visual bar based on response headers (e.g., `x-ratelimit-remaining-requests`).
- **System Log Tab**: View timestamped logs (e.g., API calls, file operations) stored in a SQLite database (`logs.db`) for long-term debugging.

### Technical Details
- **Backend**: Node.js with Express, WebSocket (`ws`), `better-sqlite3` for logging and *project/file storage*, `openai` for API calls, and `child_process` for Python validation.
- **Frontend**: React with JSX, Tailwind CSS, Monaco Editor, `jsdiff` for file diffs, `jszip` for exports, and `react-sortablejs` for draggable failover order.
- **Context Sync**: Sends project context from the *currently loaded project* with API calls, ensuring AI responses are relevant to the codebase.
- **Security Note**: API keys are stored in `localStorage` (client-side); for production, use a secure backend vault.

## Setup Instructions

### Prerequisites
- **Node.js**: Version 14 or higher.
- **NPM**: For installing dependencies.
- **Python 3**: Must be installed on the server machine and accessible via the `python` command in the PATH.
- **pycodestyle**: Install it globally on the server machine for PEP8 validation:
  ```bash
  pip install pycodestyle