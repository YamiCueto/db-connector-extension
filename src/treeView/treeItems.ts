import * as vscode from 'vscode';
import { ConnectionConfig, ConnectionState } from '../types';

/**
 * Base tree item for the database explorer
 */
export abstract class BaseTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly contextValue: string
    ) {
        super(label, collapsibleState);
    }
}

/**
 * Connection tree item
 */
export class ConnectionTreeItem extends BaseTreeItem {
    constructor(
        public readonly connection: ConnectionConfig,
        public readonly state: ConnectionState
    ) {
        super(
            connection.name,
            state === ConnectionState.Connected
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None,
            `connection-${state}`
        );

        this.description = `${connection.host}:${connection.port}`;
        this.tooltip = this.buildTooltip();
        this.iconPath = this.getIcon();
    }

    private buildTooltip(): string {
        return [
            `Name: ${this.connection.name}`,
            `Type: ${this.connection.type}`,
            `Host: ${this.connection.host}`,
            `Port: ${this.connection.port}`,
            `User: ${this.connection.username}`,
            `State: ${this.state}`
        ].join('\n');
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.state) {
            case ConnectionState.Connected:
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('terminal.ansiGreen'));
            case ConnectionState.Connecting:
                return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('terminal.ansiYellow'));
            case ConnectionState.Error:
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('terminal.ansiRed'));
            default:
                return new vscode.ThemeIcon('database', new vscode.ThemeColor('terminal.ansiBlack'));
        }
    }
}

/**
 * Database tree item
 */
export class DatabaseTreeItem extends BaseTreeItem {
    constructor(
        public readonly connectionId: string,
        public readonly databaseName: string
    ) {
        super(
            databaseName,
            vscode.TreeItemCollapsibleState.Collapsed,
            'database'
        );

        this.iconPath = new vscode.ThemeIcon('folder-library');
        this.tooltip = `Database: ${databaseName}`;
    }
}

/**
 * Table tree item (SQL databases)
 */
export class TableTreeItem extends BaseTreeItem {
    constructor(
        public readonly connectionId: string,
        public readonly databaseName: string,
        public readonly tableName: string,
        public readonly schema?: string,
        public readonly rowCount?: number
    ) {
        super(
            tableName,
            vscode.TreeItemCollapsibleState.Collapsed,
            'table'
        );

        this.iconPath = new vscode.ThemeIcon('table');
        this.description = rowCount !== undefined ? `${rowCount} rows` : undefined;
        this.tooltip = this.buildTooltip();
    }

    private buildTooltip(): string {
        const parts = [`Table: ${this.tableName}`];
        if (this.schema) {
            parts.push(`Schema: ${this.schema}`);
        }
        if (this.rowCount !== undefined) {
            parts.push(`Rows: ${this.rowCount}`);
        }
        return parts.join('\n');
    }
}

/**
 * Collection tree item (MongoDB)
 */
export class CollectionTreeItem extends BaseTreeItem {
    constructor(
        public readonly connectionId: string,
        public readonly databaseName: string,
        public readonly collectionName: string,
        public readonly documentCount?: number
    ) {
        super(
            collectionName,
            vscode.TreeItemCollapsibleState.Collapsed,
            'collection'
        );

        this.iconPath = new vscode.ThemeIcon('symbol-array');
        this.description = documentCount !== undefined ? `${documentCount} docs` : undefined;
        this.tooltip = `Collection: ${collectionName}${documentCount !== undefined ? `\nDocuments: ${documentCount}` : ''}`;
    }
}

/**
 * Column tree item
 */
export class ColumnTreeItem extends BaseTreeItem {
    constructor(
        public readonly columnName: string,
        public readonly columnType: string,
        public readonly isPrimaryKey: boolean,
        public readonly isNullable: boolean
    ) {
        super(
            columnName,
            vscode.TreeItemCollapsibleState.None,
            'column'
        );

        this.iconPath = this.getIcon();
        this.description = columnType;
        this.tooltip = this.buildTooltip();
    }

    private buildTooltip(): string {
        const parts = [
            `Column: ${this.columnName}`,
            `Type: ${this.columnType}`,
            `Nullable: ${this.isNullable ? 'Yes' : 'No'}`
        ];
        if (this.isPrimaryKey) {
            parts.push('Primary Key: Yes');
        }
        return parts.join('\n');
    }

    private getIcon(): vscode.ThemeIcon {
        if (this.isPrimaryKey) {
            return new vscode.ThemeIcon('key', new vscode.ThemeColor('terminal.ansiYellow'));
        }
        return new vscode.ThemeIcon('symbol-field');
    }
}

/**
 * Field tree item (MongoDB)
 */
export class FieldTreeItem extends BaseTreeItem {
    constructor(
        public readonly fieldName: string,
        public readonly fieldType: string,
        public readonly isRequired: boolean
    ) {
        super(
            fieldName,
            vscode.TreeItemCollapsibleState.None,
            'field'
        );

        this.iconPath = new vscode.ThemeIcon('symbol-field');
        this.description = fieldType;
        this.tooltip = `Field: ${fieldName}\nType: ${fieldType}\nRequired: ${isRequired ? 'Yes' : 'No'}`;
    }
}
