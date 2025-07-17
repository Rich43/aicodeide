# Roadmap

This document tracks the current capabilities of the Coding AI IDE and the planned enhancements.

## Completed Features

### Core Functionality
- **Monaco Editor** with syntax highlighting and real-time updates.
- **Nested File/Directory Tree** for managing files and folders.
- **Project Export** to download the project as a zip.
- **Real-Time Collaboration** that syncs changes across clients.

### AI Integration
- **Multi-Provider Support** for xAI, OpenAI, Anthropic and OpenRouter.
- **Failover Mechanism** with a user-defined provider order.
- **OpenRouter Integration** with model selection.
- **Code Suggestions** that can be auto-applied or applied manually.
- **Context-Aware AI** that sends the full project context with each query.

### User Experience
- **Settings Dialog** for API keys, failover order and auto-apply toggle.
- **Chat Interface** with live feedback messages.
- **Rate Limit Progress Bar** based on response headers.
- **System Log Tab** storing logs in SQLite.

### Technical Details
- **Backend** built with Node.js/Express, WebSocket and `better-sqlite3`.
- **Frontend** using React, Tailwind CSS, Monaco Editor, `jsdiff` and `jszip`.

## Roadmap
- Add a "Clear Logs" button to reset the SQLite database.
- Validate code blocks before applying (e.g., syntax check).
- Add a preview modal for code suggestions before manual application.
- Warn users when nearing rate limits (e.g., <10 requests remaining).
- Persist project files in SQLite for durability.
- Support additional OpenRouter models dynamically fetched from their API.
