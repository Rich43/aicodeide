# Coding AI IDE

A web-based Integrated Development Environment (IDE) designed for coding with AI assistance. It integrates multiple AI providers (xAI, OpenAI, Anthropic, OpenRouter) with failover support, a nested file/directory tree, Monaco Editor, real-time chat with live feedback, persistent system logs, and project export capabilities. The IDE is built with modern web technologies (React, Tailwind CSS, WebSocket) and Node.js for the backend, ensuring a seamless and collaborative coding experience.

## Features

### Core Functionality
- **Monaco Editor**: A VS Code-like code editor with syntax highlighting and real-time updates for JavaScript, CSS, and other languages.
- **Nested File/Directory Tree**: Create, rename, and delete files and folders in a hierarchical structure, synced across clients via WebSocket.
- **Project Export**: Download the entire project as a zip file using `jszip`.
- **Real-Time Collaboration**: File changes are propagated to all connected clients using `jsdiff` for efficient patch updates.

### AI Integration
- **Multi-Provider Support**: Integrates xAI (`grok-2-1212`), OpenAI (`gpt-4o-mini`), Anthropic (`claude-3-5-sonnet-20241022`), and OpenRouter (e.g., `meta-llama/llama-3.1-8b-instruct:free`, `xai/grok-3`).
- **Failover Mechanism**: Automatically retries failed API calls (up to 3 times) and switches providers based on user-defined order if errors occur (e.g., 429 rate limit, 401 unauthorized).
- **Customizable Failover Order**: Set the priority of AI providers (xAI, OpenAI, Anthropic, OpenRouter) via a draggable list in the settings dialog.
- **OpenRouter Integration**: Select from multiple models (e.g., Llama, Grok-3) with a unified API endpoint.
- **Code Suggestions**: AI generates code blocks, which can be auto-applied to the selected file or manually applied via a button (when auto-apply is disabled).
- **Context-Aware AI**: Sends full project context (file tree and contents) with each chat query, respecting the 131,072-token limit.

### User Experience
- **Settings Dialog**: Configure API keys, OpenRouter model, failover order, and auto-apply code toggle. Persists settings in `localStorage`.
- **Chat Interface**: Interact with AI via a chat window, displaying user (blue), AI (green), and system (yellow) messages with live feedback (e.g., "Processing with xAI...", "Failed with OpenAI, trying Anthropic...").
- **Rate Limit Progress Bar**: Displays API usage (e.g., "API Rate Limit: 50/60") with a visual bar based on response headers (e.g., `x-ratelimit-remaining-requests`).
- **System Log Tab**: View timestamped logs (e.g., API calls, file operations) stored in a SQLite database (`logs.db`) for long-term debugging.

### Technical Details
- **Backend**: Node.js with Express, WebSocket (`ws`), `better-sqlite3` for logging, and `openai` for API calls.
- **Frontend**: React with JSX, Tailwind CSS, Monaco Editor, `jsdiff` for file diffs, `jszip` for exports, and `react-sortablejs` for draggable failover order.
- **Context Sync**: Sends project context with API calls, ensuring AI responses are relevant to the current codebase.
- **Security Note**: API keys are stored in `localStorage` (client-side); for production, use a secure backend vault.

## Setup Instructions

### Prerequisites
- **Node.js**: Version 14 or higher.
- **NPM**: For installing dependencies.
- **API Keys**:
  - **xAI**: Obtain from [xAI Console](https://console.x.ai) ($25–$150 free credits).
  - **OpenAI**: Get from [OpenAI Platform](https://platform.openai.com) ($5–$10 free credits).
  - **Anthropic**: Acquire from [Anthropic Console](https://console.anthropic.com) (free trial or pay-as-you-go).
  - **OpenRouter**: Register at [OpenRouter](https://openrouter.ai) ($1–$5 free credits).

### Backend Setup
1. Clone the repository and navigate to the `server` directory.
2. Install dependencies:
   ```bash
   cd server
   npm install
   ```
3. Create a `.env` file with any environment-specific configurations (optional, as API keys are set via the frontend).
4. Run the server:
   ```bash
   node server.js
   ```
   The server runs on `http://localhost:3000` and WebSocket on `ws://localhost:3000`.
To fetch a file via HTTP, include the project ID in the query string:
```bash
curl "http://localhost:3000/file/%2Findex.js?projectId=1"
```


### Frontend Setup
1. Navigate to the `client` directory and host it using a static server:
   ```bash
   cd client
   npx serve
   ```
2. Access the IDE at `http://localhost:3000` (or the port provided by the server).
3. Ensure WebSocket connects to `ws://localhost:3000`.

### Database
- The backend automatically creates `logs.db` (SQLite) on first run to store system logs.
- Logs are retained indefinitely; consider adding a cleanup mechanism for production.

## Usage

1. **Initial Setup**:
   - Open the IDE in a browser; the settings dialog appears if no API keys are configured.
   - Enter API keys for xAI, OpenAI, Anthropic, and/or OpenRouter.
   - Select an OpenRouter model (e.g., `meta-llama/llama-3.1-8b-instruct:free`).
   - Reorder failover priority (drag providers in the settings dialog).
   - Toggle "Auto-Apply Code Suggestions" (on for automatic application, off for manual "Apply Code" button).
   - Save settings to proceed.

2. **File Management**:
   - Use the file tree to create files (e.g., `/src/utils.js`), folders, rename, or delete items.
   - Changes sync in real-time across clients via WebSocket.

3. **Code Editing**:
   - Select a file to edit in the Monaco Editor.
   - Changes are saved and broadcast to other clients using `jsdiff`.

4. **AI Interaction**:
   - In the chat tab, ask coding questions (e.g., "Add a fetch function to /index.js").
   - View live feedback (e.g., "Processing with xAI...", "Failed with xAI, trying OpenAI...").
   - If auto-apply is enabled, code suggestions are applied to the selected file.
   - If auto-apply is disabled, click the "Apply Code" button next to AI responses with code blocks to apply them manually.
   - Monitor API usage via the rate limit progress bar (e.g., "API Rate Limit: 50/60").

5. **System Logs**:
   - Switch to the "System Log" tab to view timestamped events (e.g., "[2025-07-16T14:25:32Z] Manually applied code suggestion to /index.js").
   - Logs are stored in `logs.db` for long-term debugging.

6. **Export Project**:
   - Click "Export Project" to download the project as `project.zip`.

## Example Workflow
- **Configure**: Set xAI and OpenRouter API keys, prioritize xAI, disable auto-apply.
- **Create File**: Add `/src/utils.js` in the file tree.
- **Edit**: Write initial code in the Monaco Editor.
- **Chat**: Ask "Add a fetch function to /src/utils.js". See:
  - "Processing with xAI..." (yellow).
  - On success: "AI (xAI): ```javascript\nfetch(...)\n```" with an "Apply Code" button (green).
  - Click "Apply Code" to update `/src/utils.js`.
- **Logs**: Check the "System Log" tab for "[2025-07-16T14:25:32Z] Manually applied code suggestion to /src/utils.js".
- **Export**: Download `project.zip`.

## Limitations
- **Free Tier Limits**: xAI (60 requests/hour), OpenAI, Anthropic, and OpenRouter have similar constraints. Monitor usage in respective consoles.
- **Token Costs**: Large contexts (~10,000 tokens) cost $0.02–$0.05 per query. Use cached prompts to reduce costs.
- **Security**: API keys in `localStorage` are client-side; use a backend vault for production.
- **Log Storage**: SQLite logs grow indefinitely; implement a cleanup mechanism for production.

## Enhancements
- Add a "Clear Logs" button to reset the SQLite database.
- Validate code blocks before applying (e.g., syntax check).
- Add a preview modal for code suggestions before manual application.
- Warn users when nearing rate limits (e.g., <10 requests remaining).
- Persist project files in SQLite for durability.
- Support additional OpenRouter models dynamically fetched from their API.

## API References
- **xAI**: [https://x.ai/api](https://x.ai/api)
- **OpenAI**: [https://platform.openai.com](https://platform.openai.com)
- **Anthropic**: [https://console.anthropic.com](https://console.anthropic.com)
- **OpenRouter**: [https://openrouter.ai](https://openrouter.ai)
- **SuperGrok**: For higher limits, consider [SuperGrok](https://x.ai/grok) ($300/year).

## License
MIT License. See `LICENSE` file (not included here) for details.