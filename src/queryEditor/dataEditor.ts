import { ConnectionManager } from '../connectionManager';
import { ColumnInfo, DatabaseType } from '../types';
import { Logger } from '../utils/logger';

/**
 * Represents a cell change in the data editor
 */
export interface CellChange {
    rowIndex: number;
    column: string;
    oldValue: any;
    newValue: any;
}

/**
 * Represents a row to be inserted
 */
export interface NewRow {
    tempId: string;
    data: Record<string, any>;
}

/**
 * Represents a row to be deleted
 */
export interface DeletedRow {
    rowIndex: number;
    data: Record<string, any>;
}

/**
 * Pending changes in the data editor
 */
export interface PendingChanges {
    updates: CellChange[];
    inserts: NewRow[];
    deletes: DeletedRow[];
}

/**
 * Table metadata for editing
 */
export interface EditableTableInfo {
    tableName: string;
    schema?: string;
    database?: string;
    primaryKeys: string[];
    columns: ColumnInfo[];
    isEditable: boolean;
    editError?: string;
}

/**
 * Data Editor for editing query results
 */
export class DataEditor {
    private pendingChanges: PendingChanges = {
        updates: [],
        inserts: [],
        deletes: []
    };

    constructor(
        private connectionManager: ConnectionManager,
        private connectionId: string
    ) {}

    /**
     * Parse the query to extract table information
     */
    public parseQueryForTable(query: string): EditableTableInfo | null {
        const normalizedQuery = query.trim().toLowerCase();
        
        // Only SELECT queries from a single table are editable
        if (!normalizedQuery.startsWith('select')) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'Only SELECT queries can be edited'
            };
        }

        // Check for JOINs - not editable
        if (/\bjoin\b/i.test(query)) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'Queries with JOINs cannot be edited directly'
            };
        }

        // Check for subqueries - not editable
        if ((query.match(/select/gi) || []).length > 1) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'Queries with subqueries cannot be edited directly'
            };
        }

        // Check for UNION - not editable
        if (/\bunion\b/i.test(query)) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'UNION queries cannot be edited directly'
            };
        }

        // Check for GROUP BY - not editable
        if (/\bgroup\s+by\b/i.test(query)) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'Aggregated queries cannot be edited'
            };
        }

        // Extract table name from FROM clause
        const fromMatch = query.match(/\bfrom\s+([`"[\]]?[\w.]+[`"\]]?)/i);
        if (!fromMatch) {
            return {
                tableName: '',
                primaryKeys: [],
                columns: [],
                isEditable: false,
                editError: 'Could not identify table name'
            };
        }

        let tableName = fromMatch[1].replace(/[`"[\]]/g, '');
        let schema: string | undefined;
        let database: string | undefined;

        // Handle schema.table or database.schema.table format
        const parts = tableName.split('.');
        if (parts.length === 3) {
            database = parts[0];
            schema = parts[1];
            tableName = parts[2];
        } else if (parts.length === 2) {
            schema = parts[0];
            tableName = parts[1];
        }

        return {
            tableName,
            schema,
            database,
            primaryKeys: [], // Will be filled by getTableMetadata
            columns: [],
            isEditable: true
        };
    }

    /**
     * Get table metadata including primary keys
     */
    public async getTableMetadata(
        tableInfo: EditableTableInfo,
        database?: string
    ): Promise<EditableTableInfo> {
        try {
            const provider = this.connectionManager.getProvider(this.connectionId);
            if (!provider) {
                return {
                    ...tableInfo,
                    isEditable: false,
                    editError: 'Connection not available'
                };
            }

            const db = tableInfo.database || database || '';
            const columns = await provider.getColumns(db, tableInfo.tableName);
            
            const primaryKeys = columns
                .filter(col => col.isPrimaryKey)
                .map(col => col.name);

            if (primaryKeys.length === 0) {
                return {
                    ...tableInfo,
                    columns,
                    isEditable: false,
                    editError: 'Table has no primary key - editing not supported'
                };
            }

            return {
                ...tableInfo,
                columns,
                primaryKeys,
                isEditable: true
            };
        } catch (error) {
            Logger.error('Failed to get table metadata', error as Error);
            return {
                ...tableInfo,
                isEditable: false,
                editError: `Failed to get table info: ${(error as Error).message}`
            };
        }
    }

    /**
     * Add a cell change
     */
    public addCellChange(change: CellChange): void {
        // Check if there's already a change for this cell
        const existingIndex = this.pendingChanges.updates.findIndex(
            c => c.rowIndex === change.rowIndex && c.column === change.column
        );

        if (existingIndex >= 0) {
            // Update existing change, keep original oldValue
            this.pendingChanges.updates[existingIndex].newValue = change.newValue;
            
            // If reverted to original, remove the change
            if (this.pendingChanges.updates[existingIndex].oldValue === change.newValue) {
                this.pendingChanges.updates.splice(existingIndex, 1);
            }
        } else {
            this.pendingChanges.updates.push(change);
        }
    }

    /**
     * Add a new row
     */
    public addNewRow(row: NewRow): void {
        this.pendingChanges.inserts.push(row);
    }

    /**
     * Mark a row for deletion
     */
    public markRowForDeletion(row: DeletedRow): void {
        // Check if it's a newly inserted row
        const insertIndex = this.pendingChanges.inserts.findIndex(
            r => r.tempId === (row.data as any)._tempId
        );

        if (insertIndex >= 0) {
            // Just remove from inserts, no need to delete from DB
            this.pendingChanges.inserts.splice(insertIndex, 1);
        } else {
            // Mark for deletion from database
            this.pendingChanges.deletes.push(row);
        }
    }

    /**
     * Get pending changes
     */
    public getPendingChanges(): PendingChanges {
        return this.pendingChanges;
    }

    /**
     * Check if there are pending changes
     */
    public hasChanges(): boolean {
        return (
            this.pendingChanges.updates.length > 0 ||
            this.pendingChanges.inserts.length > 0 ||
            this.pendingChanges.deletes.length > 0
        );
    }

    /**
     * Clear all pending changes
     */
    public clearChanges(): void {
        this.pendingChanges = {
            updates: [],
            inserts: [],
            deletes: []
        };
    }

    /**
     * Generate SQL statements for pending changes
     */
    public generateSqlStatements(
        tableInfo: EditableTableInfo,
        rows: any[]
    ): string[] {
        const statements: string[] = [];
        const provider = this.connectionManager.getProvider(this.connectionId);
        const dbType = provider?.getType() || DatabaseType.MySQL;

        // Generate DELETE statements first
        for (const del of this.pendingChanges.deletes) {
            const row = rows[del.rowIndex] || del.data;
            const whereClause = this.buildWhereClause(tableInfo, row, dbType);
            const fullTableName = this.getFullTableName(tableInfo, dbType);
            statements.push(`DELETE FROM ${fullTableName} WHERE ${whereClause};`);
        }

        // Generate UPDATE statements
        const updatesByRow = new Map<number, CellChange[]>();
        for (const update of this.pendingChanges.updates) {
            if (!updatesByRow.has(update.rowIndex)) {
                updatesByRow.set(update.rowIndex, []);
            }
            updatesByRow.get(update.rowIndex)!.push(update);
        }

        for (const [rowIndex, changes] of updatesByRow) {
            const row = rows[rowIndex];
            const setClause = changes
                .map(c => `${this.quoteIdentifier(c.column, dbType)} = ${this.formatValue(c.newValue, dbType)}`)
                .join(', ');
            const whereClause = this.buildWhereClause(tableInfo, row, dbType);
            const fullTableName = this.getFullTableName(tableInfo, dbType);
            statements.push(`UPDATE ${fullTableName} SET ${setClause} WHERE ${whereClause};`);
        }

        // Generate INSERT statements
        for (const insert of this.pendingChanges.inserts) {
            const columns = Object.keys(insert.data).filter(k => !k.startsWith('_'));
            const values = columns.map(c => this.formatValue(insert.data[c], dbType));
            const fullTableName = this.getFullTableName(tableInfo, dbType);
            statements.push(
                `INSERT INTO ${fullTableName} (${columns.map(c => this.quoteIdentifier(c, dbType)).join(', ')}) VALUES (${values.join(', ')});`
            );
        }

        return statements;
    }

    /**
     * Execute pending changes
     */
    public async executeChanges(
        tableInfo: EditableTableInfo,
        rows: any[],
        database?: string
    ): Promise<{ success: boolean; message: string; affectedRows: number }> {
        const statements = this.generateSqlStatements(tableInfo, rows);
        
        if (statements.length === 0) {
            return { success: true, message: 'No changes to save', affectedRows: 0 };
        }

        const provider = this.connectionManager.getProvider(this.connectionId);
        if (!provider) {
            return { success: false, message: 'Connection not available', affectedRows: 0 };
        }

        let affectedRows = 0;
        const errors: string[] = [];

        for (const sql of statements) {
            try {
                Logger.info(`Executing: ${sql}`);
                const result = await provider.executeQuery(sql, database);
                if (result.error) {
                    errors.push(`${sql}\nError: ${result.error}`);
                } else {
                    affectedRows += result.rowCount;
                }
            } catch (error) {
                errors.push(`${sql}\nError: ${(error as Error).message}`);
            }
        }

        if (errors.length > 0) {
            return {
                success: false,
                message: `Some changes failed:\n${errors.join('\n\n')}`,
                affectedRows
            };
        }

        this.clearChanges();
        return {
            success: true,
            message: `Successfully saved ${affectedRows} changes`,
            affectedRows
        };
    }

    /**
     * Build WHERE clause using primary keys
     */
    private buildWhereClause(
        tableInfo: EditableTableInfo,
        row: any,
        dbType: DatabaseType
    ): string {
        return tableInfo.primaryKeys
            .map(pk => {
                const value = row[pk];
                return `${this.quoteIdentifier(pk, dbType)} = ${this.formatValue(value, dbType)}`;
            })
            .join(' AND ');
    }

    /**
     * Get full table name with schema/database
     */
    private getFullTableName(tableInfo: EditableTableInfo, dbType: DatabaseType): string {
        const parts: string[] = [];
        
        if (tableInfo.database) {
            parts.push(this.quoteIdentifier(tableInfo.database, dbType));
        }
        if (tableInfo.schema) {
            parts.push(this.quoteIdentifier(tableInfo.schema, dbType));
        }
        parts.push(this.quoteIdentifier(tableInfo.tableName, dbType));
        
        return parts.join('.');
    }

    /**
     * Quote identifier based on database type
     */
    private quoteIdentifier(identifier: string, dbType: DatabaseType): string {
        switch (dbType) {
            case DatabaseType.MySQL:
            case DatabaseType.MariaDB:
                return `\`${identifier}\``;
            case DatabaseType.PostgreSQL:
                return `"${identifier}"`;
            case DatabaseType.MSSQL:
                return `[${identifier}]`;
            default:
                return `"${identifier}"`;
        }
    }

    /**
     * Format value for SQL based on database type
     */
    private formatValue(value: any, dbType: DatabaseType): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }

        if (typeof value === 'number') {
            return String(value);
        }

        if (typeof value === 'boolean') {
            if (dbType === DatabaseType.PostgreSQL) {
                return value ? 'TRUE' : 'FALSE';
            }
            return value ? '1' : '0';
        }

        if (value instanceof Date) {
            return `'${value.toISOString()}'`;
        }

        // String value - escape quotes
        const escaped = String(value).replace(/'/g, "''");
        return `'${escaped}'`;
    }
}
