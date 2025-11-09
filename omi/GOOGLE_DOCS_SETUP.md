# Google Docs MCP Setup Guide

This guide explains how to set up Google Docs MCP integration using the [MCP-Google-Doc](https://github.com/ophydami/MCP-Google-Doc) server.

## Overview

Google Docs MCP allows your AI assistant to:

- Create new Google Docs
- Read existing documents
- Update documents
- Search for documents
- Delete documents
- List all your Google Docs

## Prerequisites

- Node.js v16.0.0 or later
- Google Cloud project with Google Docs API and Google Drive API enabled
- OAuth 2.0 credentials (same as Google Calendar - you can reuse `gcp-oauth.keys.json`)

## Setup Steps

### 1. Enable Google APIs

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (same one used for Google Calendar)
3. Go to "APIs & Services" → "Library"
4. Enable the following APIs:
   - **Google Docs API**
   - **Google Drive API**

### 2. Copy Credentials

The Google Docs MCP server expects `credentials.json` in its directory. Copy your existing credentials:

**On Windows (PowerShell):**

```powershell
Copy-Item "gcp-oauth.keys.json" -Destination "google-docs-mcp\credentials.json"
```

**On macOS/Linux:**

```bash
cp gcp-oauth.keys.json google-docs-mcp/credentials.json
```

### 3. Update OAuth Scopes (if needed)

Make sure your OAuth consent screen includes these scopes:

- `https://www.googleapis.com/auth/documents`
- `https://www.googleapis.com/auth/drive`

If you already set up Google Calendar, these scopes should already be included.

### 4. First-Time Authentication

When you first use Google Docs features, the MCP will:

1. Automatically open your browser for authentication
2. Prompt you to sign in with your Google account
3. Request permissions for Google Docs and Drive
4. Store tokens in `google-docs-mcp/token.json`

## Configuration

The Google Docs MCP is automatically configured in `mcp-manager.js`:

```javascript
googledocs: {
  packageName: path.resolve(process.cwd(), "google-docs-mcp", "build", "server.js"),
  detectTrigger: detectGoogleDocsTrigger,
  enabled: true, // Auto-enabled if server.js and credentials exist
}
```

## Trigger Phrases

The Google Docs MCP is automatically enabled when you mention:

- "create a google doc"
- "write a document"
- "make a doc"
- "new google doc"
- "save as google doc"
- etc.

## Usage Examples

Once set up, you can say:

- **"Create a google doc titled 'Meeting Notes' with the content 'Today we discussed...'"**
- **"Write a document about project planning"**
- **"Make a google doc of this conversation"**
- **"Create a document with the following content: [your content]"**

## Available Tools

The MCP provides these tools (prefixed with `googledocs_` or `google-docs_`):

- `create-doc` - Create a new Google Doc with title and content
- `update-doc` - Update an existing document (append or replace)
- `search-docs` - Search for documents containing specific text
- `delete-doc` - Delete a document by ID
- `list-docs` - List all your Google Docs (via resources)

## Troubleshooting

### "Credentials not found" error

- Make sure `credentials.json` exists in `google-docs-mcp/` directory
- Verify the file has the correct format (same as `gcp-oauth.keys.json`)

### "API not enabled" error

- Go to Google Cloud Console
- Enable Google Docs API and Google Drive API
- Wait a few minutes for changes to propagate

### Authentication issues

- Delete `google-docs-mcp/token.json` if it exists
- Restart your server to trigger new authentication flow
- Make sure you're using the same Google account that created the OAuth credentials

### "Module not found" errors

- Make sure you've built the TypeScript project:
  ```bash
  cd google-docs-mcp
  npm install
  npm run build
  ```

## Security Notes

- `credentials.json` and `token.json` contain sensitive information
- Never commit these files to version control (they're in `.gitignore`)
- Tokens are stored locally in `google-docs-mcp/token.json`
- Tokens automatically refresh when they expire

## Reference

- [MCP-Google-Doc GitHub Repository](https://github.com/ophydami/MCP-Google-Doc)
- [Google Docs API Documentation](https://developers.google.com/docs/api)
- [Google Drive API Documentation](https://developers.google.com/drive/api)
