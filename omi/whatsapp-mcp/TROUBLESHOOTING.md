# WhatsApp MCP Troubleshooting Guide

## Common Errors After Scanning QR Code

### 1. "Timeout waiting for QR code scan"
**Cause**: QR code expired or scan took too long (3 minute timeout)

**Solution**:
- Restart the bridge: Stop it (Ctrl+C) and run `go run main.go` again
- Scan the new QR code immediately (within 3 minutes)
- Make sure your phone and computer are on the same network

### 2. "Failed to establish stable connection"
**Cause**: Connection was interrupted after scanning

**Solution**:
- Check your internet connection
- Restart the bridge
- Delete the store directory and re-authenticate:
  ```bash
  cd whatsapp-mcp/whatsapp-bridge
  rm -rf store/  # On Windows: rmdir /s store
  go run main.go
  ```

### 3. "Failed to connect to database" or SQLite errors
**Cause**: Database file corruption or permission issues

**Solution**:
- Delete the store directory:
  ```bash
  cd whatsapp-mcp/whatsapp-bridge
  rm -rf store/  # On Windows: rmdir /s store
  ```
- Make sure you have write permissions in the directory
- Restart the bridge

### 4. Port 8080 already in use
**Cause**: Another process is using port 8080

**Solution**:
- Find what's using port 8080:
  ```bash
  # Windows
  netstat -ano | findstr :8080
  
  # Kill the process (replace PID with the number from above)
  taskkill /PID <PID> /F
  ```
- Or change the port in `main.go` (line 915) and update the Python server config

### 5. "Not connected to WhatsApp" when sending messages
**Cause**: Bridge is running but not connected

**Solution**:
- Check if bridge shows "✓ Connected to WhatsApp!"
- If not, restart the bridge
- Make sure the bridge is still running (don't close the terminal)

### 6. CGO/SQLite errors on Windows
**Cause**: CGO not enabled or C compiler not installed

**Solution**:
- Install MSYS2: https://www.msys2.org/
- Add `ucrt64\bin` to your PATH
- Enable CGO:
  ```bash
  go env -w CGO_ENABLED=1
  ```
- Restart terminal and try again

### 7. "Device logged out" error
**Cause**: Session expired or device was unlinked

**Solution**:
- Delete the store directory and re-authenticate:
  ```bash
  cd whatsapp-mcp/whatsapp-bridge
  rm -rf store/  # On Windows: rmdir /s store
  go run main.go
  ```
- Scan QR code again

### 8. Python MCP server can't connect to bridge
**Cause**: Bridge not running or wrong port

**Solution**:
- Make sure bridge is running and shows "REST server is running"
- Check bridge is on port 8080:
  ```bash
  # Windows
  netstat -ano | findstr :8080
  ```
- Test bridge manually:
  ```bash
  curl http://localhost:8080/health
  ```

## Quick Reset Steps

If nothing works, try a complete reset:

1. **Stop the bridge** (Ctrl+C in the terminal running it)

2. **Delete the store directory**:
   ```bash
   cd whatsapp-mcp/whatsapp-bridge
   rm -rf store/  # On Windows: rmdir /s store
   ```

3. **Restart the bridge**:
   ```bash
   go env -w CGO_ENABLED=1
   go run main.go
   ```

4. **Scan the new QR code** within 3 minutes

5. **Wait for "✓ Connected to WhatsApp!" message**

6. **Keep the bridge running** in a separate terminal

## Checking Bridge Status

To verify the bridge is working:

1. **Check if it's running**:
   - Look for "REST server is running" message
   - Check port 8080 is listening

2. **Test the API**:
   ```bash
   curl http://localhost:8080/health
   # Should return: {"status":"ok"}
   ```

3. **Check logs**:
   - Look for "Connected to WhatsApp" message
   - Check for any error messages in red

## Still Having Issues?

1. Check the full error message in the terminal
2. Verify Go version: `go version` (should be 1.18+)
3. Verify Python version: `python --version` (should be 3.11+)
4. Check if WhatsApp allows linked devices (Settings > Linked Devices)
5. Make sure you're not at the device limit (WhatsApp allows limited devices)

