# WhatsApp MCP Setup Guide

This guide explains how to set up WhatsApp MCP integration using the [WhatsApp MCP](https://github.com/lharries/whatsapp-mcp) server.

## Overview

WhatsApp MCP allows your AI assistant to:

- Send WhatsApp messages to contacts or phone numbers
- Search for contacts by name or phone number
- List and read messages from your WhatsApp chats
- Send files, images, videos, and audio messages
- Search message history

## Prerequisites

- **Go** (for the WhatsApp bridge)
- **Python 3.11+** (for the MCP server)
- **UV** (Python package manager) - Install with:

  ```bash
  # macOS/Linux
  curl -LsSf https://astral.sh/uv/install.sh | sh

  # Windows (PowerShell)
  powershell -c "irm https://astral.sh/uv/install.sh | iex"
  ```

- **FFmpeg** (optional) - Only needed for sending audio as voice messages
- **WhatsApp account** - Your personal WhatsApp account

## Architecture

The WhatsApp MCP consists of two components:

1. **Go WhatsApp Bridge** (`whatsapp-bridge/`): Connects to WhatsApp Web API, handles authentication, stores messages in SQLite
2. **Python MCP Server** (`whatsapp-mcp-server/`): Provides MCP tools for Claude to interact with WhatsApp

## Setup Steps

### 1. Install Dependencies

The WhatsApp MCP is already in the `whatsapp-mcp/` directory. You need to:

#### Install Python Dependencies

```bash
cd whatsapp-mcp/whatsapp-mcp-server
uv sync
```

Or if you don't have `uv`:

```bash
pip install -r requirements.txt
```

(You may need to create a `requirements.txt` from `pyproject.toml`)

#### Install Go Dependencies

```bash
cd whatsapp-mcp/whatsapp-bridge
go mod download
```

### 2. Set Up WhatsApp Bridge (Go Application)

#### On Windows:

1. **Install a C compiler** (required for SQLite):

   - Install [MSYS2](https://www.msys2.org/)
   - Add `ucrt64\bin` to your PATH
   - See [this guide](https://code.visualstudio.com/docs/cpp/config-mingw) for detailed steps

2. **Enable CGO and run the bridge**:

   ```bash
   cd whatsapp-mcp/whatsapp-bridge
   go env -w CGO_ENABLED=1
   go run main.go
   ```

#### On macOS/Linux:

```bash
cd whatsapp-mcp/whatsapp-bridge
go run main.go
```

### 3. Authenticate WhatsApp

1. **Start the Go bridge** (from step 2)
2. **Scan QR Code**: The bridge will display a QR code in the terminal
3. **Open WhatsApp** on your phone
4. **Go to Settings > Linked Devices**
5. **Tap "Link a Device"**
6. **Scan the QR code** displayed in the terminal

After successful authentication:

- The bridge will store your session
- Messages will start syncing to the local SQLite database
- The bridge runs on `http://localhost:8080`

**Note**: You may need to re-authenticate after ~20 days.

### 4. Configure the MCP in Your Application

The WhatsApp MCP is already configured in `mcp-manager.js`. It will:

- Automatically detect when you mention WhatsApp
- Start the Python MCP server when needed
- Connect to the Go bridge running on localhost:8080

### 5. Set UV Path (Optional)

If `uv` is not in your PATH, you can set it via environment variable:

```bash
# .env file or environment
UV_PATH=C:\path\to\uv.exe  # Windows
UV_PATH=/usr/local/bin/uv  # macOS/Linux
```

Or update `mcp-manager.js` to use `python` directly if `uv` is not available.

## Usage Examples

Once set up, you can say:

- **"Send a WhatsApp message to +1234567890 saying 'Hello'"**
- **"Text John on WhatsApp: 'Meeting at 3pm'"**
- **"Send a message on WhatsApp to contact 'Mom' with the message 'I'll be home late'"**
- **"Find contact 'Sarah' on WhatsApp and send her a message"**

## Available Tools

The MCP provides these tools (prefixed with `whatsapp_`):

- `send_message` - Send a WhatsApp message to a phone number or JID
- `search_contacts` - Search for contacts by name or phone number
- `list_messages` - Retrieve messages with filters
- `list_chats` - List available chats
- `get_chat` - Get information about a specific chat
- `get_direct_chat_by_contact` - Find a direct chat with a contact
- `send_file` - Send files, images, videos, documents
- `send_audio_message` - Send audio as WhatsApp voice message
- `download_media` - Download media from messages

## Phone Number Format

When sending messages, use phone numbers in this format:

- **With country code**: `+1234567890` or `1234567890`
- **Example for US**: `+12345678900` (country code + area code + number)
- **Example for India**: `+919876543210` (country code + number)

## Troubleshooting

### "Bridge not running" error

- Make sure the Go bridge is running: `cd whatsapp-mcp/whatsapp-bridge && go run main.go`
- Check that it's running on `http://localhost:8080`
- Verify authentication was successful (you should see messages syncing)

### "UV not found" error

- Install UV: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Or set `UV_PATH` environment variable to the full path of `uv`
- Or modify `mcp-manager.js` to use `python` directly instead of `uv`

### "CGO_ENABLED=0" error (Windows)

- Install MSYS2 and add to PATH
- Run: `go env -w CGO_ENABLED=1`
- Restart your terminal

### Authentication issues

- Delete `whatsapp-bridge/store/` directory to reset
- Restart the bridge and scan QR code again
- Make sure you're not at the device limit (WhatsApp allows limited linked devices)

### Messages not syncing

- Initial sync can take several minutes for large message history
- Check the Go bridge logs for errors
- Try restarting the bridge

### Python dependencies not found

```bash
cd whatsapp-mcp/whatsapp-mcp-server
uv sync
# Or
pip install -r requirements.txt
```

## Security Considerations

- **Local Storage**: All messages are stored locally in SQLite (`whatsapp-bridge/store/messages.db`)
- **No Cloud Sync**: Messages are only stored on your machine
- **Session Security**: Your WhatsApp session is stored locally - keep it secure
- **Privacy**: Messages are only sent to Claude when you explicitly request operations

## Reference

- [WhatsApp MCP GitHub Repository](https://github.com/lharries/whatsapp-mcp)
- [WhatsMeow Library](https://github.com/tulir/whatsmeow) - WhatsApp Web API library
- [UV Package Manager](https://github.com/astral-sh/uv)

## Important Notes

1. **Keep the Go bridge running**: The WhatsApp bridge must be running in a separate terminal/process for the MCP to work
2. **First-time setup**: The first time you run the bridge, it will take time to sync your message history
3. **Re-authentication**: You may need to re-authenticate after ~20 days
4. **Device limits**: WhatsApp limits linked devices - if you hit the limit, unlink a device from WhatsApp settings
