# How to Run WhatsApp Bridge (Using Compiled .exe)

## Quick Start

Since you already have a compiled `whatsapp-bridge.exe`, you can run it directly without compiling:

### Option 1: Run from Command Line

```powershell
cd omi\whatsapp-mcp\whatsapp-bridge
.\whatsapp-bridge.exe
```

### Option 2: Double-Click (Not Recommended)

You can double-click `whatsapp-bridge.exe`, but it's better to run it from terminal so you can see the output.

## What to Expect

1. **First Time**: It will show a QR code - scan it with WhatsApp
2. **Already Authenticated**: It will connect automatically and show:

   ```
   ✓ Connected to WhatsApp! Type 'help' for commands.
   REST server is running. Press Ctrl+C to disconnect and exit.
   ```

3. **Keep It Running**: The bridge must stay running in the terminal. Don't close it!

## Verify It's Working

Once running, you should see:

- `✓ Connected to WhatsApp!`
- `REST server is running. Press Ctrl+C to disconnect and exit.`

Then test the API:

```powershell
# In another terminal
curl http://localhost:8080/health
# Should return: {"status":"ok"}
```

## Troubleshooting

### If .exe doesn't run:

- Make sure you're in the `whatsapp-bridge` directory
- Check if the file exists: `dir whatsapp-bridge.exe`
- Try running with full path: `C:\Users\Charan Kosari\Desktop\hackathon\omi\whatsapp-mcp\whatsapp-bridge\whatsapp-bridge.exe`

### If it says "Not connected":

- Check if you need to re-authenticate (delete `store/` folder and restart)
- Make sure WhatsApp is working on your phone

### If port 8080 is in use:

- Find what's using it: `netstat -ano | findstr :8080`
- Kill the process or change the port in the code

## Next Steps

Once the bridge is running:

1. Keep the terminal open (don't close it)
2. The Python MCP server will automatically connect to it
3. Try sending a WhatsApp message through your app

## Reference

Based on the official WhatsApp MCP repository: https://github.com/lharries/whatsapp-mcp
