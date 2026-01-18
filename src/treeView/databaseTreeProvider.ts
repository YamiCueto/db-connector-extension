import { MSSQLProvider } from '../databaseProviders/mssqlProvider';
import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { Logger } from '../utils/logger';
import { DatabaseType } from '../types';
import {
    BaseTreeItem,
    ConnectionTreeItem,
    DatabaseTreeItem,
    TableTreeItem,
    CollectionTreeItem,
    ColumnTreeItem,
    FieldTreeItem
} from './treeItems';

/**
 * Tree data provider for the database explorer
 */
export class DatabaseTreeProvider implements vscode.TreeDataProvider<BaseTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<BaseTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private connectionManager: ConnectionManager) {
        // Listen to connection changes
        connectionManager.onDidChangeConnections(() => {
            this.refresh();
        });
    }

    /**
     * Refresh the tree view
     */
    public refresh(element?: BaseTreeItem): void {
        this._onDidChangeTreeData.fire(element);
    }

    /**
     * Get tree item
     */
    public getTreeItem(element: BaseTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item
     */
    public async getChildren(element?: BaseTreeItem): Promise<BaseTreeItem[]> {
        try {
            if (!element) {
                // Root level - show connections
                return this.getConnections();
            }

            if (element instanceof ConnectionTreeItem) {
                // Show databases for a connection
                return this.getDatabases(element);
            }

            if (element instanceof DatabaseTreeItem) {
                // Show tables/collections for a database
                return this.getTables(element);
            }

            if (element instanceof TableTreeItem) {
                // Show columns for a table
                return this.getColumns(element);
            }

            if (element instanceof CollectionTreeItem) {
                // Show fields for a collection
                return this.getFields(element);
            }

            return [];
        } catch (error) {
            Logger.error('Failed to get tree children', error as Error);
            vscode.window.showErrorMessage(`Failed to load items: ${(error as Error).message}`);
            return [];
        }
    }

    /**
     * Get all connections
     */
    private getConnections(): BaseTreeItem[] {
        const connections = this.connectionManager.getAllConnections();
        return connections.map(conn => {
            const state = this.connectionManager.getConnectionState(conn.id);
            return new ConnectionTreeItem(conn, state);
        });
    }

    /**
     * Get databases for a connection
     */
    private async getDatabases(element: ConnectionTreeItem): Promise<BaseTreeItem[]> {
        const provider = this.connectionManager.getProvider(element.connection.id);
        if (!provider) {
            return [];
        }

        try {
            const databases = await provider.getDatabases();
            return databases.map(db =>
                new DatabaseTreeItem(element.connection.id, db.name)
            );
        } catch (error) {
            Logger.error('Failed to get databases', error as Error);
            throw error;
        }
    }

    /**
     * Get tables/collections for a database
     */
    private async getTables(element: DatabaseTreeItem): Promise<BaseTreeItem[]> {
        const provider = this.connectionManager.getProvider(element.connectionId);
        if (!provider) {
            return [];
        }

        try {
            const connection = this.connectionManager.getConnection(element.connectionId);
            if (!connection) {
                return [];
            }

            // Handle MongoDB collections
            if (connection.type === DatabaseType.MongoDB) {
                const databases = await provider.getDatabases();
                const database = databases.find(db => db.name === element.databaseName);
                if (database?.collections) {
                    return database.collections.map(coll =>
                        new CollectionTreeItem(
                            element.connectionId,
                            element.databaseName,
                            coll.name,
                            coll.documentCount
                        )
                    );
                }
                return [];
            }

            // Handle SQL tables
            const tables = provider instanceof MSSQLProvider ? await provider.getTables() : await provider.getTables(element.databaseName);
            return tables.map(table =>
                new TableTreeItem(
                    element.connectionId,
                    element.databaseName,
                    table.name,
                    table.schema,
                    table.rowCount
                )
            );
        } catch (error) {
            Logger.error('Failed to get tables', error as Error);
            throw error;
        }
    }

    /**
     * Get columns for a table
     */
    private async getColumns(element: TableTreeItem): Promise<BaseTreeItem[]> {
        const provider = this.connectionManager.getProvider(element.connectionId);
        if (!provider) {
            return [];
        }

        try {
            const columns = provider instanceof MSSQLProvider ? await provider.getColumns(element.tableName) : await provider.getColumns(element.databaseName, element.tableName);
            return columns.map(col =>
                new ColumnTreeItem(col.name, col.type, col.isPrimaryKey, col.nullable)
            );
        } catch (error) {
            Logger.error('Failed to get columns', error as Error);
            throw error;
        }
    }

    /**
     * Get fields for a collection (MongoDB)
     */
    private async getFields(element: CollectionTreeItem): Promise<BaseTreeItem[]> {
        const provider = this.connectionManager.getProvider(element.connectionId);
        if (!provider) {
            return [];
        }

        try {
            // MongoDB providers implement getCollections which returns collections with fields
            const databases = await provider.getDatabases();
            const database = databases.find(db => db.name === element.databaseName);
            if (database?.collections) {
                const collection = database.collections.find(c => c.name === element.collectionName);
                if (collection?.fields) {
                    return collection.fields.map(field =>
                        new FieldTreeItem(field.name, field.type, field.isRequired)
                    );
                }
            }
            return [];
        } catch (error) {
            Logger.error('Failed to get fields', error as Error);
            throw error;
        }
    }
}
