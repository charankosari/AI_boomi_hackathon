# Zomato MCP Setup Guide

This guide explains how to set up Zomato MCP integration with your server.

## Overview

Zomato MCP allows your AI assistant to:

- 🔎 **Restaurant Discovery** - Find nearby restaurants based on your location and preferences
- 📒 **Menu Browsing** - Browse through detailed menus with prices, descriptions, and ratings
- 🛒 **Cart Creation** - Add items to your cart and customize orders with ease
- 🥗 **Food Ordering** - Place orders seamlessly with order tracking support
- 💳 **QR code payment** - Complete secure payments using QR code integration

## Setup

Zomato MCP is an HTTP-based server that's publicly accessible. No authentication is required for basic usage, though OAuth may be needed for ordering features.

### Basic Configuration

The Zomato MCP server is already configured in `mcp-manager.js` with the default URL. No additional setup is required!

### Environment Variables (Optional)

If you need to use a different Zomato MCP server URL, you can set:

```env
ZOMATO_MCP_URL=https://mcp-server.zomato.com/mcp
```

### OAuth Setup (for Ordering Features)

If you want to enable food ordering features, you may need to set up OAuth:

1. **Contact Zomato**: Reach out to Zomato to enable OAuth for your client
2. **Whitelisted Redirect URIs**: Zomato has whitelisted specific redirect URIs:

   - `claude://claude.ai/settings/connectors`
   - `https://chatgpt.com/connector_platform_oauth_redirect`
   - `http://localhost`
   - `http://127.0.0.1`
   - `https://claude.ai/api/mcp/auth_callback`
   - `https://insiders.vscode.dev/redirect`
   - `https://oauth.pstmn.io/v1/callback`
   - `https://vscode.dev/redirect`

3. **Get Credentials**: Once approved, you'll receive OAuth credentials

## How It Works

The Zomato MCP server is accessed via HTTP using `mcp-remote`. When a user message contains food/restaurant-related keywords, the Zomato MCP is automatically enabled.

### Trigger Keywords

The following keywords will trigger Zomato MCP:

- zomato
- restaurant
- food
- order food
- menu
- delivery
- takeaway
- find restaurants
- hungry
- eat
- dinner
- lunch
- breakfast
- pizza
- burger
- cuisine
- restaurants near me
- food delivery

## Testing

1. **Start your server**:

   ```bash
   npm start
   ```

2. **Send a test message**:

   - "Find restaurants near me"
   - "Show me pizza places"
   - "What's on the menu at that restaurant?"
   - "I'm hungry, find me food"

3. **Check the logs**:
   - Look for `🔌 Starting zomato MCP (HTTP) -> npx mcp-remote https://mcp-server.zomato.com/mcp`
   - Verify tools are listed: `🧰 zomato MCP tools: [...]`

## Example Use Cases

### Restaurant Discovery

```
User: "Find Italian restaurants near me"
```

### Menu Browsing

```
User: "Show me the menu for Pizza Hut"
```

### Food Ordering

```
User: "Order a large pizza from Domino's"
```

### Cart Management

```
User: "Add a burger to my cart"
```

## Troubleshooting

### MCP Server Not Starting

**Error**: `Failed to resolve MCP server "zomato"`

**Solution**:

- Make sure `mcp-remote` is available (it will be installed via npx)
- Check your internet connection
- Verify the Zomato MCP server URL is accessible

### Tools Not Available

**Error**: No tools listed for Zomato MCP

**Solution**:

- Check that the MCP server started successfully
- Verify the server URL is correct
- Check server logs for connection errors
- Ensure `mcp-remote` package is accessible via npx

### OAuth Errors

**Error**: OAuth authentication failed

**Solution**:

- Contact Zomato to enable OAuth for your client
- Verify your redirect URI is whitelisted
- Check OAuth credentials are correct

## Disclaimer

**Important**: According to Zomato's documentation, this MCP server is for testing purposes only. Zomato disclaims any and all liabilities that may arise due to erroneous/non-functionality of the MCP integration.

## Additional Resources

- [Zomato MCP Server GitHub](https://github.com/Zomato/mcp-server-manifest)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
- [mcp-remote Documentation](https://www.npmjs.com/package/mcp-remote)

## Notes

- The Zomato MCP server is HTTP-based and accessed remotely
- No local installation required
- Works automatically when food/restaurant keywords are detected
- OAuth may be required for ordering features (contact Zomato for access)
