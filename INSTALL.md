# Installation Instructions

## Quick Install (Recommended)

### 1. Install Node.js Dependencies

Open a terminal in the project directory and run:

```bash
npm install
```

This will install all required packages including:
- TypeScript and build tools
- Database drivers (mysql2, pg, mssql, mongodb)
- VS Code extension development tools
- ESLint and Prettier for code quality

### 2. Build the Extension

```bash
npm run compile
```

This compiles the TypeScript code to JavaScript.

### 3. Run the Extension

**Option A: Debug Mode (Recommended for Development)**
1. Open the project in VS Code
2. Press `F5` or go to Run → Start Debugging
3. A new VS Code window will open with the extension loaded

**Option B: Watch Mode (Auto-recompile on changes)**
```bash
npm run watch
```
Then press `F5` in VS Code.

### 4. Test the Extension

In the new VS Code window:
1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "DB Connector: Add Database Connection"
3. Follow the prompts to add your first database connection

## Package for Distribution

### Create VSIX Package

First, install the VS Code Extension Manager:

```bash
npm install -g @vscode/vsce
```

Then create the package:

```bash
npm run package  # Build production bundle
vsce package     # Create .vsix file
```

This creates a `.vsix` file that can be installed in VS Code.

### Install VSIX File

1. Open VS Code
2. Go to Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu (three dots at top)
4. Select "Install from VSIX..."
5. Choose the `.vsix` file

## System Requirements

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **VS Code**: 1.85.0 or higher
- **Operating System**: Windows, macOS, or Linux

## Database Server Requirements

To use this extension, you need access to at least one of:

- **MySQL** 5.7+ or **MariaDB** 10.3+
- **PostgreSQL** 10+
- **SQL Server** 2014+ (MSSQL)
- **MongoDB** 4.0+

The database servers can be:
- Running locally on your machine
- Running in Docker containers
- Hosted remotely (ensure network access)

## Verifying Installation

### Check Dependencies Installed

```bash
npm list --depth=0
```

You should see:
- mysql2
- pg
- mssql
- mongodb
- typescript
- webpack
- and other dependencies

### Check TypeScript Compilation

```bash
npm run compile
```

Should complete without errors.

### Check Extension Activation

1. Press `F5` to launch extension
2. Open Command Palette
3. Type "DB Connector"
4. You should see several commands listed

## Troubleshooting Installation

### Issue: `npm install` fails

**Solution 1**: Clear npm cache
```bash
npm cache clean --force
npm install
```

**Solution 2**: Delete `node_modules` and reinstall
```bash
rm -rf node_modules package-lock.json
npm install
```

**Solution 3**: Use different Node version
```bash
# Install nvm (Node Version Manager) if not installed
# Then use Node 18.x
nvm install 18
nvm use 18
npm install
```

### Issue: TypeScript compilation errors

**Solution**: Ensure TypeScript is installed
```bash
npm install -g typescript
npm install
npm run compile
```

### Issue: Extension won't start in debug mode

**Solution 1**: Reload VS Code
- Close all VS Code windows
- Reopen the project
- Press `F5`

**Solution 2**: Check `.vscode/launch.json` exists
- Verify the file is present
- It should have been created during setup

**Solution 3**: Check VS Code version
```bash
code --version
```
Ensure version is 1.85.0 or higher.

### Issue: Database driver installation fails

**Solution**: Install drivers individually
```bash
npm install mysql2
npm install pg
npm install mssql
npm install mongodb
```

### Issue: Webpack build fails

**Solution**: Clean and rebuild
```bash
rm -rf dist out
npm run compile
npm run package
```

## Platform-Specific Notes

### Windows

- Use PowerShell or Command Prompt
- Path separators are `\` instead of `/`
- Some commands may need administrator privileges

### macOS

- May need to install Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```

### Linux

- Ensure build essentials are installed:
  ```bash
  sudo apt-get install build-essential  # Ubuntu/Debian
  sudo yum groupinstall "Development Tools"  # CentOS/RHEL
  ```

## Next Steps

After successful installation:

1. 📖 Read [QUICKSTART.md](QUICKSTART.md) for basic usage
2. 📚 Review [README.md](README.md) for full documentation
3. 🛠️ Check [SETUP.md](SETUP.md) for development setup
4. 🚀 Start connecting to your databases!

## Getting Help

If you encounter issues:

1. Check this INSTALL.md file
2. Review [SETUP.md](SETUP.md)
3. Check VS Code Output panel (View → Output → "DB Connector")
4. Look for existing issues on GitHub
5. Create a new issue with:
   - Error messages
   - Steps to reproduce
   - Your environment (OS, Node version, VS Code version)

## Uninstalling

### Remove Extension (if installed from VSIX)

1. Go to Extensions view in VS Code
2. Find "DB Connector Extension"
3. Click Uninstall

### Remove Development Environment

```bash
# Remove node_modules
rm -rf node_modules

# Remove build outputs
rm -rf out dist

# Remove lock file
rm package-lock.json
```

The project source files and configuration will remain for future use.
