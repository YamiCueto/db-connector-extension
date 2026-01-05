# DB Connector Extension - Setup Guide

This guide will help you set up the development environment and build the extension.

## Prerequisites

- **Node.js**: Version 18.x or higher
- **npm**: Version 9.x or higher
- **VS Code**: Version 1.85.0 or higher
- **Git**: For version control

## Initial Setup

### 1. Install Dependencies

```bash
npm install
```

This will install all required dependencies including:
- TypeScript compiler
- Webpack and loaders
- ESLint and Prettier
- Database drivers (mysql2, pg, mssql, mongodb)
- VS Code extension development tools

### 2. Compile TypeScript

```bash
npm run compile
```

This compiles the TypeScript source files to JavaScript in the `out` directory.

### 3. Build with Webpack

```bash
npm run package
```

This creates a production-ready bundle in the `dist` directory.

## Development Workflow

### Running the Extension in Debug Mode

1. Open the project in VS Code
2. Press `F5` or go to Run > Start Debugging
3. This will:
   - Compile the TypeScript code
   - Launch a new VS Code window with the extension loaded
   - Allow you to test the extension

### Watch Mode

For continuous development, use watch mode:

```bash
npm run watch
```

This will automatically recompile when you make changes to source files.

### Testing Changes

After making changes:
1. Save your files
2. Reload the extension host window (`Ctrl+R` or `Cmd+R`)
3. Test your changes

## Building for Production

### Create VSIX Package

```bash
npm run package
vsce package
```

Note: You'll need to install `vsce` first:
```bash
npm install -g @vscode/vsce
```

This creates a `.vsix` file that can be:
- Installed locally in VS Code
- Published to the VS Code Marketplace
- Shared with others

## Code Quality

### Linting

Check for code issues:
```bash
npm run lint
```

Auto-fix linting issues:
```bash
npm run lint:fix
```

### Formatting

Check code formatting:
```bash
npm run format:check
```

Auto-format code:
```bash
npm run format
```

## Project Structure

```
db-connector-extension/
├── .vscode/                    # VS Code configuration
│   ├── launch.json            # Debug configurations
│   ├── tasks.json             # Build tasks
│   └── extensions.json        # Recommended extensions
├── src/                       # Source code
│   ├── extension.ts           # Main entry point
│   ├── connectionManager.ts   # Connection management
│   ├── types.ts               # TypeScript interfaces
│   ├── databaseProviders/     # Database providers
│   ├── treeView/              # Tree view components
│   ├── queryEditor/           # Query execution
│   └── utils/                 # Utilities
├── dist/                      # Webpack output (gitignored)
├── out/                       # TypeScript output (gitignored)
├── node_modules/              # Dependencies (gitignored)
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
├── webpack.config.js          # Webpack config
├── .eslintrc.json            # ESLint config
├── .prettierrc.json          # Prettier config
├── .gitignore                # Git ignore rules
├── .vscodeignore             # VSIX package ignore rules
├── README.md                  # User documentation
├── CHANGELOG.md              # Version history
└── SETUP.md                  # This file
```

## Common Issues and Solutions

### Issue: Extension won't activate

**Solution**: Check the VS Code output panel for errors:
1. View > Output
2. Select "DB Connector" or "Log (Extension Host)" from dropdown

### Issue: TypeScript compilation errors

**Solution**:
1. Delete `out` and `node_modules` directories
2. Run `npm install`
3. Run `npm run compile`

### Issue: Webpack build fails

**Solution**:
1. Delete `dist` directory
2. Run `npm run compile` first
3. Then run `npm run package`

### Issue: Database connection fails

**Solution**:
1. Verify database server is running
2. Check host, port, username, password
3. Check firewall settings
4. Review logs in Output panel

## Adding a New Database Provider

To add support for a new database:

1. Create provider file in `src/databaseProviders/`:
```typescript
import { IDatabaseProvider, ConnectionConfig, ... } from '../types';

export class NewDBProvider implements IDatabaseProvider {
    // Implement all required methods
}
```

2. Add to `DatabaseType` enum in `src/types.ts`:
```typescript
export enum DatabaseType {
    // ... existing types
    NewDB = 'newdb'
}
```

3. Update `ConnectionManager.createProvider()` in `src/connectionManager.ts`:
```typescript
case DatabaseType.NewDB:
    return new NewDBProvider();
```

4. Add default port in `extension.ts` `getDefaultPort()` function

5. Update README.md with new database support

## Testing

### Manual Testing Checklist

- [ ] Add a new connection
- [ ] Test connection
- [ ] Connect to database
- [ ] Browse databases and tables
- [ ] Execute a query
- [ ] View results
- [ ] Export results to CSV
- [ ] Export results to JSON
- [ ] View query history
- [ ] Disconnect from database
- [ ] Remove connection

### Unit Tests (Future)

The project is set up for unit testing with Mocha. To add tests:

1. Create test files in `src/test/`
2. Run tests with: `npm test`

## Publishing

### Prerequisites

1. Create a Microsoft account
2. Get a Personal Access Token from Azure DevOps
3. Create a publisher ID

### Publish Steps

```bash
# Login to vsce
vsce login your-publisher-name

# Publish
vsce publish
```

Or publish manually:
```bash
# Create VSIX
vsce package

# Upload to marketplace at https://marketplace.visualstudio.com/manage
```

## Debugging Tips

### Enable Verbose Logging

The extension logs to the "DB Connector" output channel. To view:
1. View > Output (`Ctrl+Shift+U`)
2. Select "DB Connector" from dropdown

### Debug Provider Issues

Add breakpoints in:
- `src/databaseProviders/*.ts` - Database-specific code
- `src/connectionManager.ts` - Connection handling
- `src/queryEditor/queryExecutor.ts` - Query execution

### Debug UI Issues

Add breakpoints in:
- `src/extension.ts` - Command handlers
- `src/treeView/databaseTreeProvider.ts` - Tree view
- `src/queryEditor/resultsPanel.ts` - Results display

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting and formatting
5. Test thoroughly
6. Submit a pull request

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Webpack Documentation](https://webpack.js.org/)

## Support

For questions or issues:
- Check this SETUP.md file
- Review README.md
- Check existing GitHub issues
- Create a new issue with details
