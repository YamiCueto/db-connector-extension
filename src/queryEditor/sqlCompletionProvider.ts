import * as vscode from 'vscode';
import { ConnectionManager } from '../connectionManager';
import { DatabaseType, ColumnInfo } from '../types';
import { Logger } from '../utils/logger';

/**
 * Schema cache for autocomplete
 */
interface SchemaCache {
    connectionId: string;
    connectionName: string;
    databases: DatabaseSchema[];
    lastUpdated: Date;
}

interface DatabaseSchema {
    name: string;
    tables: TableSchema[];
}

interface TableSchema {
    name: string;
    columns: ColumnInfo[];
}

/**
 * SQL Keywords for autocomplete
 */
const SQL_KEYWORDS = [
    // DQL
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
    'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'AS', 'ON', 'USING',
    // Joins
    'JOIN', 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
    'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN',
    // DML
    'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
    // DDL
    'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE DATABASE',
    'ALTER TABLE', 'ALTER COLUMN', 'DROP TABLE', 'DROP INDEX', 'DROP VIEW', 'DROP DATABASE',
    'ADD COLUMN', 'DROP COLUMN', 'MODIFY COLUMN', 'RENAME TO',
    // Constraints
    'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT',
    'CHECK', 'INDEX', 'AUTO_INCREMENT', 'IDENTITY',
    // Transactions
    'BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'TRANSACTION',
    // Other
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST', 'CONVERT', 'COALESCE', 'NULLIF',
    'EXISTS', 'ALL', 'ANY', 'SOME', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
    'TOP', 'FETCH', 'FIRST', 'NEXT', 'ROWS', 'ONLY', 'WITH', 'RECURSIVE'
];

/**
 * SQL Functions for autocomplete
 */
const SQL_FUNCTIONS = [
    // Aggregate
    { name: 'COUNT', snippet: 'COUNT(${1:*})', description: 'Count rows' },
    { name: 'SUM', snippet: 'SUM(${1:column})', description: 'Sum values' },
    { name: 'AVG', snippet: 'AVG(${1:column})', description: 'Average value' },
    { name: 'MIN', snippet: 'MIN(${1:column})', description: 'Minimum value' },
    { name: 'MAX', snippet: 'MAX(${1:column})', description: 'Maximum value' },
    // String
    { name: 'CONCAT', snippet: 'CONCAT(${1:str1}, ${2:str2})', description: 'Concatenate strings' },
    { name: 'SUBSTRING', snippet: 'SUBSTRING(${1:str}, ${2:start}, ${3:length})', description: 'Extract substring' },
    { name: 'UPPER', snippet: 'UPPER(${1:str})', description: 'Convert to uppercase' },
    { name: 'LOWER', snippet: 'LOWER(${1:str})', description: 'Convert to lowercase' },
    { name: 'TRIM', snippet: 'TRIM(${1:str})', description: 'Remove leading/trailing spaces' },
    { name: 'LTRIM', snippet: 'LTRIM(${1:str})', description: 'Remove leading spaces' },
    { name: 'RTRIM', snippet: 'RTRIM(${1:str})', description: 'Remove trailing spaces' },
    { name: 'LENGTH', snippet: 'LENGTH(${1:str})', description: 'String length' },
    { name: 'REPLACE', snippet: 'REPLACE(${1:str}, ${2:old}, ${3:new})', description: 'Replace substring' },
    { name: 'CHARINDEX', snippet: 'CHARINDEX(${1:search}, ${2:str})', description: 'Find position of substring' },
    { name: 'LEFT', snippet: 'LEFT(${1:str}, ${2:length})', description: 'Left part of string' },
    { name: 'RIGHT', snippet: 'RIGHT(${1:str}, ${2:length})', description: 'Right part of string' },
    // Date/Time
    { name: 'NOW', snippet: 'NOW()', description: 'Current date and time' },
    { name: 'CURDATE', snippet: 'CURDATE()', description: 'Current date' },
    { name: 'CURTIME', snippet: 'CURTIME()', description: 'Current time' },
    { name: 'GETDATE', snippet: 'GETDATE()', description: 'Current date and time (SQL Server)' },
    { name: 'DATEADD', snippet: 'DATEADD(${1:interval}, ${2:number}, ${3:date})', description: 'Add to date' },
    { name: 'DATEDIFF', snippet: 'DATEDIFF(${1:interval}, ${2:date1}, ${3:date2})', description: 'Difference between dates' },
    { name: 'DATE_FORMAT', snippet: 'DATE_FORMAT(${1:date}, ${2:format})', description: 'Format date' },
    { name: 'YEAR', snippet: 'YEAR(${1:date})', description: 'Extract year' },
    { name: 'MONTH', snippet: 'MONTH(${1:date})', description: 'Extract month' },
    { name: 'DAY', snippet: 'DAY(${1:date})', description: 'Extract day' },
    // Numeric
    { name: 'ROUND', snippet: 'ROUND(${1:number}, ${2:decimals})', description: 'Round number' },
    { name: 'FLOOR', snippet: 'FLOOR(${1:number})', description: 'Round down' },
    { name: 'CEILING', snippet: 'CEILING(${1:number})', description: 'Round up' },
    { name: 'ABS', snippet: 'ABS(${1:number})', description: 'Absolute value' },
    { name: 'MOD', snippet: 'MOD(${1:number}, ${2:divisor})', description: 'Modulo' },
    // Conditional
    { name: 'COALESCE', snippet: 'COALESCE(${1:value1}, ${2:value2})', description: 'First non-null value' },
    { name: 'NULLIF', snippet: 'NULLIF(${1:expr1}, ${2:expr2})', description: 'Return null if equal' },
    { name: 'IFNULL', snippet: 'IFNULL(${1:expr}, ${2:default})', description: 'Replace null with default' },
    { name: 'IIF', snippet: 'IIF(${1:condition}, ${2:true_value}, ${3:false_value})', description: 'Inline if' },
    // Conversion
    { name: 'CAST', snippet: 'CAST(${1:expr} AS ${2:type})', description: 'Convert data type' },
    { name: 'CONVERT', snippet: 'CONVERT(${1:type}, ${2:expr})', description: 'Convert data type' }
];

/**
 * SQL Data Types
 */
const SQL_DATA_TYPES = [
    'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT',
    'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'DOUBLE',
    'CHAR', 'VARCHAR', 'TEXT', 'NCHAR', 'NVARCHAR', 'NTEXT',
    'DATE', 'TIME', 'DATETIME', 'DATETIME2', 'TIMESTAMP', 'YEAR',
    'BOOLEAN', 'BIT', 'BINARY', 'VARBINARY', 'BLOB',
    'JSON', 'XML', 'UUID', 'GUID'
];

/**
 * SQL Completion Provider
 */
export class SqlCompletionProvider implements vscode.CompletionItemProvider {
    private schemaCache: Map<string, SchemaCache> = new Map();
    private cacheTimeout = 5 * 60 * 1000; // 5 minutes

    constructor(private connectionManager: ConnectionManager) {
        // Listen to connection changes to update cache
        connectionManager.onDidChangeConnections(() => {
            this.invalidateCache();
        });
    }

    /**
     * Provide completion items
     */
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];

        try {
            const lineText = document.lineAt(position).text;
            const textBeforeCursor = lineText.substring(0, position.character);
            const wordRange = document.getWordRangeAtPosition(position);
            const currentWord = wordRange ? document.getText(wordRange) : '';

            // Get context (what comes before the current word)
            const contextMatch = textBeforeCursor.match(/(\w+)\s*\.\s*(\w*)$/);
            const afterFromMatch = textBeforeCursor.match(/\b(FROM|JOIN|INTO|UPDATE)\s+(\w*\.?\w*)$/i);
            const afterSelectMatch = textBeforeCursor.match(/\bSELECT\s+.*$/i);

            // If typing after a dot (table.column)
            if (contextMatch) {
                const tableName = contextMatch[1];
                items.push(...await this.getColumnCompletions(tableName));
            }
            // If typing after FROM, JOIN, INTO, UPDATE - suggest tables
            else if (afterFromMatch) {
                items.push(...await this.getTableCompletions());
            }
            // If in SELECT clause, suggest columns and functions
            else if (afterSelectMatch && !afterFromMatch) {
                items.push(...this.getFunctionCompletions());
                items.push(...await this.getAllColumnCompletions());
            }
            // Default: show keywords, tables, and functions
            else {
                items.push(...this.getKeywordCompletions(currentWord));
                items.push(...this.getFunctionCompletions());
                items.push(...this.getDataTypeCompletions());
                items.push(...await this.getTableCompletions());
            }

            // Add snippet completions
            items.push(...this.getSnippetCompletions());

        } catch (error) {
            Logger.error('Error providing completions', error as Error);
        }

        return items;
    }

    /**
     * Get SQL keyword completions
     */
    private getKeywordCompletions(currentWord: string): vscode.CompletionItem[] {
        return SQL_KEYWORDS
            .filter(kw => currentWord ? kw.toLowerCase().startsWith(currentWord.toLowerCase()) : true)
            .map(keyword => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'SQL Keyword';
                item.sortText = '1' + keyword; // Keywords first
                return item;
            });
    }

    /**
     * Get SQL function completions
     */
    private getFunctionCompletions(): vscode.CompletionItem[] {
        return SQL_FUNCTIONS.map(func => {
            const item = new vscode.CompletionItem(func.name, vscode.CompletionItemKind.Function);
            item.detail = func.description;
            item.insertText = new vscode.SnippetString(func.snippet);
            item.sortText = '2' + func.name; // Functions after keywords
            return item;
        });
    }

    /**
     * Get data type completions
     */
    private getDataTypeCompletions(): vscode.CompletionItem[] {
        return SQL_DATA_TYPES.map(type => {
            const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.TypeParameter);
            item.detail = 'SQL Data Type';
            item.sortText = '3' + type;
            return item;
        });
    }

    /**
     * Get table completions from all connected databases
     */
    private async getTableCompletions(): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];

        try {
            await this.updateSchemaCache();

            for (const cache of this.schemaCache.values()) {
                for (const db of cache.databases) {
                    for (const table of db.tables) {
                        const item = new vscode.CompletionItem(
                            table.name,
                            vscode.CompletionItemKind.Class
                        );
                        item.detail = `Table in ${db.name} (${cache.connectionName})`;
                        item.documentation = new vscode.MarkdownString(
                            `**${db.name}.${table.name}**\n\nColumns:\n${table.columns.map(c => `- ${c.name}: ${c.type}`).join('\n')}`
                        );
                        item.insertText = `${db.name}.${table.name}`;
                        item.sortText = '4' + table.name;
                        items.push(item);

                        // Also add without database prefix
                        const shortItem = new vscode.CompletionItem(
                            table.name,
                            vscode.CompletionItemKind.Class
                        );
                        shortItem.detail = `Table (${cache.connectionName})`;
                        shortItem.sortText = '5' + table.name;
                        items.push(shortItem);
                    }
                }
            }
        } catch (error) {
            Logger.error('Error getting table completions', error as Error);
        }

        return items;
    }

    /**
     * Get column completions for a specific table
     */
    private async getColumnCompletions(tableName: string): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];

        try {
            await this.updateSchemaCache();

            for (const cache of this.schemaCache.values()) {
                for (const db of cache.databases) {
                    const table = db.tables.find(t => 
                        t.name.toLowerCase() === tableName.toLowerCase()
                    );
                    if (table) {
                        for (const col of table.columns) {
                            const item = new vscode.CompletionItem(
                                col.name,
                                col.isPrimaryKey ? vscode.CompletionItemKind.Field : vscode.CompletionItemKind.Property
                            );
                            item.detail = `${col.type}${col.isPrimaryKey ? ' (PK)' : ''}${col.nullable ? '' : ' NOT NULL'}`;
                            item.documentation = new vscode.MarkdownString(
                                `**${table.name}.${col.name}**\n\n` +
                                `- Type: \`${col.type}\`\n` +
                                `- Nullable: ${col.nullable ? 'Yes' : 'No'}\n` +
                                `- Primary Key: ${col.isPrimaryKey ? 'Yes' : 'No'}`
                            );
                            item.sortText = col.isPrimaryKey ? '0' + col.name : '1' + col.name;
                            items.push(item);
                        }
                    }
                }
            }
        } catch (error) {
            Logger.error('Error getting column completions', error as Error);
        }

        return items;
    }

    /**
     * Get all columns from all tables (for SELECT statements)
     */
    private async getAllColumnCompletions(): Promise<vscode.CompletionItem[]> {
        const items: vscode.CompletionItem[] = [];

        try {
            await this.updateSchemaCache();

            for (const cache of this.schemaCache.values()) {
                for (const db of cache.databases) {
                    for (const table of db.tables) {
                        for (const col of table.columns) {
                            const item = new vscode.CompletionItem(
                                `${table.name}.${col.name}`,
                                vscode.CompletionItemKind.Property
                            );
                            item.detail = `${col.type} from ${table.name}`;
                            item.sortText = '6' + table.name + col.name;
                            items.push(item);
                        }
                    }
                }
            }
        } catch (error) {
            Logger.error('Error getting all column completions', error as Error);
        }

        return items;
    }

    /**
     * Get snippet completions for common SQL patterns
     */
    private getSnippetCompletions(): vscode.CompletionItem[] {
        const snippets = [
            {
                label: 'sel',
                snippet: 'SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:condition};',
                description: 'SELECT statement'
            },
            {
                label: 'selw',
                snippet: 'SELECT ${1:*}\nFROM ${2:table}\nWHERE ${3:column} = ${4:value};',
                description: 'SELECT with WHERE'
            },
            {
                label: 'ins',
                snippet: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});',
                description: 'INSERT statement'
            },
            {
                label: 'upd',
                snippet: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
                description: 'UPDATE statement'
            },
            {
                label: 'del',
                snippet: 'DELETE FROM ${1:table}\nWHERE ${2:condition};',
                description: 'DELETE statement'
            },
            {
                label: 'cte',
                snippet: 'WITH ${1:cte_name} AS (\n    ${2:SELECT * FROM table}\n)\nSELECT * FROM ${1:cte_name};',
                description: 'Common Table Expression'
            },
            {
                label: 'case',
                snippet: 'CASE\n    WHEN ${1:condition} THEN ${2:result}\n    ELSE ${3:default}\nEND',
                description: 'CASE expression'
            },
            {
                label: 'join',
                snippet: 'SELECT ${1:*}\nFROM ${2:table1} t1\nINNER JOIN ${3:table2} t2 ON t1.${4:column} = t2.${5:column};',
                description: 'JOIN statement'
            },
            {
                label: 'ljoin',
                snippet: 'SELECT ${1:*}\nFROM ${2:table1} t1\nLEFT JOIN ${3:table2} t2 ON t1.${4:column} = t2.${5:column};',
                description: 'LEFT JOIN statement'
            },
            {
                label: 'grp',
                snippet: 'SELECT ${1:column}, COUNT(*)\nFROM ${2:table}\nGROUP BY ${1:column}\nHAVING COUNT(*) > ${3:1};',
                description: 'GROUP BY with HAVING'
            },
            {
                label: 'sub',
                snippet: 'SELECT *\nFROM ${1:table}\nWHERE ${2:column} IN (\n    SELECT ${3:column}\n    FROM ${4:other_table}\n    WHERE ${5:condition}\n);',
                description: 'Subquery'
            },
            {
                label: 'exist',
                snippet: 'SELECT *\nFROM ${1:table} t1\nWHERE EXISTS (\n    SELECT 1\n    FROM ${2:other_table} t2\n    WHERE t2.${3:column} = t1.${4:column}\n);',
                description: 'EXISTS subquery'
            },
            {
                label: 'ctab',
                snippet: 'CREATE TABLE ${1:table_name} (\n    id INT PRIMARY KEY AUTO_INCREMENT,\n    ${2:column_name} ${3:VARCHAR(255)} NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);',
                description: 'CREATE TABLE'
            },
            {
                label: 'idx',
                snippet: 'CREATE INDEX idx_${1:name}\nON ${2:table} (${3:column});',
                description: 'CREATE INDEX'
            }
        ];

        return snippets.map(s => {
            const item = new vscode.CompletionItem(s.label, vscode.CompletionItemKind.Snippet);
            item.insertText = new vscode.SnippetString(s.snippet);
            item.detail = s.description;
            item.documentation = new vscode.MarkdownString('```sql\n' + s.snippet.replace(/\$\{\d+:?([^}]*)\}/g, '$1') + '\n```');
            item.sortText = '0' + s.label; // Snippets first
            return item;
        });
    }

    /**
     * Update schema cache from connected databases
     */
    private async updateSchemaCache(): Promise<void> {
        const connections = this.connectionManager.getAllConnections();

        for (const conn of connections) {
            const provider = this.connectionManager.getProvider(conn.id);
            if (!provider) { continue; }

            // Skip MongoDB (uses different query language)
            if (conn.type === DatabaseType.MongoDB) { continue; }

            // Check if cache is still valid
            const cached = this.schemaCache.get(conn.id);
            if (cached && (Date.now() - cached.lastUpdated.getTime()) < this.cacheTimeout) {
                continue;
            }

            try {
                const databases = await provider.getDatabases();
                const schemaData: DatabaseSchema[] = [];

                for (const db of databases) {
                    // Skip system databases
                    if (['information_schema', 'mysql', 'performance_schema', 'sys', 'master', 'tempdb', 'model', 'msdb'].includes(db.name.toLowerCase())) {
                        continue;
                    }

                    const tables = await provider.getTables(db.name);
                    const tableSchemas: TableSchema[] = [];

                    for (const table of tables.slice(0, 50)) { // Limit to 50 tables per database
                        try {
                            const columns = await provider.getColumns(db.name, table.name);
                            tableSchemas.push({
                                name: table.name,
                                columns
                            });
                        } catch {
                            tableSchemas.push({
                                name: table.name,
                                columns: []
                            });
                        }
                    }

                    schemaData.push({
                        name: db.name,
                        tables: tableSchemas
                    });
                }

                this.schemaCache.set(conn.id, {
                    connectionId: conn.id,
                    connectionName: conn.name,
                    databases: schemaData,
                    lastUpdated: new Date()
                });

                Logger.debug(`Schema cache updated for ${conn.name}`);

            } catch (error) {
                Logger.error(`Failed to update schema cache for ${conn.name}`, error as Error);
            }
        }
    }

    /**
     * Invalidate all cache
     */
    public invalidateCache(): void {
        this.schemaCache.clear();
        Logger.debug('Schema cache invalidated');
    }

    /**
     * Refresh cache for a specific connection
     */
    public async refreshCache(connectionId: string): Promise<void> {
        this.schemaCache.delete(connectionId);
        await this.updateSchemaCache();
    }
}
