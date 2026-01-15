import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { QueryResult, QueryHistoryEntry, DatabaseType, ConnectionState } from '../types';
import { Logger } from '../utils/logger';
import { ResultsPanel } from './resultsPanel';

/**
 * Multi-query result with query text
 */
export interface MultiQueryResult {
    query: string;
    result: QueryResult;
}

/**
 * Query executor for running database queries
 */
export class QueryExecutor {
    private queryHistory: QueryHistoryEntry[] = [];
    private maxHistorySize: number = 100;

    constructor(
        private connectionManager: ConnectionManager,
        private context: vscode.ExtensionContext
    ) {
        this.loadQueryHistory();
        this.maxHistorySize = vscode.workspace.getConfiguration('dbConnector').get('maxQueryHistorySize', 100);
    }

    /**
     * Execute a query from the active editor
     */
    public async executeActiveEditorQuery(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        // Get full document text to check for connection header
        const fullText = editor.document.getText();
        
        // Get selected text or entire document for query
        const query = editor.selection.isEmpty
            ? fullText
            : editor.document.getText(editor.selection);

        if (!query.trim()) {
            vscode.window.showWarningMessage('No query to execute');
            return;
        }

        // Try to detect connection from file header comments
        const detectedConnection = this.detectConnectionFromHeader(fullText);
        const detectedDatabase = this.detectDatabaseFromHeader(fullText);

        // Get all connections
        const connections = this.connectionManager.getAllConnections();
        Logger.debug(`Found ${connections.length} total connections`);
        
        if (connections.length === 0) {
            vscode.window.showWarningMessage('No database connections available. Please add a connection first.');
            return;
        }

        // Filter only truly connected connections (check state, not just provider existence)
        const connectedConnections = connections.filter(conn => {
            const state = this.connectionManager.getConnectionState(conn.id);
            return state === ConnectionState.Connected;
        });

        Logger.debug(`Found ${connectedConnections.length} active connections`);

        if (connectedConnections.length === 0) {
            vscode.window.showWarningMessage('No active connections. Please connect to a database first.');
            return;
        }

        let selectedConnection: typeof connections[0] | undefined;
        let database: string | undefined = detectedDatabase;

        // If connection detected from header, try to find it
        if (detectedConnection) {
            selectedConnection = connectedConnections.find(
                conn => conn.name.toLowerCase() === detectedConnection.toLowerCase()
            );
            
            if (selectedConnection) {
                Logger.info(`Auto-detected connection: ${selectedConnection.name}`);
            } else {
                Logger.warn(`Connection "${detectedConnection}" not found or not connected`);
            }
        }

        // If no connection detected or not found, ask user to select
        if (!selectedConnection) {
            // If only one connection, use it directly
            if (connectedConnections.length === 1) {
                selectedConnection = connectedConnections[0];
                Logger.info(`Using only available connection: ${selectedConnection.name}`);
            } else {
                const selected = await vscode.window.showQuickPick(
                    connectedConnections.map(conn => ({
                        label: conn.name,
                        description: `${conn.type} - ${conn.host}:${conn.port}`,
                        connection: conn
                    })),
                    { placeHolder: 'Select a connection to execute the query' }
                );

                if (!selected) {
                    return;
                }
                selectedConnection = selected.connection;
            }
        }

        await this.executeQuery(selectedConnection.id, query, database);
    }

    /**
     * Execute a query at a specific range (from CodeLens)
     */
    public async executeQueryAtRange(range: vscode.Range): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found');
            return;
        }

        // Get the query text from the range
        const query = editor.document.getText(range);
        
        if (!query.trim()) {
            vscode.window.showWarningMessage('No query to execute');
            return;
        }

        // Get full document text to detect connection
        const fullText = editor.document.getText();
        const detectedConnection = this.detectConnectionFromHeader(fullText);
        const detectedDatabase = this.detectDatabaseFromHeader(fullText);

        // Get all connections
        const connections = this.connectionManager.getAllConnections();
        
        if (connections.length === 0) {
            vscode.window.showWarningMessage('No database connections available. Please add a connection first.');
            return;
        }

        // Filter only connected connections
        const connectedConnections = connections.filter(conn => {
            const state = this.connectionManager.getConnectionState(conn.id);
            return state === ConnectionState.Connected;
        });

        if (connectedConnections.length === 0) {
            vscode.window.showWarningMessage('No active connections. Please connect to a database first.');
            return;
        }

        let selectedConnection: typeof connections[0] | undefined;
        let database: string | undefined = detectedDatabase;

        // Try to find detected connection
        if (detectedConnection) {
            selectedConnection = connectedConnections.find(
                conn => conn.name.toLowerCase() === detectedConnection.toLowerCase()
            );
            if (selectedConnection) {
                Logger.info(`Auto-detected connection: ${selectedConnection.name}`);
            }
        }

        // If no connection detected, use single or ask
        if (!selectedConnection) {
            if (connectedConnections.length === 1) {
                selectedConnection = connectedConnections[0];
            } else {
                const selected = await vscode.window.showQuickPick(
                    connectedConnections.map(conn => ({
                        label: conn.name,
                        description: `${conn.type} - ${conn.host}:${conn.port}`,
                        connection: conn
                    })),
                    { placeHolder: 'Select a connection to execute the query' }
                );
                if (!selected) {
                    return;
                }
                selectedConnection = selected.connection;
            }
        }

        // Highlight the query being executed
        editor.selection = new vscode.Selection(range.start, range.end);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        await this.executeQuery(selectedConnection.id, query, database);
    }

    /**
     * Detect connection name from file header comments
     * Looks for: -- Connection: ConnectionName
     */
    private detectConnectionFromHeader(text: string): string | undefined {
        const match = text.match(/^--\s*Connection:\s*(.+?)$/im);
        return match ? match[1].trim() : undefined;
    }

    /**
     * Detect database name from file header comments
     * Looks for: -- Database: DatabaseName
     */
    private detectDatabaseFromHeader(text: string): string | undefined {
        const match = text.match(/^--\s*Database:\s*(.+?)$/im);
        return match ? match[1].trim() : undefined;
    }

    /**
     * Split SQL query into multiple statements
     */
    private splitQueries(query: string, dbType: DatabaseType): string[] {
        // For MongoDB, don't split - it uses JavaScript syntax
        if (dbType === DatabaseType.MongoDB) {
            return [query.trim()];
        }

        // Split by semicolon, handling strings and comments
        const queries: string[] = [];
        let currentQuery = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inLineComment = false;
        let inBlockComment = false;

        for (let i = 0; i < query.length; i++) {
            const char = query[i];
            const nextChar = query[i + 1];

            // Handle line comments
            if (!inSingleQuote && !inDoubleQuote && !inBlockComment) {
                if (char === '-' && nextChar === '-') {
                    inLineComment = true;
                }
                if (char === '\n' && inLineComment) {
                    inLineComment = false;
                }
            }

            // Handle block comments
            if (!inSingleQuote && !inDoubleQuote && !inLineComment) {
                if (char === '/' && nextChar === '*') {
                    inBlockComment = true;
                }
                if (char === '*' && nextChar === '/') {
                    inBlockComment = false;
                    currentQuery += '*/';
                    i++;
                    continue;
                }
            }

            // Handle quotes
            if (!inLineComment && !inBlockComment) {
                if (char === "'" && !inDoubleQuote) {
                    inSingleQuote = !inSingleQuote;
                }
                if (char === '"' && !inSingleQuote) {
                    inDoubleQuote = !inDoubleQuote;
                }
            }

            // Split on semicolon if not inside quotes or comments
            if (char === ';' && !inSingleQuote && !inDoubleQuote && !inLineComment && !inBlockComment) {
                const trimmed = currentQuery.trim();
                if (trimmed) {
                    queries.push(trimmed);
                }
                currentQuery = '';
            } else {
                currentQuery += char;
            }
        }

        // Add last query if not empty
        const trimmed = currentQuery.trim();
        if (trimmed) {
            queries.push(trimmed);
        }

        return queries;
    }

    /**
     * Execute a query on a specific connection
     */
    public async executeQuery(connectionId: string, query: string, database?: string): Promise<void> {
        const provider = this.connectionManager.getProvider(connectionId);
        if (!provider) {
            vscode.window.showErrorMessage('Connection not found or not connected');
            return;
        }

        const connection = this.connectionManager.getConnection(connectionId);
        if (!connection) {
            vscode.window.showErrorMessage('Connection configuration not found');
            return;
        }

        // Split into multiple queries
        const queries = this.splitQueries(query, connection.type);

        if (queries.length === 0) {
            vscode.window.showWarningMessage('No valid queries to execute');
            return;
        }

        try {
            // Single query - use simple execution
            if (queries.length === 1) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Executing query...',
                    cancellable: false
                }, async () => {
                    const result = await provider.executeQuery(queries[0], database);

                    // Add to history
                    this.addToHistory(connectionId, queries[0], result);

                    // Show results with connection info for editing
                    ResultsPanel.show(this.context, result, queries[0], connectionId, database);

                    if (result.error) {
                        vscode.window.showErrorMessage(`Query failed: ${result.error}`);
                    } else {
                        const message = result.rows
                            ? `Query executed successfully. ${result.rowCount} rows returned in ${result.executionTime}ms.`
                            : `Query executed successfully. ${result.rowCount} rows affected in ${result.executionTime}ms.`;
                        vscode.window.showInformationMessage(message);
                    }
                });
                return;
            }

            // Multiple queries - execute sequentially and show combined results
            const results: MultiQueryResult[] = [];
            let hasError = false;
            let totalTime = 0;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Executing ${queries.length} queries...`,
                cancellable: true
            }, async (progress, token) => {
                for (let i = 0; i < queries.length; i++) {
                    if (token.isCancellationRequested) {
                        vscode.window.showWarningMessage(`Execution cancelled after ${i} queries`);
                        break;
                    }

                    progress.report({
                        message: `Query ${i + 1} of ${queries.length}`,
                        increment: (100 / queries.length)
                    });

                    const q = queries[i];
                    try {
                        const result = await provider.executeQuery(q, database);
                        results.push({ query: q, result });
                        totalTime += result.executionTime;

                        // Add each query to history
                        this.addToHistory(connectionId, q, result);

                        if (result.error) {
                            hasError = true;
                        }
                    } catch (error) {
                        const errorResult: QueryResult = {
                            rowCount: 0,
                            executionTime: 0,
                            error: (error as Error).message
                        };
                        results.push({ query: q, result: errorResult });
                        hasError = true;
                        this.addToHistory(connectionId, q, errorResult);
                    }
                }
            });

            // Show combined results
            ResultsPanel.showMultiple(this.context, results);

            // Summary message
            const successCount = results.filter(r => !r.result.error).length;
            const errorCount = results.filter(r => r.result.error).length;

            if (hasError) {
                vscode.window.showWarningMessage(
                    `Executed ${results.length} queries: ${successCount} successful, ${errorCount} failed. Total time: ${totalTime}ms`
                );
            } else {
                vscode.window.showInformationMessage(
                    `All ${results.length} queries executed successfully in ${totalTime}ms`
                );
            }

        } catch (error) {
            Logger.error('Query execution failed', error as Error);
            vscode.window.showErrorMessage(`Query execution failed: ${(error as Error).message}`);
        }
    }

    /**
     * Show query history
     */
    public async showQueryHistory(): Promise<void> {
        if (this.queryHistory.length === 0) {
            vscode.window.showInformationMessage('No query history available');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            this.queryHistory.slice().reverse().map(entry => {
                const connection = this.connectionManager.getConnection(entry.connectionId);
                const statusIcon = entry.success ? '✓' : '✗';
                return {
                    label: `${statusIcon} ${entry.query.substring(0, 60)}${entry.query.length > 60 ? '...' : ''}`,
                    description: `${connection?.name || 'Unknown'} - ${new Date(entry.timestamp).toLocaleString()}`,
                    detail: `Execution time: ${entry.executionTime}ms${entry.error ? ` - Error: ${entry.error}` : ''}`,
                    entry
                };
            }),
            { placeHolder: 'Select a query from history' }
        );

        if (!selected) {
            return;
        }

        // Create a new untitled document with the query
        const doc = await vscode.workspace.openTextDocument({
            content: selected.entry.query,
            language: 'sql'
        });
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Clear query history
     */
    public async clearQueryHistory(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all query history?',
            'Yes', 'No'
        );

        if (confirm === 'Yes') {
            this.queryHistory = [];
            await this.saveQueryHistory();
            vscode.window.showInformationMessage('Query history cleared');
        }
    }

    /**
     * Get query history
     */
    public getQueryHistory(): QueryHistoryEntry[] {
        return this.queryHistory;
    }

    /**
     * Add query to history
     */
    private addToHistory(connectionId: string, query: string, result: QueryResult): void {
        const entry: QueryHistoryEntry = {
            id: this.generateHistoryId(),
            connectionId,
            query,
            timestamp: new Date(),
            executionTime: result.executionTime,
            success: !result.error,
            error: result.error
        };

        this.queryHistory.push(entry);

        // Limit history size
        if (this.queryHistory.length > this.maxHistorySize) {
            this.queryHistory = this.queryHistory.slice(-this.maxHistorySize);
        }

        this.saveQueryHistory();
    }

    /**
     * Load query history from storage
     */
    private async loadQueryHistory(): Promise<void> {
        try {
            const stored = this.context.globalState.get<QueryHistoryEntry[]>('queryHistory', []);
            // Convert timestamp strings back to Date objects
            this.queryHistory = stored.map(entry => ({
                ...entry,
                timestamp: new Date(entry.timestamp)
            }));
            Logger.debug(`Loaded ${this.queryHistory.length} query history entries`);
        } catch (error) {
            Logger.error('Failed to load query history', error as Error);
        }
    }

    /**
     * Save query history to storage
     */
    private async saveQueryHistory(): Promise<void> {
        try {
            await this.context.globalState.update('queryHistory', this.queryHistory);
        } catch (error) {
            Logger.error('Failed to save query history', error as Error);
        }
    }

    /**
     * Generate unique history entry ID
     */
    private generateHistoryId(): string {
        return `hist_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
}
