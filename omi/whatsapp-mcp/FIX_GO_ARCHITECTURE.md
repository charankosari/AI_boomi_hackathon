# Fix Go Architecture Mismatch (32-bit vs 64-bit)

## Problem

You have **32-bit Go** (`windows/386`) but **64-bit GCC** from MSYS2. They're incompatible.

## Solution: Install 64-bit Go

### Option 1: Install 64-bit Go (Recommended)

1. **Download 64-bit Go**:

   - Go to: https://go.dev/dl/
   - Download: `go1.25.4.windows-amd64.msi` (or latest version)
   - **Important**: Make sure it's `amd64` (64-bit), NOT `386` (32-bit)

2. **Install it**:

   - Run the installer
   - It will install to: `C:\Program Files\Go\` (64-bit)
   - Your old 32-bit Go is at: `C:\Program Files (x86)\Go\` (32-bit)

3. **Update PATH**:

   - The installer should update PATH automatically
   - If not, add `C:\Program Files\Go\bin` to your PATH
   - Make sure it comes BEFORE `C:\Program Files (x86)\Go\bin` in PATH

4. **Verify**:

   ```powershell
   go version
   # Should show: go version go1.25.4 windows/amd64 (NOT windows/386)

   go env GOARCH
   # Should show: amd64 (NOT 386)
   ```

5. **Restart terminal** and try again:
   ```powershell
   cd whatsapp-mcp\whatsapp-bridge
   go env -w CGO_ENABLED=1
   go run main.go
   ```

### Option 2: Use 64-bit Go if Already Installed

If you have 64-bit Go installed elsewhere:

1. **Check if 64-bit Go exists**:

   ```powershell
   & "C:\Program Files\Go\bin\go.exe" version
   ```

2. **Use full path**:

   ```powershell
   cd whatsapp-mcp\whatsapp-bridge
   & "C:\Program Files\Go\bin\go.exe" env -w CGO_ENABLED=1
   & "C:\Program Files\Go\bin\go.exe" run main.go
   ```

3. **Or update PATH** to prioritize 64-bit Go:
   ```powershell
   $env:PATH = "C:\Program Files\Go\bin;" + $env:PATH
   go version  # Should now show amd64
   ```

### Option 3: Temporarily Set GOARCH (Won't Work)

**Note**: This won't work because your Go installation is 32-bit. You need to install 64-bit Go.

```powershell
# This won't work - Go installation is 32-bit
go env -w GOARCH=amd64
```

## Quick Fix Steps

1. **Download 64-bit Go**: https://go.dev/dl/ (get `windows-amd64.msi`)
2. **Install it** (will install to `C:\Program Files\Go\`)
3. **Restart terminal**
4. **Verify**: `go version` should show `windows/amd64`
5. **Run bridge**:
   ```powershell
   cd whatsapp-mcp\whatsapp-bridge
   go env -w CGO_ENABLED=1
   go run main.go
   ```

## Why This Happens

- **32-bit Go** (`windows/386`) tries to compile 32-bit code
- **64-bit GCC** (MSYS2 ucrt64) only has 64-bit libraries
- They're incompatible - you need matching architectures

## After Installing 64-bit Go

Once you have 64-bit Go installed, the bridge should compile and run successfully!
