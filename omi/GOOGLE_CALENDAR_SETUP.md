# Google Calendar MCP Setup Guide

This guide explains how to set up Google Calendar MCP integration using the official `@cocal/google-calendar-mcp` package.

**Reference**: [Official Authentication Guide](https://github.com/nspady/google-calendar-mcp/blob/main/docs/authentication.md)

## Overview

Google Calendar MCP allows your AI assistant to:

- Create calendar events
- List upcoming events
- View available time slots
- Update existing events
- Delete events
- Add attendees
- Set reminders

## Installation

### 1. Install the Package

```bash
npm install @cocal/google-calendar-mcp
```

Or it will be installed automatically when first used via `npx`.

## Google Cloud Setup

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Click "Select a project" → "New Project"
3. Enter a project name (e.g., "Calendar MCP")
4. Click "Create"

### 2. Enable the Google Calendar API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"
4. Wait for the API to be enabled (usually takes a few seconds)

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:

   - Choose "External" user type
   - Fill in the required fields:
     - App name: "Calendar MCP" (or your choice)
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes:
     - Click "Add or Remove Scopes"
     - Add: `https://www.googleapis.com/auth/calendar.events`
     - Or use the broader scope: `https://www.googleapis.com/auth/calendar`
   - Add test users:
     - Add your email address
     - **Important**: Wait 2-3 minutes for test users to propagate

4. Create the OAuth client:

   - Application type: **Desktop app** (Important!)
   - Name: "Calendar MCP Client"
   - Click "Create"

5. Download the credentials:
   - Click the download button (⬇️) next to your new client
   - Save as `gcp-oauth.keys.json`

## Credential File Format

Your credentials file should look like this:

```json
{
  "installed": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "client_secret": "YOUR_CLIENT_SECRET",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "redirect_uris": ["http://localhost"]
  }
}
```

## Configuration

### Option 1: Environment Variable (Recommended)

Add to your `.env` file:

```env
GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/your/gcp-oauth.keys.json
```

Or place the file in your project root as `gcp-oauth.keys.json` (it will be auto-detected).

### Option 2: Default Location

Place the credentials file in the project root as `gcp-oauth.keys.json`. The MCP will automatically detect it.

## Token Storage

OAuth tokens are automatically stored in a secure location:

- **macOS/Linux**: `~/.config/google-calendar-mcp/tokens.json`
- **Windows**: `%APPDATA%\google-calendar-mcp\tokens.json`

To use a custom location, set:

```env
GOOGLE_CALENDAR_MCP_TOKEN_PATH=/custom/path/tokens.json
```

## First-Time Authentication

1. **Start your server**:

   ```bash
   npm start
   ```

2. **When you first use Google Calendar features**, the MCP will automatically:

   - Open your browser for authentication
   - Prompt you to sign in with your Google account
   - Request calendar permissions
   - Store the tokens securely

3. **Alternative: Manual Authentication**

   If you need to authenticate manually:

   ```bash
   npx @cocal/google-calendar-mcp auth
   ```

   Make sure `GOOGLE_OAUTH_CREDENTIALS` is set or `gcp-oauth.keys.json` is in the project root.

## Production Mode (Recommended)

**Important**: By default, your app runs in "Testing" mode, which has limitations:

- OAuth tokens expire after 7 days
- Limited to test users you've explicitly added

### Moving to Production Mode

1. **Publish Your App**:

   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project
   - Go to "APIs & Services" > "OAuth consent screen"
   - Click the "Publish App" button

2. **Complete OAuth Verification** (if required):
   - If your app requests sensitive or restricted scopes, Google requires verification
   - Follow the on-screen instructions
   - Provide necessary information including a privacy policy URL

**Benefits of Production Mode**:

- Tokens don't expire after 7 days
- No need to re-authenticate weekly
- More stable for personal use

## Re-authentication

If your tokens expire or become invalid:

```bash
# Set your credentials path first (if not using default location)
export GOOGLE_OAUTH_CREDENTIALS="/path/to/your/gcp-oauth.keys.json"

# Run the auth command
npx @cocal/google-calendar-mcp auth
```

## Testing

Once configured, test the integration:

1. **Start your server**:

   ```bash
   npm start
   ```

2. **Send a test message**:

   - "Show me my calendar events"
   - "What events do I have this week?"
   - "I need to see available slots of main in Google Calendar"
   - "Create a calendar event for tomorrow at 2pm"

3. **Check the logs**:
   - Look for `🔌 Starting googlecalendar MCP`
   - Verify tools are listed: `🧰 googlecalendar MCP tools: [...]`
   - Check for authentication prompts if first time

## Troubleshooting

### "Invalid credentials" error

- Ensure you selected "Desktop app" as the application type
- Check that the credentials file is valid JSON
- Verify the file path is correct in `GOOGLE_OAUTH_CREDENTIALS`

### "Access blocked" error

- Add your email as a test user in OAuth consent screen
- Wait 2-3 minutes for changes to propagate
- Make sure you're signed in with the correct Google account

### "Token expired" error

- Run `npx @cocal/google-calendar-mcp auth` to re-authenticate
- Check if you're in test mode (7-day expiration)
- Consider moving to production mode for longer-lived tokens

### MCP not starting

- Verify `GOOGLE_OAUTH_CREDENTIALS` is set correctly
- Check that `gcp-oauth.keys.json` exists in project root (if using default)
- Ensure the package is accessible: `npx @cocal/google-calendar-mcp --version`

### "MCP detected but not enabled"

- Check that `GOOGLE_OAUTH_CREDENTIALS` environment variable is set
- Or ensure `gcp-oauth.keys.json` exists in your project root
- Restart your server after setting environment variables

## Security Best Practices

1. **Never commit credentials**: Add `gcp-oauth.keys.json` to `.gitignore`
2. **Secure file permissions**:
   ```bash
   chmod 600 /path/to/gcp-oauth.keys.json
   ```
3. **Use environment variables**: Keeps credentials out of config files
4. **Regularly rotate**: Regenerate credentials if compromised

## Example .env File

```env
# Required
ANTHROPIC_API_KEY=your_key_here

# Google Calendar MCP
GOOGLE_OAUTH_CREDENTIALS=/absolute/path/to/gcp-oauth.keys.json
# OR place gcp-oauth.keys.json in project root (auto-detected)

# Optional: Custom token storage
# GOOGLE_CALENDAR_MCP_TOKEN_PATH=/custom/path/tokens.json
```

## Additional Resources

- [Official GitHub Repository](https://github.com/nspady/google-calendar-mcp)
- [Authentication Documentation](https://github.com/nspady/google-calendar-mcp/blob/main/docs/authentication.md)
- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
