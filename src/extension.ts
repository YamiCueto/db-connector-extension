import * as vscode from 'vscode';
import { ConnectionManager } from './connectionManager';
import { DatabaseTreeProvider } from './treeView/databaseTreeProvider';
import { QueryExecutor } from './queryEditor/queryExecutor';
import { Logger } from './utils/logger';
import { ConnectionConfig, DatabaseType } from './types';
import { TableTreeItem, CollectionTreeItem, DatabaseTreeItem, ConnectionTreeItem } from './treeView/treeItems';

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
            await editConnection(connectionManager, item);
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
async function editConnection(_connectionManager: ConnectionManager, _item: any): Promise<void> {
    vscode.window.showInformationMessage('Edit connection feature coming soon!');
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
        const tableName = item.tableName;
        content = `-- Connection: ${connection?.name || 'Unknown'}\n-- Database: ${dbName}\n\nSELECT * FROM ${dbName}.${tableName}\nLIMIT 100;`;
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
            content = `-- Connection: ${connection?.name || 'Unknown'}\n-- Database: ${item.databaseName}\n\nSELECT * FROM ${item.databaseName}.\nLIMIT 100;`;
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
            query = `SELECT * FROM ${database}.${tableName} LIMIT 100`;
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
 * Extension deactivation
 */
export function deactivate() {
    Logger.info('DB Connector Extension is being deactivated');
}
