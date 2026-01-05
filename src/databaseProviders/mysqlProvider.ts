import * as mysql from 'mysql2/promise';
import {
    IDatabaseProvider,
    ConnectionConfig,
    ConnectionState,
    DatabaseType,
    DatabaseInfo,
    TableInfo,
    ColumnInfo,
    QueryResult
} from '../types';
import { Logger } from '../utils/logger';

/**
 * MySQL database provider
 */
export class MySQLProvider implements IDatabaseProvider {
    private connection: mysql.Connection | null = null;
    private state: ConnectionState = ConnectionState.Disconnected;

    /**
     * Connect to MySQL database
     */
    public async connect(config: ConnectionConfig, password: string): Promise<void> {
        try {
            this.state = ConnectionState.Connecting;

            this.connection = await mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database,
                ssl: config.ssl ? {} : undefined,
                connectTimeout: 30000,
                ...config.options
            });

            this.state = ConnectionState.Connected;
            Logger.info(`Connected to MySQL: ${config.host}:${config.port}`);
        } catch (error) {
            this.state = ConnectionState.Error;
            Logger.error('MySQL connection failed', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from MySQL database
     */
    public async disconnect(): Promise<void> {
        try {
            if (this.connection) {
                await this.connection.end();
                this.connection = null;
            }
            this.state = ConnectionState.Disconnected;
            Logger.info('Disconnected from MySQL');
        } catch (error) {
            Logger.error('MySQL disconnect failed', error as Error);
            throw error;
        }
    }

    /**
     * Test MySQL connection
     */
    public async testConnection(config: ConnectionConfig, password: string): Promise<boolean> {
        let testConnection: mysql.Connection | null = null;
        try {
            testConnection = await mysql.createConnection({
                host: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database,
                ssl: config.ssl ? {} : undefined,
                connectTimeout: 10000
            });
            await testConnection.ping();
            await testConnection.end();
            return true;
        } catch (error) {
            Logger.error('MySQL connection test failed', error as Error);
            if (testConnection) {
                await testConnection.end();
            }
            return false;
        }
    }

    /**
     * Get list of databases
     */
    public async getDatabases(): Promise<DatabaseInfo[]> {
        this.ensureConnected();

        try {
            const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
                'SHOW DATABASES'
            );

            return rows.map(row => ({
                name: row.Database
            }));
        } catch (error) {
            Logger.error('Failed to get databases', error as Error);
            throw error;
        }
    }

    /**
     * Get list of tables
     */
    public async getTables(database: string): Promise<TableInfo[]> {
        this.ensureConnected();

        try {
            const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
                'SHOW TABLES FROM ??',
                [database]
            );

            const tableKey = `Tables_in_${database}`;
            return rows.map(row => ({
                name: row[tableKey],
                schema: database
            }));
        } catch (error) {
            Logger.error('Failed to get tables', error as Error);
            throw error;
        }
    }

    /**
     * Get columns for a table
     */
    public async getColumns(database: string, table: string): Promise<ColumnInfo[]> {
        this.ensureConnected();

        try {
            const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
                'SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
                [database, table]
            );

            return rows.map(row => ({
                name: row.COLUMN_NAME,
                type: row.COLUMN_TYPE,
                nullable: row.IS_NULLABLE === 'YES',
                isPrimaryKey: row.COLUMN_KEY === 'PRI',
                isForeignKey: row.COLUMN_KEY === 'MUL',
                defaultValue: row.COLUMN_DEFAULT
            }));
        } catch (error) {
            Logger.error('Failed to get columns', error as Error);
            throw error;
        }
    }

    /**
     * Execute a query
     */
    public async executeQuery(query: string, database?: string): Promise<QueryResult> {
        this.ensureConnected();

        const startTime = Date.now();
        try {
            // Switch database if specified
            if (database) {
                await this.connection!.query('USE ??', [database]);
            }

            // Clean the query: remove SQL comments and trim
            const cleanedQuery = this.cleanQuery(query);
            
            if (!cleanedQuery) {
                return {
                    rowCount: 0,
                    executionTime: 0,
                    error: 'No valid SQL query found'
                };
            }

            const [rows, fields] = await this.connection!.query(cleanedQuery);
            const executionTime = Date.now() - startTime;

            // Handle different result types
            if (Array.isArray(rows)) {
                return {
                    rows: rows as any[],
                    rowCount: rows.length,
                    fields: fields?.map(f => ({
                        name: f.name,
                        type: f.type?.toString() || 'unknown'
                    })),
                    executionTime
                };
            } else {
                // For INSERT, UPDATE, DELETE, etc.
                const result = rows as mysql.OkPacket;
                return {
                    rowCount: result.affectedRows,
                    executionTime
                };
            }
        } catch (error) {
            const executionTime = Date.now() - startTime;
            Logger.error('Query execution failed', error as Error);
            return {
                rowCount: 0,
                executionTime,
                error: (error as Error).message
            };
        }
    }

    /**
     * Get connection state
     */
    public getState(): ConnectionState {
        return this.state;
    }

    /**
     * Get database type
     */
    public getType(): DatabaseType {
        return DatabaseType.MySQL;
    }

    /**
     * Ensure connection is active
     */
    private ensureConnected(): void {
        if (!this.connection || this.state !== ConnectionState.Connected) {
            throw new Error('Not connected to MySQL database');
        }
    }

    /**
     * Clean SQL query by removing comments and extra whitespace
     */
    private cleanQuery(query: string): string {
        // Remove single-line comments (-- comment)
        let cleaned = query.replace(/--.*$/gm, '');
        
        // Remove multi-line comments (/* comment */)
        cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
        
        // Remove USE statements (we handle database separately)
        cleaned = cleaned.replace(/^\s*USE\s+[`'"]?\w+[`'"]?\s*;?\s*/gim, '');
        
        // Trim whitespace and remove empty lines
        cleaned = cleaned
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join('\n')
            .trim();
        
        // Remove trailing semicolon for single statements
        if (cleaned.endsWith(';') && (cleaned.match(/;/g) || []).length === 1) {
            cleaned = cleaned.slice(0, -1).trim();
        }
        
        return cleaned;
    }
}
