import * as vscode from 'vscode';
import { ConnectionConfig, DatabaseType, IDatabaseProvider, ConnectionState } from './types';
import { Logger } from './utils/logger';
import { MySQLProvider } from './databaseProviders/mysqlProvider';
import { PostgreSQLProvider } from './databaseProviders/postgresProvider';
import { MSSQLProvider } from './databaseProviders/mssqlProvider';
import { MongoDBProvider } from './databaseProviders/mongoProvider';
import { MariaDBProvider } from './databaseProviders/mariadbProvider';

/**
 * Manages database connections and credentials
 */
export class ConnectionManager {
    private static instance: ConnectionManager;
    private connections: Map<string, ConnectionConfig> = new Map();
    private providers: Map<string, IDatabaseProvider> = new Map();
    private secretStorage: vscode.SecretStorage;
    private context: vscode.ExtensionContext;
    private onDidChangeConnectionsEmitter = new vscode.EventEmitter<void>();

    public readonly onDidChangeConnections = this.onDidChangeConnectionsEmitter.event;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.secretStorage = context.secrets;
        this.loadConnections();
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(context: vscode.ExtensionContext): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager(context);
        }
        return ConnectionManager.instance;
    }

    /**
     * Add a new connection
     */
    public async addConnection(config: ConnectionConfig, password: string): Promise<void> {
        try {
            // Generate unique ID if not provided
            if (!config.id) {
                config.id = this.generateConnectionId();
            }

            // Store password in VS Code secret storage
            await this.secretStorage.store(this.getPasswordKey(config.id), password);

            // Store connection config
            this.connections.set(config.id, config);
            await this.saveConnections();

            Logger.info(`Connection added: ${config.name} (${config.type})`);
            this.onDidChangeConnectionsEmitter.fire();
        } catch (error) {
            Logger.error('Failed to add connection', error as Error);
            throw error;
        }
    }

    /**
     * Remove a connection
     */
    public async removeConnection(connectionId: string): Promise<void> {
        try {
            // Disconnect if connected
            if (this.providers.has(connectionId)) {
                await this.disconnect(connectionId);
            }

            // Remove password from secret storage
            await this.secretStorage.delete(this.getPasswordKey(connectionId));

            // Remove connection config
            this.connections.delete(connectionId);
            await this.saveConnections();

            Logger.info(`Connection removed: ${connectionId}`);
            this.onDidChangeConnectionsEmitter.fire();
        } catch (error) {
            Logger.error('Failed to remove connection', error as Error);
            throw error;
        }
    }

    /**
     * Update a connection
     */
    public async updateConnection(config: ConnectionConfig, password?: string): Promise<void> {
        try {
            // Update password if provided
            if (password) {
                await this.secretStorage.store(this.getPasswordKey(config.id), password);
            }

            // Update connection config
            this.connections.set(config.id, config);
            await this.saveConnections();

            Logger.info(`Connection updated: ${config.name}`);
            this.onDidChangeConnectionsEmitter.fire();
        } catch (error) {
            Logger.error('Failed to update connection', error as Error);
            throw error;
        }
    }

    /**
     * Get a connection by ID
     */
    public getConnection(connectionId: string): ConnectionConfig | undefined {
        return this.connections.get(connectionId);
    }

    /**
     * Get all connections
     */
    public getAllConnections(): ConnectionConfig[] {
        return Array.from(this.connections.values());
    }

    /**
     * Get password for a connection
     */
    public async getPassword(connectionId: string): Promise<string | undefined> {
        return await this.secretStorage.get(this.getPasswordKey(connectionId));
    }

    /**
     * Connect to a database
     */
    public async connect(connectionId: string): Promise<void> {
        try {
            const config = this.connections.get(connectionId);
            if (!config) {
                throw new Error(`Connection not found: ${connectionId}`);
            }

            // Get password from secret storage (can be empty for local connections)
            const password = await this.getPassword(connectionId) || '';

            // Create provider if not exists
            let provider = this.providers.get(connectionId);
            if (!provider) {
                provider = this.createProvider(config.type);
                this.providers.set(connectionId, provider);
            }

            // Connect
            await provider.connect(config, password);
            Logger.info(`Connected to: ${config.name}`);
            this.onDidChangeConnectionsEmitter.fire();
        } catch (error) {
            Logger.error('Failed to connect to database', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from a database
     */
    public async disconnect(connectionId: string): Promise<void> {
        try {
            const provider = this.providers.get(connectionId);
            if (provider) {
                await provider.disconnect();
                this.providers.delete(connectionId);
                Logger.info(`Disconnected from: ${connectionId}`);
                this.onDidChangeConnectionsEmitter.fire();
            }
        } catch (error) {
            Logger.error('Failed to disconnect from database', error as Error);
            throw error;
        }
    }

    /**
     * Test a connection
     */
    public async testConnection(config: ConnectionConfig, password: string): Promise<boolean> {
        try {
            const provider = this.createProvider(config.type);
            const result = await provider.testConnection(config, password);
            return result;
        } catch (error) {
            Logger.error('Connection test failed', error as Error);
            return false;
        }
    }

    /**
     * Get provider for a connection
     */
    public getProvider(connectionId: string): IDatabaseProvider | undefined {
        return this.providers.get(connectionId);
    }

    /**
     * Get connection state
     */
    public getConnectionState(connectionId: string): ConnectionState {
        const provider = this.providers.get(connectionId);
        return provider ? provider.getState() : ConnectionState.Disconnected;
    }

    /**
     * Disconnect all connections
     */
    public async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.providers.keys()).map(id =>
            this.disconnect(id)
        );
        await Promise.all(disconnectPromises);
    }

    /**
     * Create a database provider based on type
     */
    private createProvider(type: DatabaseType): IDatabaseProvider {
        switch (type) {
            case DatabaseType.MySQL:
                return new MySQLProvider();
            case DatabaseType.PostgreSQL:
                return new PostgreSQLProvider();
            case DatabaseType.MSSQL:
                return new MSSQLProvider();
            case DatabaseType.MongoDB:
                return new MongoDBProvider();
            case DatabaseType.MariaDB:
                return new MariaDBProvider();
            default:
                throw new Error(`Unsupported database type: ${type}`);
        }
    }

    /**
     * Load connections from storage
     */
    private async loadConnections(): Promise<void> {
        try {
            const stored = this.context.globalState.get<ConnectionConfig[]>('connections', []);
            this.connections = new Map(stored.map(conn => [conn.id, conn]));
            Logger.info(`Loaded ${this.connections.size} connections`);
        } catch (error) {
            Logger.error('Failed to load connections', error as Error);
        }
    }

    /**
     * Save connections to storage
     */
    private async saveConnections(): Promise<void> {
        try {
            const connections = Array.from(this.connections.values());
            await this.context.globalState.update('connections', connections);
            Logger.debug(`Saved ${connections.length} connections`);
        } catch (error) {
            Logger.error('Failed to save connections', error as Error);
            throw error;
        }
    }

    /**
     * Generate a unique connection ID
     */
    private generateConnectionId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Get the secret storage key for a connection password
     */
    private getPasswordKey(connectionId: string): string {
        return `dbConnector.password.${connectionId}`;
    }
}
