import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { QueryResult, QueryHistoryEntry } from '../types';
import { Logger } from '../utils/logger';
import { ResultsPanel } from './resultsPanel';

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

        // Get selected text or entire document
        const query = editor.selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(editor.selection);

        if (!query.trim()) {
            vscode.window.showWarningMessage('No query to execute');
            return;
        }

        // Ask user to select a connection
        const connections = this.connectionManager.getAllConnections();
        if (connections.length === 0) {
            vscode.window.showWarningMessage('No database connections available. Please add a connection first.');
            return;
        }

        const connectedConnections = connections.filter(conn =>
            this.connectionManager.getProvider(conn.id) !== undefined
        );

        if (connectedConnections.length === 0) {
            vscode.window.showWarningMessage('No active connections. Please connect to a database first.');
            return;
        }

        const selectedConn = await vscode.window.showQuickPick(
            connectedConnections.map(conn => ({
                label: conn.name,
                description: `${conn.type} - ${conn.host}:${conn.port}`,
                connection: conn
            })),
            { placeHolder: 'Select a connection to execute the query' }
        );

        if (!selectedConn) {
            return;
        }

        await this.executeQuery(selectedConn.connection.id, query);
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

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Executing query...',
                cancellable: false
            }, async () => {
                const result = await provider.executeQuery(query, database);

                // Add to history
                this.addToHistory(connectionId, query, result);

                // Show results
                ResultsPanel.show(this.context, result, query);

                if (result.error) {
                    vscode.window.showErrorMessage(`Query failed: ${result.error}`);
                } else {
                    const message = result.rows
                        ? `Query executed successfully. ${result.rowCount} rows returned in ${result.executionTime}ms.`
                        : `Query executed successfully. ${result.rowCount} rows affected in ${result.executionTime}ms.`;
                    vscode.window.showInformationMessage(message);
                }
            });
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
