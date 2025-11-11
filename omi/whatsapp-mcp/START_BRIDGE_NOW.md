# Start WhatsApp Bridge Now

## The Problem
The WhatsApp bridge is **NOT running**. The Python MCP server is trying to connect to `http://localhost:8080`, but nothing is there.

## Quick Fix

### Step 1: Open a New Terminal
Open a **new PowerShell terminal** (keep your current one running for the main server)

### Step 2: Navigate to Bridge Directory
```powershell
cd "C:\Users\Charan Kosari\Desktop\hackathon\omi\whatsapp-mcp\whatsapp-bridge"
```

### Step 3: Run the Bridge
```powershell
.\whatsapp-bridge.exe
```

### Step 4: Wait for Connection
You should see:
```
✓ Connected to WhatsApp! Type 'help' for commands.
REST server is running. Press Ctrl+C to disconnect and exit.
```

### Step 5: Keep It Running
**IMPORTANT**: Don't close this terminal! The bridge must stay running.

## Verify It's Working

In another terminal, test it:
```powershell
curl http://localhost:8080/health
# Should return: {"status":"ok"}
```

## Then Try Again

Once the bridge is running, go back to your app and try sending the WhatsApp message again. It should work now!

## If Bridge Doesn't Start

If `whatsapp-bridge.exe` doesn't run or shows errors:
1. Check if you need to re-authenticate (delete `store/` folder)
2. Make sure you have the compiled .exe file
3. Check the terminal output for specific error messages

