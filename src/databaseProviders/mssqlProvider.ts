import * as mssql from 'mssql';
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
 * SQL Server (MSSQL) database provider
 */
export class MSSQLProvider implements IDatabaseProvider {
    private pool: mssql.ConnectionPool | null = null;
    private state: ConnectionState = ConnectionState.Disconnected;

    /**
     * Connect to MSSQL database
     */
    public async connect(config: ConnectionConfig, password: string): Promise<void> {
        try {
            this.state = ConnectionState.Connecting;

            const poolConfig: mssql.config = {
                server: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database,
                options: {
                    encrypt: config.ssl || false,
                    trustServerCertificate: true,
                    enableArithAbort: true,
                    ...config.options
                },
                connectionTimeout: 30000,
                requestTimeout: 60000
            };

            this.pool = await new mssql.ConnectionPool(poolConfig).connect();
            this.state = ConnectionState.Connected;
            Logger.info(`Connected to MSSQL: ${config.host}:${config.port}`);
        } catch (error) {
            this.state = ConnectionState.Error;
            Logger.error('MSSQL connection failed', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from MSSQL database
     */
    public async disconnect(): Promise<void> {
        try {
            if (this.pool) {
                await this.pool.close();
                this.pool = null;
            }
            this.state = ConnectionState.Disconnected;
            Logger.info('Disconnected from MSSQL');
        } catch (error) {
            Logger.error('MSSQL disconnect failed', error as Error);
            throw error;
        }
    }

    /**
     * Test MSSQL connection
     */
    public async testConnection(config: ConnectionConfig, password: string): Promise<boolean> {
        let testPool: mssql.ConnectionPool | null = null;
        try {
            const poolConfig: mssql.config = {
                server: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database,
                options: {
                    encrypt: config.ssl || false,
                    trustServerCertificate: true
                },
                connectionTimeout: 10000
            };

            testPool = await new mssql.ConnectionPool(poolConfig).connect();
            await testPool.query('SELECT 1');
            await testPool.close();
            return true;
        } catch (error) {
            Logger.error('MSSQL connection test failed', error as Error);
            if (testPool) {
                await testPool.close();
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
            const result = await this.pool!.query(`
                SELECT name
                FROM sys.databases
                WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
                ORDER BY name
            `);

            return result.recordset.map((row: { name: string }) => ({
                name: row.name
            }));
        } catch (error) {
            Logger.error('Failed to get databases', error as Error);
            throw error;
        }
    }

    /**
     * Get list of tables
     */
    public async getTables(): Promise<TableInfo[]> {
        this.ensureConnected();

        try {
            const result = await this.pool!.query(`
                SELECT
                    s.name as schema_name,
                    t.name as table_name,
                    p.rows as row_count
                FROM sys.tables t
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                LEFT JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0, 1)
                ORDER BY s.name, t.name
            `);

            return result.recordset.map((row: { table_name: string; schema_name: string; row_count: number }) => ({
                name: row.table_name,
                schema: row.schema_name,
                rowCount: row.row_count
            }));
        } catch (error) {
            Logger.error('Failed to get tables', error as Error);
            throw error;
        }
    }

    /**
     * Get columns for a table
     */
    public async getColumns(table: string): Promise<ColumnInfo[]> {
        this.ensureConnected();

        try {
            const request = this.pool!.request();
            request.input('tableName', table);

            const queryResult = await request.query(`
                SELECT
                    c.name as column_name,
                    t.name as data_type,
                    c.is_nullable,
                    CASE
                        WHEN pk.column_id IS NOT NULL THEN 1
                        ELSE 0
                    END as is_primary_key,
                    CASE
                        WHEN fk.parent_column_id IS NOT NULL THEN 1
                        ELSE 0
                    END as is_foreign_key,
                    dc.definition as default_value
                FROM sys.columns c
                INNER JOIN sys.tables tb ON c.object_id = tb.object_id
                INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
                LEFT JOIN (
                    SELECT ic.object_id, ic.column_id
                    FROM sys.index_columns ic
                    INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                    WHERE i.is_primary_key = 1
                ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
                LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
                LEFT JOIN sys.default_constraints dc ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
                WHERE tb.name = @tableName
                ORDER BY c.column_id
            `);

            return queryResult.recordset.map((row: { column_name: string; data_type: string; is_nullable: boolean; is_primary_key: number; is_foreign_key: number; default_value: string }) => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable,
                isPrimaryKey: row.is_primary_key === 1,
                isForeignKey: row.is_foreign_key === 1,
                defaultValue: row.default_value
            }));
        } catch (error) {
            Logger.error('Failed to get columns', error as Error);
            throw error;
        }
    }

    /**
     * Execute a query
     */
    public async executeQuery(query: string, _database?: string): Promise<QueryResult> {
        this.ensureConnected();

        const startTime = Date.now();
        try {
            const result = await this.pool!.query(query);
            const executionTime = Date.now() - startTime;

            return {
                rows: result.recordset,
                rowCount: result.recordset?.length || result.rowsAffected[0] || 0,
                fields: result.recordset?.columns ? Object.keys(result.recordset.columns).map(name => ({
                    name,
                    type: 'unknown'
                })) : undefined,
                executionTime
            };
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
        return DatabaseType.MSSQL;
    }

    /**
     * Ensure connection is active
     */
    private ensureConnected(): void {
        if (!this.pool || this.state !== ConnectionState.Connected) {
            throw new Error('Not connected to MSSQL database');
        }
    }
}
