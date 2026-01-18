import { MSSQLProvider } from './databaseProviders/mssqlProvider';
import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeProvider } from './treeView/databaseTreeProvider';
import { QueryExecutor } from './queryEditor/queryExecutor';
import { ResultsPanel } from './queryEditor/resultsPanel';
import { SqlCompletionProvider } from './queryEditor/sqlCompletionProvider';
import { SqlCodeLensProvider } from './queryEditor/sqlCodeLensProvider';
import { Logger } from './utils/logger';
import { ConnectionConfig, DatabaseType } from './types';
import { TableTreeItem, CollectionTreeItem, DatabaseTreeItem, ConnectionTreeItem } from './treeView/treeItems';

/**
 * Format SELECT query with proper pagination syntax
 */
function formatSelectQuery(dbType: DatabaseType, database: string, table: string, limit: number = 100, schema: string = 'dbo'): string {
    if (dbType === DatabaseType.MSSQL) {
        // SQL Server requires: database.schema.[table] (escape table with brackets)
        const escapedTable = `[${table}]`;
        return `SELECT TOP ${limit} * FROM ${database}.${schema}.${escapedTable}`;
    } else {
        return `SELECT * FROM ${database}.${table}\nLIMIT ${limit}`;
    }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    Logger.initialize(context);
    Logger.info('DB Connector Extension is now active');

    // Initialize managers
    const connectionManager = ConnectionManager.getInstance(context);
    const treeProvider = new DatabaseTreeProvider(connectionManager);
    const queryExecutor = new QueryExecutor(connectionManager, context);

    // Set connection manager for ResultsPanel (needed for data editing)
    ResultsPanel.setConnectionManager(connectionManager);

    // Register SQL completion provider
    const sqlCompletionProvider = new SqlCompletionProvider(connectionManager);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { language: 'sql' },
            sqlCompletionProvider,
            '.', ' ' // Trigger on dot and space
        )
    );
    // Also register for plain text files that might be SQL
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'untitled' },
            sqlCompletionProvider,
            '.', ' '
        )
    );

    // Register SQL CodeLens provider (Run Query buttons)
    const sqlCodeLensProvider = new SqlCodeLensProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'sql' },
            sqlCodeLensProvider
        )
    );
    // Also for untitled SQL files
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { scheme: 'untitled', language: 'sql' },
            sqlCodeLensProvider
        )
    );

    // Register tree view
    const treeView = vscode.window.createTreeView('dbConnector', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register status bar
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(database) DB: 0';
    statusBarItem.tooltip = 'Database Connections';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Update status bar on connection changes
    connectionManager.onDidChangeConnections(() => {
        const connections = connectionManager.getAllConnections();
        const connectedCount = connections.filter(conn =>
            connectionManager.getProvider(conn.id) !== undefined
        ).length;
        statusBarItem.text = `$(database) DB: ${connectedCount}/${connections.length}`;
    });

    // Register commands
    registerCommands(context, connectionManager, treeProvider, queryExecutor);

    Logger.info('DB Connector Extension activated successfully');
}

/**
 * Register all commands
 */
function registerCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    treeProvider: DatabaseTreeProvider,
    queryExecutor: QueryExecutor
) {
    // Add connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.addConnection', async () => {
            await addConnection(connectionManager);
        })
    );

    // Remove connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.removeConnection', async (item) => {
            await removeConnection(connectionManager, item);
        })
    );

    // Edit connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.editConnection', async (item) => {
            await editConnection(connectionManager, item, treeProvider);
        })
    );

    // Connect to database command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.connectToDatabase', async (item) => {
            await connectToDatabase(connectionManager, item, treeProvider);
        })
    );

    // Disconnect from database command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.disconnectFromDatabase', async (item) => {
            await disconnectFromDatabase(connectionManager, item, treeProvider);
        })
    );

    // Refresh connection command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.refreshConnection', async (item) => {
            treeProvider.refresh(item);
        })
    );

    // Execute query command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.executeQuery', async () => {
            await queryExecutor.executeActiveEditorQuery();
        })
    );

    // Execute query at cursor (from CodeLens)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.executeQueryAtCursor', async (range: vscode.Range) => {
            await queryExecutor.executeQueryAtRange(range);
        })
    );

    // New query command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.newQuery', async (item) => {
            await createNewQuery(connectionManager, item);
        })
    );

    // Select Top 100 command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.selectTop', async (item) => {
            await selectTop(connectionManager, queryExecutor, item);
        })
    );

    // Show query history command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.showQueryHistory', async () => {
            await queryExecutor.showQueryHistory();
        })
    );

    // Export results command (placeholder)
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.exportResults', async () => {
            vscode.window.showInformationMessage('Export results from the results panel');
        })
    );

    // Export connections command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.exportConnections', async () => {
            await exportConnections(connectionManager);
        })
    );

    // Import connections command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.importConnections', async () => {
            await importConnections(connectionManager, treeProvider);
        })
    );

    // Query Templates command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.queryTemplates', async () => {
            await showQueryTemplates(connectionManager);
        })
    );

    // Generate SELECT command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.generateSelect', async (item) => {
            await generateQueryTemplate(connectionManager, item, 'select');
        })
    );

    // Generate INSERT command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.generateInsert', async (item) => {
            await generateQueryTemplate(connectionManager, item, 'insert');
        })
    );

    // Generate UPDATE command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.generateUpdate', async (item) => {
            await generateQueryTemplate(connectionManager, item, 'update');
        })
    );

    // Generate DELETE command
    context.subscriptions.push(
        vscode.commands.registerCommand('dbConnector.generateDelete', async (item) => {
            await generateQueryTemplate(connectionManager, item, 'delete');
        })
    );
}

/**
 * Add a new database connection
 */
async function addConnection(connectionManager: ConnectionManager): Promise<void> {
    try {
        // Select database type
        const dbType = await vscode.window.showQuickPick(
            [
                { label: 'MySQL', value: DatabaseType.MySQL },
                { label: 'PostgreSQL', value: DatabaseType.PostgreSQL },
                { label: 'SQL Server (MSSQL)', value: DatabaseType.MSSQL },
                { label: 'MongoDB', value: DatabaseType.MongoDB },
                { label: 'MariaDB', value: DatabaseType.MariaDB }
            ],
            { placeHolder: 'Select database type' }
        );

        if (!dbType) {
            return;
        }

        // Get connection details
        const name = await vscode.window.showInputBox({
            prompt: 'Connection name',
            placeHolder: 'My Database'
        });
        if (!name) { return; }

        const host = await vscode.window.showInputBox({
            prompt: 'Host',
            placeHolder: 'localhost',
            value: 'localhost'
        });
        if (!host) { return; }

        const portStr = await vscode.window.showInputBox({
            prompt: 'Port',
            placeHolder: getDefaultPort(dbType.value),
            value: getDefaultPort(dbType.value)
        });
        if (!portStr) { return; }

        const username = await vscode.window.showInputBox({
            prompt: 'Username',
            placeHolder: 'root'
        });
        if (!username) { return; }

        const password = await vscode.window.showInputBox({
            prompt: 'Password',
            password: true
        });
        if (password === undefined) { return; }

        const database = await vscode.window.showInputBox({
            prompt: 'Database (optional)',
            placeHolder: 'Leave empty to connect without specific database'
        });

        const config: ConnectionConfig = {
            id: '',
            name,
            type: dbType.value,
            host,
            port: parseInt(portStr),
            username,
            database: database || undefined
        };

        // Test connection
        const testResult = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Testing connection...',
            cancellable: false
        }, async () => {
            return await connectionManager.testConnection(config, password);
        });

        if (!testResult) {
            const retry = await vscode.window.showErrorMessage(
                'Connection test failed. Would you like to save it anyway?',
                'Save Anyway', 'Cancel'
            );
            if (retry !== 'Save Anyway') {
                return;
            }
        } else {
            vscode.window.showInformationMessage('Connection test successful!');
        }

        // Save connection
        await connectionManager.addConnection(config, password);
        vscode.window.showInformationMessage(`Connection '${name}' added successfully`);
    } catch (error) {
        Logger.error('Failed to add connection', error as Error);
        vscode.window.showErrorMessage(`Failed to add connection: ${(error as Error).message}`);
    }
}

/**
 * Remove a database connection
 */
async function removeConnection(connectionManager: ConnectionManager, item: any): Promise<void> {
    try {
        const connectionId = item?.connection?.id;
        if (!connectionId) {
            vscode.window.showErrorMessage('No connection selected');
            return;
        }

        const connection = connectionManager.getConnection(connectionId);
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to remove connection '${connection?.name}'?`,
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            await connectionManager.removeConnection(connectionId);
            vscode.window.showInformationMessage(`Connection '${connection?.name}' removed`);
        }
    } catch (error) {
        Logger.error('Failed to remove connection', error as Error);
        vscode.window.showErrorMessage(`Failed to remove connection: ${(error as Error).message}`);
    }
}

/**
 * Edit a database connection
 */
async function editConnection(
    connectionManager: ConnectionManager,
    item: any,
    treeProvider: DatabaseTreeProvider
): Promise<void> {
    try {
        const connectionId = item?.connection?.id;
        if (!connectionId) {
            vscode.window.showErrorMessage('No connection selected');
            return;
        }

        const existingConfig = connectionManager.getConnection(connectionId);
        if (!existingConfig) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        // Check if connected - warn user
        const isConnected = connectionManager.getProvider(connectionId) !== undefined;
        if (isConnected) {
            const proceed = await vscode.window.showWarningMessage(
                'This connection is currently active. Changes will take effect after reconnecting.',
                'Continue', 'Cancel'
            );
            if (proceed !== 'Continue') {
                return;
            }
        }

        // Edit connection name
        const name = await vscode.window.showInputBox({
            prompt: 'Connection name',
            value: existingConfig.name,
            validateInput: (value) => value ? null : 'Connection name is required'
        });
        if (!name) { return; }

        // Edit host
        const host = await vscode.window.showInputBox({
            prompt: 'Host',
            value: existingConfig.host,
            validateInput: (value) => value ? null : 'Host is required'
        });
        if (!host) { return; }

        // Edit port
        const portStr = await vscode.window.showInputBox({
            prompt: 'Port',
            value: existingConfig.port.toString(),
            validateInput: (value) => {
                const port = parseInt(value);
                if (isNaN(port) || port < 1 || port > 65535) {
                    return 'Please enter a valid port number (1-65535)';
                }
                return null;
            }
        });
        if (!portStr) { return; }

        // Edit username
        const username = await vscode.window.showInputBox({
            prompt: 'Username',
            value: existingConfig.username
        });
        if (username === undefined) { return; }

        // Ask if user wants to change password
        const changePassword = await vscode.window.showQuickPick(
            ['Keep existing password', 'Change password'],
            { placeHolder: 'Password options' }
        );
        if (!changePassword) { return; }

        let newPassword: string | undefined;
        if (changePassword === 'Change password') {
            newPassword = await vscode.window.showInputBox({
                prompt: 'New Password',
                password: true
            });
            if (newPassword === undefined) { return; }
        }

        // Edit database
        const database = await vscode.window.showInputBox({
            prompt: 'Database (optional)',
            value: existingConfig.database || '',
            placeHolder: 'Leave empty to connect without specific database'
        });
        if (database === undefined) { return; }

        // Edit SSL option
        const sslOption = await vscode.window.showQuickPick(
            [
                { label: 'Disable SSL', value: false },
                { label: 'Enable SSL', value: true }
            ],
            { 
                placeHolder: 'SSL Configuration',
                canPickMany: false
            }
        );
        if (!sslOption) { return; }

        // Create updated config
        const updatedConfig = {
            ...existingConfig,
            name,
            host,
            port: parseInt(portStr),
            username: username || '',
            database: database || undefined,
            ssl: sslOption.value
        };

        // Test connection if password changed or host/port changed
        const shouldTest = newPassword !== undefined || 
            host !== existingConfig.host || 
            parseInt(portStr) !== existingConfig.port;

        if (shouldTest) {
            const testPassword = newPassword !== undefined 
                ? newPassword 
                : await connectionManager.getPassword(connectionId) || '';

            const testResult = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Testing connection...',
                cancellable: false
            }, async () => {
                return await connectionManager.testConnection(updatedConfig, testPassword);
            });

            if (!testResult) {
                const retry = await vscode.window.showErrorMessage(
                    'Connection test failed. Would you like to save changes anyway?',
                    'Save Anyway', 'Cancel'
                );
                if (retry !== 'Save Anyway') {
                    return;
                }
            } else {
                vscode.window.showInformationMessage('Connection test successful!');
            }
        }

        // Save updated connection
        await connectionManager.updateConnection(updatedConfig, newPassword);

        // If connected, offer to reconnect
        if (isConnected) {
            const reconnect = await vscode.window.showInformationMessage(
                `Connection '${name}' updated successfully. Reconnect now?`,
                'Reconnect', 'Later'
            );
            if (reconnect === 'Reconnect') {
                await connectionManager.disconnect(connectionId);
                await connectionManager.connect(connectionId);
            }
        } else {
            vscode.window.showInformationMessage(`Connection '${name}' updated successfully`);
        }

        // Refresh tree view
        treeProvider.refresh();

    } catch (error) {
        Logger.error('Failed to edit connection', error as Error);
        vscode.window.showErrorMessage(`Failed to edit connection: ${(error as Error).message}`);
    }
}

/**
 * Connect to a database
 */
async function connectToDatabase(
    connectionManager: ConnectionManager,
    item: any,
    treeProvider: DatabaseTreeProvider
): Promise<void> {
    try {
        const connectionId = item?.connection?.id;
        if (!connectionId) {
            vscode.window.showErrorMessage('No connection selected');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Connecting to database...',
            cancellable: false
        }, async () => {
            await connectionManager.connect(connectionId);
        });

        vscode.window.showInformationMessage('Connected successfully');
        treeProvider.refresh(item);
    } catch (error) {
        Logger.error('Failed to connect to database', error as Error);
        vscode.window.showErrorMessage(`Failed to connect: ${(error as Error).message}`);
    }
}

/**
 * Disconnect from a database
 */
async function disconnectFromDatabase(
    connectionManager: ConnectionManager,
    item: any,
    treeProvider: DatabaseTreeProvider
): Promise<void> {
    try {
        const connectionId = item?.connection?.id;
        if (!connectionId) {
            vscode.window.showErrorMessage('No connection selected');
            return;
        }

        await connectionManager.disconnect(connectionId);
        vscode.window.showInformationMessage('Disconnected successfully');
        treeProvider.refresh(item);
    } catch (error) {
        Logger.error('Failed to disconnect from database', error as Error);
        vscode.window.showErrorMessage(`Failed to disconnect: ${(error as Error).message}`);
    }
}

/**
 * Create a new query file
 */
async function createNewQuery(connectionManager: ConnectionManager, item: any): Promise<void> {
    let content = '';
    let language = 'sql';
    
    // Determine the connection and database from the tree item
    if (item instanceof TableTreeItem) {
        const connection = connectionManager.getConnection(item.connectionId);
        const dbName = item.databaseName;
        let tableName = item.tableName;
        if (connection?.type === DatabaseType.MSSQL) {
            tableName = `[${tableName}]`;
        }
        const query = connection?.type ? formatSelectQuery(connection.type, dbName, tableName, 100) : `SELECT * FROM ${dbName}.${tableName}\nLIMIT 100`;
        content = `-- Connection: ${connection?.name || 'Unknown'}\n-- Database: ${dbName}\n\n${query};`;
    } else if (item instanceof CollectionTreeItem) {
        const connection = connectionManager.getConnection(item.connectionId);
        const dbName = item.databaseName;
        const collectionName = item.collectionName;
        language = 'javascript';
        content = `// Connection: ${connection?.name || 'Unknown'}\n// Database: ${dbName}\n\ndb.${collectionName}.find({}).limit(100);`;
    } else if (item instanceof DatabaseTreeItem) {
        const connection = connectionManager.getConnection(item.connectionId);
        if (connection?.type === DatabaseType.MongoDB) {
            language = 'javascript';
            content = `// Connection: ${connection?.name || 'Unknown'}\n// Database: ${item.databaseName}\n\ndb.getCollectionNames();`;
        } else {
            const schema = 'dbo';
            const tablePrefix = connection?.type === DatabaseType.MSSQL ? `${item.databaseName}.${schema}.` : `${item.databaseName}.`;
            content = `-- Connection: ${connection?.name || 'Unknown'}\n-- Database: ${item.databaseName}\n\nSELECT ${connection?.type === DatabaseType.MSSQL ? 'TOP 100 ' : ''}* FROM ${tablePrefix}\n${connection?.type === DatabaseType.MSSQL ? '' : 'LIMIT 100;'}`;
        }
    } else if (item instanceof ConnectionTreeItem) {
        const connection = item.connection;
        if (connection?.type === DatabaseType.MongoDB) {
            language = 'javascript';
            content = `// Connection: ${connection?.name || 'Unknown'}\n\nshow dbs;`;
        } else {
            content = `-- Connection: ${connection?.name || 'Unknown'}\n\nSHOW DATABASES;`;
        }
    }
    
    const doc = await vscode.workspace.openTextDocument({
        content,
        language
    });
    await vscode.window.showTextDocument(doc);
}

/**
 * Select Top 100 rows from a table
 */
async function selectTop(connectionManager: ConnectionManager, queryExecutor: QueryExecutor, item: any): Promise<void> {
    try {
        let connectionId: string;
        let query: string;
        let database: string | undefined;
        
        if (item instanceof TableTreeItem) {
            connectionId = item.connectionId;
            database = item.databaseName;
            const tableName = item.tableName;
            const connection = connectionManager.getConnection(connectionId);
            query = connection?.type ? formatSelectQuery(connection.type, database, tableName, 100) : `SELECT * FROM ${database}.${tableName} LIMIT 100`;
        } else if (item instanceof CollectionTreeItem) {
            connectionId = item.connectionId;
            database = item.databaseName;
            const collectionName = item.collectionName;
            query = `db.${collectionName}.find({}).limit(100)`;
        } else {
            vscode.window.showWarningMessage('Please select a table or collection');
            return;
        }
        
        // Check if connected
        const provider = connectionManager.getProvider(connectionId);
        if (!provider) {
            // Try to connect first
            await connectionManager.connect(connectionId);
        }
        
        await queryExecutor.executeQuery(connectionId, query, database);
        
    } catch (error) {
        Logger.error('Failed to execute Select Top', error as Error);
        vscode.window.showErrorMessage(`Failed to execute: ${(error as Error).message}`);
    }
}

/**
 * Get default port for database type
 */
function getDefaultPort(type: DatabaseType): string {
    switch (type) {
        case DatabaseType.MySQL:
        case DatabaseType.MariaDB:
            return '3306';
        case DatabaseType.PostgreSQL:
            return '5432';
        case DatabaseType.MSSQL:
            return '1433';
        case DatabaseType.MongoDB:
            return '27017';
        default:
            return '3306';
    }
}

/**
 * Export format for connections (without sensitive data)
 */
interface ExportedConnection {
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    username: string;
    database?: string;
    ssl?: boolean;
    options?: Record<string, any>;
}

interface ConnectionsExport {
    version: string;
    exportDate: string;
    connections: ExportedConnection[];
}

/**
 * Export connections to a JSON file
 */
async function exportConnections(connectionManager: ConnectionManager): Promise<void> {
    try {
        const connections = connectionManager.getAllConnections();

        if (connections.length === 0) {
            vscode.window.showWarningMessage('No connections to export');
            return;
        }

        // Ask user what to export
        const exportOption = await vscode.window.showQuickPick(
            [
                { label: 'Export All Connections', value: 'all' },
                { label: 'Select Connections to Export', value: 'select' }
            ],
            { placeHolder: 'Choose export option' }
        );

        if (!exportOption) { return; }

        let connectionsToExport: ConnectionConfig[] = connections;

        if (exportOption.value === 'select') {
            const selected = await vscode.window.showQuickPick(
                connections.map(conn => ({
                    label: conn.name,
                    description: `${conn.type} - ${conn.host}:${conn.port}`,
                    picked: true,
                    connection: conn
                })),
                {
                    placeHolder: 'Select connections to export',
                    canPickMany: true
                }
            );

            if (!selected || selected.length === 0) {
                return;
            }

            connectionsToExport = selected.map(s => s.connection);
        }

        // Ask about including passwords
        const includePasswords = await vscode.window.showQuickPick(
            [
                { label: 'No - Export without passwords (recommended)', value: false },
                { label: 'Yes - Include passwords (less secure)', value: true }
            ],
            { placeHolder: 'Include passwords in export?' }
        );

        if (!includePasswords) { return; }

        // Prepare export data
        const exportData: ConnectionsExport = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            connections: []
        };

        for (const conn of connectionsToExport) {
            const exportedConn: ExportedConnection & { password?: string } = {
                name: conn.name,
                type: conn.type,
                host: conn.host,
                port: conn.port,
                username: conn.username,
                database: conn.database,
                ssl: conn.ssl,
                options: conn.options
            };

            if (includePasswords.value) {
                const password = await connectionManager.getPassword(conn.id);
                if (password) {
                    exportedConn.password = password;
                }
            }

            exportData.connections.push(exportedConn);
        }

        // Show save dialog
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`db-connections-${new Date().toISOString().split('T')[0]}.json`),
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*']
            },
            saveLabel: 'Export Connections'
        });

        if (!uri) { return; }

        // Write file
        const content = JSON.stringify(exportData, null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

        vscode.window.showInformationMessage(
            `Successfully exported ${connectionsToExport.length} connection(s) to ${uri.fsPath}`
        );

        Logger.info(`Exported ${connectionsToExport.length} connections to ${uri.fsPath}`);

    } catch (error) {
        Logger.error('Failed to export connections', error as Error);
        vscode.window.showErrorMessage(`Failed to export connections: ${(error as Error).message}`);
    }
}

/**
 * Import connections from a JSON file
 */
async function importConnections(
    connectionManager: ConnectionManager,
    treeProvider: DatabaseTreeProvider
): Promise<void> {
    try {
        // Show open dialog
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'JSON Files': ['json'],
                'All Files': ['*']
            },
            openLabel: 'Import Connections'
        });

        if (!uris || uris.length === 0) { return; }

        // Read file
        const fileContent = await vscode.workspace.fs.readFile(uris[0]);
        const content = Buffer.from(fileContent).toString('utf8');

        let importData: ConnectionsExport;
        try {
            importData = JSON.parse(content);
        } catch {
            vscode.window.showErrorMessage('Invalid JSON file. Please select a valid connections export file.');
            return;
        }

        // Validate structure
        if (!importData.connections || !Array.isArray(importData.connections)) {
            vscode.window.showErrorMessage('Invalid export file format. Missing connections array.');
            return;
        }

        if (importData.connections.length === 0) {
            vscode.window.showWarningMessage('No connections found in the export file.');
            return;
        }

        // Show import preview
        const preview = await vscode.window.showQuickPick(
            importData.connections.map((conn, index) => ({
                label: conn.name,
                description: `${conn.type} - ${conn.host}:${conn.port}`,
                detail: conn.database ? `Database: ${conn.database}` : 'No default database',
                picked: true,
                index
            })),
            {
                placeHolder: `Select connections to import (${importData.connections.length} found)`,
                canPickMany: true
            }
        );

        if (!preview || preview.length === 0) { return; }

        // Import selected connections
        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const item of preview) {
            const conn = importData.connections[item.index] as ExportedConnection & { password?: string };

            try {
                // Check for duplicate names
                const existingConnections = connectionManager.getAllConnections();
                const duplicate = existingConnections.find(c => c.name === conn.name);

                let finalName = conn.name;
                if (duplicate) {
                    const action = await vscode.window.showQuickPick(
                        [
                            { label: 'Rename', value: 'rename', description: 'Import with a new name' },
                            { label: 'Skip', value: 'skip', description: 'Do not import this connection' },
                            { label: 'Replace', value: 'replace', description: 'Replace existing connection' }
                        ],
                        { placeHolder: `Connection "${conn.name}" already exists` }
                    );

                    if (!action || action.value === 'skip') {
                        skipped++;
                        continue;
                    }

                    if (action.value === 'rename') {
                        const newName = await vscode.window.showInputBox({
                            prompt: 'Enter new name for the connection',
                            value: `${conn.name} (imported)`,
                            validateInput: (value) => {
                                if (!value) { return 'Name is required'; }
                                if (existingConnections.find(c => c.name === value)) {
                                    return 'A connection with this name already exists';
                                }
                                return null;
                            }
                        });

                        if (!newName) {
                            skipped++;
                            continue;
                        }
                        finalName = newName;
                    } else if (action.value === 'replace') {
                        await connectionManager.removeConnection(duplicate.id);
                    }
                }

                // Get password if not included in export
                let password = conn.password || '';
                if (!password) {
                    const inputPassword = await vscode.window.showInputBox({
                        prompt: `Enter password for "${finalName}" (${conn.username}@${conn.host})`,
                        password: true,
                        placeHolder: 'Leave empty if no password required'
                    });

                    if (inputPassword === undefined) {
                        skipped++;
                        continue;
                    }
                    password = inputPassword;
                }

                // Create connection config
                const config: ConnectionConfig = {
                    id: '',
                    name: finalName,
                    type: conn.type,
                    host: conn.host,
                    port: conn.port,
                    username: conn.username,
                    database: conn.database,
                    ssl: conn.ssl,
                    options: conn.options
                };

                await connectionManager.addConnection(config, password);
                imported++;

            } catch (err) {
                errors.push(`${conn.name}: ${(err as Error).message}`);
            }
        }

        // Refresh tree
        treeProvider.refresh();

        // Show results
        let message = `Import complete: ${imported} imported`;
        if (skipped > 0) {
            message += `, ${skipped} skipped`;
        }
        if (errors.length > 0) {
            message += `, ${errors.length} failed`;
            Logger.error('Import errors', new Error(errors.join('; ')));
        }

        vscode.window.showInformationMessage(message);
        Logger.info(`Import complete: ${imported} imported, ${skipped} skipped, ${errors.length} errors`);

    } catch (error) {
        Logger.error('Failed to import connections', error as Error);
        vscode.window.showErrorMessage(`Failed to import connections: ${(error as Error).message}`);
    }
}

/**
 * Query template types
 */
type TemplateType = 'select' | 'insert' | 'update' | 'delete' | 'count' | 'distinct' | 'join' | 'create' | 'alter' | 'drop';

interface QueryTemplate {
    label: string;
    description: string;
    template: string;
    requiresTable?: boolean;
    sqlOnly?: boolean;
    mongoTemplate?: string;
}

/**
 * Available query templates
 */
const QUERY_TEMPLATES: Record<TemplateType, QueryTemplate> = {
    select: {
        label: '$(search) SELECT',
        description: 'Select all columns from a table',
        template: 'SELECT {limit}*\nFROM {database}.{table}\nWHERE 1=1{bottomLimit};',
        mongoTemplate: 'db.{collection}.find({}).limit(100);',
        requiresTable: true
    },
    insert: {
        label: '$(add) INSERT',
        description: 'Insert a new row',
        template: 'INSERT INTO {database}.{table} ({columns})\nVALUES ({values});',
        mongoTemplate: 'db.{collection}.insertOne({\n  {fields}\n});',
        requiresTable: true,
        sqlOnly: false
    },
    update: {
        label: '$(edit) UPDATE',
        description: 'Update existing rows',
        template: 'UPDATE {database}.{table}\nSET {column} = {value}\nWHERE {condition};',
        mongoTemplate: 'db.{collection}.updateMany(\n  { /* filter */ },\n  { $set: { /* fields */ } }\n);',
        requiresTable: true
    },
    delete: {
        label: '$(trash) DELETE',
        description: 'Delete rows from a table',
        template: 'DELETE FROM {database}.{table}\nWHERE {condition};',
        mongoTemplate: 'db.{collection}.deleteMany({ /* filter */ });',
        requiresTable: true
    },
    count: {
        label: '$(symbol-number) COUNT',
        description: 'Count rows in a table',
        template: 'SELECT COUNT(*) AS total\nFROM {database}.{table}\nWHERE 1=1;',
        mongoTemplate: 'db.{collection}.countDocuments({});',
        requiresTable: true
    },
    distinct: {
        label: '$(filter) DISTINCT',
        description: 'Select distinct values',
        template: 'SELECT DISTINCT {column}\nFROM {database}.{table}\nORDER BY {column};',
        mongoTemplate: 'db.{collection}.distinct("{field}");',
        requiresTable: true
    },
    join: {
        label: '$(git-merge) JOIN',
        description: 'Join two tables',
        template: 'SELECT {limit}t1.*, t2.*\nFROM {database}.{table} t1\nINNER JOIN {database}.{table2} t2\n  ON t1.{column} = t2.{column}{bottomLimit};',
        requiresTable: true,
        sqlOnly: true
    },
    create: {
        label: '$(new-file) CREATE TABLE',
        description: 'Create a new table',
        template: 'CREATE TABLE {database}.{tableName} (\n  id INT PRIMARY KEY {autoIncrement},\n  name VARCHAR(255) NOT NULL,\n  created_at {timestamp} DEFAULT {currentTimestamp}\n);',
        sqlOnly: true
    },
    alter: {
        label: '$(tools) ALTER TABLE',
        description: 'Modify table structure',
        template: 'ALTER TABLE {database}.{table}\nADD COLUMN {columnName} {dataType};',
        requiresTable: true,
        sqlOnly: true
    },
    drop: {
        label: '$(warning) DROP TABLE',
        description: 'Drop a table (dangerous!)',
        template: '-- WARNING: This will permanently delete the table!\nDROP TABLE IF EXISTS {database}.{table};',
        mongoTemplate: 'db.{collection}.drop();',
        requiresTable: true
    }
};

/**
 * Show query templates picker
 */
async function showQueryTemplates(connectionManager: ConnectionManager): Promise<void> {
    try {
        // Get connected connections
        const connections = connectionManager.getAllConnections();
        const connectedConnections = connections.filter(conn =>
            connectionManager.getProvider(conn.id) !== undefined
        );

        if (connectedConnections.length === 0) {
            vscode.window.showWarningMessage('No active connections. Please connect to a database first.');
            return;
        }

        // Select connection
        const selectedConn = await vscode.window.showQuickPick(
            connectedConnections.map(conn => ({
                label: conn.name,
                description: `${conn.type} - ${conn.host}:${conn.port}`,
                connection: conn
            })),
            { placeHolder: 'Select a connection' }
        );

        if (!selectedConn) { return; }

        const isMongo = selectedConn.connection.type === DatabaseType.MongoDB;

        // Filter templates based on database type
        const availableTemplates = Object.entries(QUERY_TEMPLATES)
            .filter(([_, template]) => !template.sqlOnly || !isMongo)
            .map(([key, template]) => ({
                label: template.label,
                description: template.description,
                key: key as TemplateType
            }));

        // Select template
        const selectedTemplate = await vscode.window.showQuickPick(availableTemplates, {
            placeHolder: 'Select a query template'
        });

        if (!selectedTemplate) { return; }

        const template = QUERY_TEMPLATES[selectedTemplate.key];

        // If template requires a table, ask for it
        let database = selectedConn.connection.database || '';
        let table = '';
        let columns: string[] = [];

        if (template.requiresTable) {
            const provider = connectionManager.getProvider(selectedConn.connection.id);
            if (!provider) { return; }

            // Get databases
            const databases = await provider.getDatabases();
            
            // Select database
            const selectedDb = await vscode.window.showQuickPick(
                databases.map(db => ({ label: db.name })),
                { placeHolder: 'Select a database' }
            );

            if (!selectedDb) { return; }
            database = selectedDb.label;

            // Get tables/collections
            if (isMongo) {
                const dbInfo = databases.find(d => d.name === database);
                if (dbInfo?.collections) {
                    const selectedColl = await vscode.window.showQuickPick(
                        dbInfo.collections.map(c => ({ label: c.name })),
                        { placeHolder: 'Select a collection' }
                    );
                    if (!selectedColl) { return; }
                    table = selectedColl.label;
                }
            } else {
                const tables = provider instanceof MSSQLProvider ? await provider.getTables() : await provider.getTables(database);
                const selectedTable = await vscode.window.showQuickPick(
                    tables.map(t => ({ label: t.name })),
                    { placeHolder: 'Select a table' }
                );
                if (!selectedTable) { return; }
                table = selectedTable.label;

                // Get columns for INSERT/UPDATE templates
                if (['insert', 'update', 'distinct'].includes(selectedTemplate.key)) {
                    columns = (provider instanceof MSSQLProvider ? await provider.getColumns(table) : await provider.getColumns(database, table)).map(c => c.name);
                }
            }
        }

        // Generate query from template
        const query = generateQueryFromTemplate(
            isMongo ? (template.mongoTemplate || template.template) : template.template,
            database,
            table,
            columns,
            isMongo,
            selectedConn.connection.type
        );

        // Open new document with the query
        const doc = await vscode.workspace.openTextDocument({
            content: query,
            language: isMongo ? 'javascript' : 'sql'
        });
        await vscode.window.showTextDocument(doc);

    } catch (error) {
        Logger.error('Failed to show query templates', error as Error);
        vscode.window.showErrorMessage(`Failed to show templates: ${(error as Error).message}`);
    }
}

/**
 * Generate query from a table context (right-click menu)
 */
async function generateQueryTemplate(
    connectionManager: ConnectionManager,
    item: any,
    templateType: TemplateType
): Promise<void> {
    try {
        let connectionId: string;
        let database: string;
        let tableName: string;
        let isMongo = false;

        if (item instanceof TableTreeItem) {
            connectionId = item.connectionId;
            database = item.databaseName;
            tableName = item.tableName;
        } else if (item instanceof CollectionTreeItem) {
            connectionId = item.connectionId;
            database = item.databaseName;
            tableName = item.collectionName;
            isMongo = true;
        } else {
            vscode.window.showWarningMessage('Please select a table or collection');
            return;
        }

        const connection = connectionManager.getConnection(connectionId);
        if (!connection) {
            vscode.window.showErrorMessage('Connection not found');
            return;
        }

        isMongo = connection.type === DatabaseType.MongoDB;
        const template = QUERY_TEMPLATES[templateType];

        if (template.sqlOnly && isMongo) {
            vscode.window.showWarningMessage('This template is not available for MongoDB');
            return;
        }

        // Get columns if needed
        let columns: string[] = [];
        if (['insert', 'update', 'distinct'].includes(templateType) && !isMongo) {
            const provider = connectionManager.getProvider(connectionId);
            if (provider) {
                columns = (provider instanceof MSSQLProvider ? await provider.getColumns(tableName) : await provider.getColumns(database, tableName)).map(c => c.name);
            }
        }

        // Generate query
        const templateStr = isMongo ? (template.mongoTemplate || template.template) : template.template;
        const query = generateQueryFromTemplate(templateStr, database, tableName, columns, isMongo, connection.type);

        // Open new document with the query
        const doc = await vscode.workspace.openTextDocument({
            content: `-- Connection: ${connection.name}\n-- Database: ${database}\n-- Table: ${tableName}\n\n${query}`,
            language: isMongo ? 'javascript' : 'sql'
        });
        await vscode.window.showTextDocument(doc);

    } catch (error) {
        Logger.error('Failed to generate query template', error as Error);
        vscode.window.showErrorMessage(`Failed to generate template: ${(error as Error).message}`);
    }
}

/**
 * Generate query string from template
 */
function generateQueryFromTemplate(
    template: string,
    database: string,
    table: string,
    columns: string[],
    _isMongo: boolean,
    dbType?: DatabaseType
): string {
    // Determine limit syntax based on database type
    const limitPrefix = dbType === DatabaseType.MSSQL ? 'TOP 100 ' : '';
    const limitSuffix = (dbType === DatabaseType.MSSQL || _isMongo) ? '' : '\nLIMIT 100';
    
    // For MSSQL, use database.schema.table format and escape with brackets
    const schema = 'dbo';
    
    // Escape table name for MSSQL (use brackets) or other DBs (no escaping by default)
    const escapedTable = dbType === DatabaseType.MSSQL ? `[${table}]` : table;
    const tableReference = dbType === DatabaseType.MSSQL 
        ? `${database}.${schema}.${escapedTable}` 
        : `${database}.${table}`;
    
    let query = template
        .replace(/{database}\.{table}/g, tableReference)
        .replace(/{database}/g, database)
        .replace(/{table}/g, escapedTable)
        .replace(/{collection}/g, table)
        .replace(/{tableName}/g, 'new_table')
        .replace(/{table2}/g, 'other_table')
        .replace(/{condition}/g, 'id = 1')
        .replace(/{columnName}/g, 'new_column')
        .replace(/{dataType}/g, 'VARCHAR(255)')
        .replace(/{autoIncrement}/g, dbType === DatabaseType.MSSQL ? 'IDENTITY(1,1)' : 'AUTO_INCREMENT')
        .replace(/{timestamp}/g, dbType === DatabaseType.MSSQL ? 'DATETIME' : 'TIMESTAMP')
        .replace(/{currentTimestamp}/g, dbType === DatabaseType.MSSQL ? 'GETDATE()' : 'CURRENT_TIMESTAMP')
        .replace(/{limit}/g, limitPrefix)
        .replace(/{bottomLimit}/g, limitSuffix);

    if (columns.length > 0) {
        // Escape column names for MSSQL
        const escapedColumns = dbType === DatabaseType.MSSQL 
            ? columns.map(c => `[${c}]`)
            : columns;
        
        query = query
            .replace(/{columns}/g, escapedColumns.join(', '))
            .replace(/{values}/g, columns.map(() => '?').join(', '))
            .replace(/{column}/g, escapedColumns[0] || 'column_name')
            .replace(/{value}/g, "'new_value'")
            .replace(/{field}/g, columns[0] || 'field_name')
            .replace(/{fields}/g, columns.slice(0, 3).map(c => `${c}: "value"`).join(',\n  '));
    } else {
        query = query
            .replace(/{columns}/g, 'column1, column2')
            .replace(/{values}/g, "'value1', 'value2'")
            .replace(/{column}/g, 'column_name')
            .replace(/{value}/g, "'new_value'")
            .replace(/{field}/g, 'field_name')
            .replace(/{fields}/g, 'field1: "value1",\n  field2: "value2"');
    }

    return query;
}

/**
 * Extension deactivation
 */
export function deactivate() {
    Logger.info('DB Connector Extension is being deactivated');
}
