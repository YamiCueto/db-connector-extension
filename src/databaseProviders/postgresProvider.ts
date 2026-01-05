import { Pool, QueryResult as PgQueryResult } from 'pg';
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
 * PostgreSQL database provider
 */
export class PostgreSQLProvider implements IDatabaseProvider {
    private pool: Pool | null = null;
    private state: ConnectionState = ConnectionState.Disconnected;

    /**
     * Connect to PostgreSQL database
     */
    public async connect(config: ConnectionConfig, password: string): Promise<void> {
        try {
            this.state = ConnectionState.Connecting;

            this.pool = new Pool({
                host: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database || 'postgres',
                ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
                connectionTimeoutMillis: 30000,
                ...config.options
            });

            // Test connection
            const client = await this.pool.connect();
            client.release();

            this.state = ConnectionState.Connected;
            Logger.info(`Connected to PostgreSQL: ${config.host}:${config.port}`);
        } catch (error) {
            this.state = ConnectionState.Error;
            Logger.error('PostgreSQL connection failed', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from PostgreSQL database
     */
    public async disconnect(): Promise<void> {
        try {
            if (this.pool) {
                await this.pool.end();
                this.pool = null;
            }
            this.state = ConnectionState.Disconnected;
            Logger.info('Disconnected from PostgreSQL');
        } catch (error) {
            Logger.error('PostgreSQL disconnect failed', error as Error);
            throw error;
        }
    }

    /**
     * Test PostgreSQL connection
     */
    public async testConnection(config: ConnectionConfig, password: string): Promise<boolean> {
        let testPool: Pool | null = null;
        try {
            testPool = new Pool({
                host: config.host,
                port: config.port,
                user: config.username,
                password: password,
                database: config.database || 'postgres',
                ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
                connectionTimeoutMillis: 10000
            });

            const client = await testPool.connect();
            client.release();
            await testPool.end();
            return true;
        } catch (error) {
            Logger.error('PostgreSQL connection test failed', error as Error);
            if (testPool) {
                await testPool.end();
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
            const result = await this.pool!.query(
                'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname'
            );

            return result.rows.map((row: { datname: string }) => ({
                name: row.datname
            }));
        } catch (error) {
            Logger.error('Failed to get databases', error as Error);
            throw error;
        }
    }

    /**
     * Get list of tables
     */
    public async getTables(_database: string): Promise<TableInfo[]> {
        this.ensureConnected();

        try {
            // Simple query without row count to avoid circular reference
            const result = await this.pool!.query(`
                SELECT
                    schemaname as schema,
                    tablename as name
                FROM pg_tables
                WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                ORDER BY tablename
            `);

            return result.rows.map((row: { name: string; schema: string }) => ({
                name: row.name,
                schema: row.schema
            }));
        } catch (error) {
            Logger.error('Failed to get tables', error as Error);
            throw error;
        }
    }

    /**
     * Get columns for a table
     */
    public async getColumns(_database: string, table: string): Promise<ColumnInfo[]> {
        this.ensureConnected();

        try {
            const result = await this.pool!.query(`
                SELECT
                    c.column_name,
                    c.data_type,
                    c.is_nullable,
                    c.column_default,
                    CASE
                        WHEN pk.column_name IS NOT NULL THEN true
                        ELSE false
                    END as is_primary_key,
                    CASE
                        WHEN fk.column_name IS NOT NULL THEN true
                        ELSE false
                    END as is_foreign_key
                FROM information_schema.columns c
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                        ON tc.constraint_name = ku.constraint_name
                    WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_name = $1
                ) pk ON c.column_name = pk.column_name
                LEFT JOIN (
                    SELECT ku.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage ku
                        ON tc.constraint_name = ku.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                        AND tc.table_name = $1
                ) fk ON c.column_name = fk.column_name
                WHERE c.table_name = $1
                ORDER BY c.ordinal_position
            `, [table]);

            return result.rows.map((row: { column_name: string; data_type: string; is_nullable: string; is_primary_key: boolean; is_foreign_key: boolean; column_default: string }) => ({
                name: row.column_name,
                type: row.data_type,
                nullable: row.is_nullable === 'YES',
                isPrimaryKey: row.is_primary_key,
                isForeignKey: row.is_foreign_key,
                defaultValue: row.column_default
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
            const result: PgQueryResult = await this.pool!.query(query);
            const executionTime = Date.now() - startTime;

            return {
                rows: result.rows,
                rowCount: result.rowCount || 0,
                fields: result.fields?.map(f => ({
                    name: f.name,
                    type: f.dataTypeID?.toString() || 'unknown'
                })),
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
        return DatabaseType.PostgreSQL;
    }

    /**
     * Ensure connection is active
     */
    private ensureConnected(): void {
        if (!this.pool || this.state !== ConnectionState.Connected) {
            throw new Error('Not connected to PostgreSQL database');
        }
    }
}
