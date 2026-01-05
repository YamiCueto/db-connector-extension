/**
 * Database types supported by the extension
 */
export enum DatabaseType {
    MySQL = 'mysql',
    PostgreSQL = 'postgresql',
    MSSQL = 'mssql',
    MongoDB = 'mongodb',
    MariaDB = 'mariadb'
}

/**
 * Connection configuration for a database
 */
export interface ConnectionConfig {
    id: string;
    name: string;
    type: DatabaseType;
    host: string;
    port: number;
    username: string;
    database?: string;
    ssl?: boolean;
    sshTunnel?: SSHTunnelConfig;
    options?: Record<string, any>;
}

/**
 * SSH tunnel configuration for secure connections
 */
export interface SSHTunnelConfig {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    privateKeyPath?: string;
}

/**
 * Connection state
 */
export enum ConnectionState {
    Disconnected = 'disconnected',
    Connecting = 'connecting',
    Connected = 'connected',
    Error = 'error'
}

/**
 * Database schema information
 */
export interface DatabaseInfo {
    name: string;
    tables?: TableInfo[];
    collections?: CollectionInfo[];
}

/**
 * Table information for SQL databases
 */
export interface TableInfo {
    name: string;
    schema?: string;
    columns?: ColumnInfo[];
    rowCount?: number;
}

/**
 * Column information
 */
export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    defaultValue?: string;
}

/**
 * Collection information for MongoDB
 */
export interface CollectionInfo {
    name: string;
    documentCount?: number;
    fields?: FieldInfo[];
}

/**
 * Field information for MongoDB
 */
export interface FieldInfo {
    name: string;
    type: string;
    isRequired: boolean;
}

/**
 * Query execution result
 */
export interface QueryResult {
    rows?: any[];
    rowCount: number;
    fields?: QueryField[];
    executionTime: number;
    error?: string;
}

/**
 * Query field information
 */
export interface QueryField {
    name: string;
    type: string;
}

/**
 * Query history entry
 */
export interface QueryHistoryEntry {
    id: string;
    connectionId: string;
    query: string;
    timestamp: Date;
    executionTime: number;
    success: boolean;
    error?: string;
}

/**
 * Export format options
 */
export enum ExportFormat {
    CSV = 'csv',
    JSON = 'json',
    Excel = 'excel'
}

/**
 * Base interface for database providers
 */
export interface IDatabaseProvider {
    /**
     * Connect to the database
     */
    connect(config: ConnectionConfig, password: string): Promise<void>;

    /**
     * Disconnect from the database
     */
    disconnect(): Promise<void>;

    /**
     * Test the connection
     */
    testConnection(config: ConnectionConfig, password: string): Promise<boolean>;

    /**
     * Get list of databases/schemas
     */
    getDatabases(): Promise<DatabaseInfo[]>;

    /**
     * Get list of tables for a database
     */
    getTables(database: string): Promise<TableInfo[]>;

    /**
     * Get columns for a table
     */
    getColumns(database: string, table: string): Promise<ColumnInfo[]>;

    /**
     * Execute a query
     */
    executeQuery(query: string, database?: string): Promise<QueryResult>;

    /**
     * Get the connection state
     */
    getState(): ConnectionState;

    /**
     * Get database type
     */
    getType(): DatabaseType;
}

/**
 * MongoDB-specific provider interface
 */
export interface IMongoDBProvider extends IDatabaseProvider {
    /**
     * Get collections for a database
     */
    getCollections(database: string): Promise<CollectionInfo[]>;

    /**
     * Get fields for a collection
     */
    getFields(database: string, collection: string): Promise<FieldInfo[]>;
}
