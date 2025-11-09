# MCP Setup Guide

This server supports multiple Model Context Protocol (MCP) servers. MCPs are automatically detected and initialized when user messages trigger them.

## How It Works

**Important**: MCPs configured in Claude Desktop are NOT directly accessible from this server. Instead, this server runs the same MCP server packages as child processes, just like Claude Desktop does.

## Available MCPs

### 1. Notion MCP

- **Package**: `@notionhq/notion-mcp-server`
- **Trigger**: Messages containing "notion"
- **Required Env**: `NOTION_TOKEN` (optional - only enables if provided)

### 2. Filesystem MCP

- **Package**: `@modelcontextprotocol/server-filesystem`
- **Trigger**: Messages about files, folders, directories, reading/writing files
- **Required Env**: `FILESYSTEM_ALLOWED_DIRS` (optional, defaults to current working directory)

### 3. Fetch MCP

- **Package**: `@modelcontextprotocol/server-fetch`
- **Trigger**: Messages about HTTP requests, APIs, fetching data, downloading
- **Required Env**: None

### 4. GitHub MCP (optional)

- **Package**: `@modelcontextprotocol/server-github`
- **Trigger**: Messages containing "github"
- **Required Env**: `GITHUB_TOKEN` (optional - only enables if provided)

### 5. Google Calendar MCP (optional)

- **Package**: `@cocal/google-calendar-mcp` (official package)
- **Trigger**: Messages about calendar, events, meetings, schedule, appointments, available slots
- **Required Env**:
  - `GOOGLE_OAUTH_CREDENTIALS` (path to `gcp-oauth.keys.json` file)
  - OR place `gcp-oauth.keys.json` in project root (auto-detected)
- **Setup**: Requires Google Cloud OAuth 2.0 credentials
- **See**: `GOOGLE_CALENDAR_SETUP.md` for detailed setup instructions
- **Reference**: [Official Authentication Guide](https://github.com/nspady/google-calendar-mcp/blob/main/docs/authentication.md)

### 6. Google Docs MCP (optional)

- **Type**: Local TypeScript-based MCP server
- **Source**: [MCP-Google-Doc](https://github.com/ophydami/MCP-Google-Doc)
- **Trigger**: Messages about creating documents, writing docs, "create a google doc", etc.
- **Required Setup**:
  - Enable Google Docs API and Google Drive API in Google Cloud Console
  - Copy `gcp-oauth.keys.json` to `google-docs-mcp/credentials.json`
  - Build the TypeScript project: `cd google-docs-mcp && npm install && npm run build`
- **Features**: Create, read, update, search, and delete Google Docs
- **See**: `GOOGLE_DOCS_SETUP.md` for detailed setup instructions

### 7. WhatsApp MCP (optional)

- **Type**: Python-based MCP server (requires Go bridge)
- **Source**: [WhatsApp MCP](https://github.com/lharries/whatsapp-mcp)
- **Trigger**: Messages about WhatsApp, sending messages, texting, contacts
- **Required Setup**:
  - Go installed (for WhatsApp bridge)
  - Python 3.11+ and UV package manager
  - WhatsApp account for authentication
  - Go bridge must be running separately on localhost:8080
- **Features**: Send messages, search contacts, read messages, send files/audio
- **See**: `WHATSAPP_SETUP.md` for detailed setup instructions

### 8. Zomato MCP (optional)

- **Type**: HTTP-based (accessed via `mcp-remote`)
- **URL**: `https://mcp-server.zomato.com/mcp`
- **Trigger**: Messages about restaurants, food, ordering, menu, delivery, etc.
- **Required Env**: None (publicly accessible)
- **Features**: Restaurant discovery, menu browsing, cart creation, food ordering, QR code payment
- **See**: `ZOMATO_SETUP.md` for detailed setup instructions

## Installation

Install MCP server packages:

```bash
npm install @notionhq/notion-mcp-server @modelcontextprotocol/server-filesystem @modelcontextprotocol/server-fetch
```

For optional MCPs:

```bash
npm install @modelcontextprotocol/server-github
```

## Environment Variables

Add to your `.env` file:

```env
# Required
ANTHROPIC_API_KEY=your_key_here

# Optional MCP tokens (only add if you want to use those MCPs)
NOTION_TOKEN=your_notion_token
GITHUB_TOKEN=your_github_token

# Google Calendar (see GOOGLE_CALENDAR_SETUP.md for full setup)
# Point to your gcp-oauth.keys.json file downloaded from Google Cloud Console
GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/gcp-oauth.keys.json
# OR place gcp-oauth.keys.json in project root (auto-detected)

# Zomato MCP (optional - works out of the box, see ZOMATO_SETUP.md)
# ZOMATO_MCP_URL=https://mcp-server.zomato.com/mcp

# Optional MCP configuration
FILESYSTEM_ALLOWED_DIRS=/path/to/allowed/directory
```

## Adding More MCPs

To add a new MCP server:

1. **Install the package**:

   ```bash
   npm install <mcp-package-name>
   ```

2. **Add to `mcp-manager.js`**:
   Edit the `MCP_REGISTRY` object in `mcp-manager.js`:

   ```javascript
   myNewMCP: {
     packageName: "package-name",
     binName: "optional-bin-name", // optional
     env: {
       MY_MCP_TOKEN: process.env.MY_MCP_TOKEN,
     },
     detectTrigger: (text) => /\bmykeyword\b/i.test(text),
     enabled: !!process.env.MY_MCP_TOKEN,
   },
   ```

3. **Restart the server**

## How MCPs Are Detected

MCPs are automatically enabled when user messages contain trigger keywords:

- **Notion**: "notion"
- **Filesystem**: "file", "folder", "directory", "read file", "write file", etc.
- **Fetch**: "fetch", "http", "api call", "download", etc.
- **GitHub**: "github"

You can customize trigger detection in `mcp-manager.js`.

## Using MCPs

Once an MCP is detected and initialized, Claude will automatically have access to its tools. Tools are prefixed with the MCP name (e.g., `notion_API-post-page`, `filesystem_read_file`).

## Troubleshooting

1. **MCP not starting**: Check that the package is installed and environment variables are set (if required)
2. **Tools not available**: Verify the MCP server started successfully (check console logs)
3. **Permission errors**: For filesystem MCP, check `FILESYSTEM_ALLOWED_DIRS` path permissions

## Common MCP Packages

Here are some popular MCP servers you can add:

- `@modelcontextprotocol/server-sqlite` - SQLite database access
- `@modelcontextprotocol/server-playwright` - Browser automation
- `@modelcontextprotocol/server-postgres` - PostgreSQL access
- `@modelcontextprotocol/server-git` - Git operations

Check the [MCP Server Directory](https://modelcontextprotocol.io/servers) for more options.
