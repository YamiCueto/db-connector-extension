import * as vscode from 'vscode';
import { QueryResult } from '../types';
import { Logger } from '../utils/logger';
import { MultiQueryResult } from './queryExecutor';
import { DataEditor, EditableTableInfo, CellChange, NewRow, DeletedRow } from './dataEditor';
import { ConnectionManager } from '../connectionManager';

/**
 * Edit mode state
 */
interface EditModeState {
    enabled: boolean;
    tableInfo: EditableTableInfo | null;
    dataEditor: DataEditor | null;
    originalRows: any[];
    currentRows: any[];
    connectionId: string;
    database?: string;
    query: string;
}

/**
 * Results panel for displaying query results
 */
export class ResultsPanel {
    private static currentPanel: ResultsPanel | undefined;
    private static connectionManager: ConnectionManager | undefined;
    private readonly panel: vscode.WebviewPanel;
    private currentResult: QueryResult | undefined;
    private currentResults: MultiQueryResult[] | undefined;
    private editState: EditModeState = {
        enabled: false,
        tableInfo: null,
        dataEditor: null,
        originalRows: [],
        currentRows: [],
        connectionId: '',
        query: ''
    };

    /**
     * Set the connection manager for data editing
     */
    public static setConnectionManager(manager: ConnectionManager): void {
        ResultsPanel.connectionManager = manager;
    }

    private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
        this.panel = panel;

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'export':
                        this.exportResults(message.format, message.index);
                        break;
                    case 'copy':
                        this.copyToClipboard(message.data);
                        break;
                    case 'enableEditMode':
                        await this.enableEditMode(message.connectionId, message.database, message.query);
                        break;
                    case 'cellChanged':
                        this.handleCellChange(message.change);
                        break;
                    case 'addRow':
                        this.handleAddRow(message.row);
                        break;
                    case 'deleteRow':
                        this.handleDeleteRow(message.rowIndex);
                        break;
                    case 'saveChanges':
                        await this.handleSaveChanges();
                        break;
                    case 'discardChanges':
                        this.handleDiscardChanges();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Clean up when panel is closed
        this.panel.onDidDispose(() => {
            ResultsPanel.currentPanel = undefined;
        });
    }

    /**
     * Show single result in the panel
     */
    public static show(
        context: vscode.ExtensionContext, 
        result: QueryResult, 
        query: string,
        connectionId?: string,
        database?: string
    ): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel.panel.reveal(column);
            ResultsPanel.currentPanel.updateResults(result, query, connectionId, database);
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'dbConnectorResults',
            'Query Results',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ResultsPanel.currentPanel = new ResultsPanel(panel, context);
        ResultsPanel.currentPanel.updateResults(result, query, connectionId, database);
    }

    /**
     * Show multiple results in the panel with tabs
     */
    public static showMultiple(context: vscode.ExtensionContext, results: MultiQueryResult[]): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel.panel.reveal(column);
            ResultsPanel.currentPanel.updateMultipleResults(results);
            return;
        }

        // Create new panel
        const panel = vscode.window.createWebviewPanel(
            'dbConnectorResults',
            'Query Results',
            column || vscode.ViewColumn.Two,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        ResultsPanel.currentPanel = new ResultsPanel(panel, context);
        ResultsPanel.currentPanel.updateMultipleResults(results);
    }

    /**
     * Update results in the panel (single query)
     */
    private updateResults(result: QueryResult, query: string, connectionId?: string, database?: string): void {
        this.currentResult = result;
        this.currentResults = undefined;
        this.editState = {
            enabled: false,
            tableInfo: null,
            dataEditor: null,
            originalRows: result.rows ? [...result.rows] : [],
            currentRows: result.rows ? [...result.rows] : [],
            connectionId: connectionId || '',
            database,
            query: query
        };
        this.panel.webview.html = this.getHtmlContent(result, query);
    }

    /**
     * Update results in the panel (multiple queries)
     */
    private updateMultipleResults(results: MultiQueryResult[]): void {
        this.currentResults = results;
        this.currentResult = results[0]?.result;
        this.editState = {
            enabled: false,
            tableInfo: null,
            dataEditor: null,
            originalRows: [],
            currentRows: [],
            connectionId: '',
            query: ''
        };
        this.panel.webview.html = this.getMultipleResultsHtml(results);
    }

    /**
     * Enable edit mode for the current result
     */
    private async enableEditMode(connectionId: string, database: string | undefined, query: string): Promise<void> {
        if (!ResultsPanel.connectionManager) {
            vscode.window.showErrorMessage('Connection manager not available');
            return;
        }

        const dataEditor = new DataEditor(ResultsPanel.connectionManager, connectionId);
        let tableInfo = dataEditor.parseQueryForTable(query);

        if (!tableInfo || !tableInfo.isEditable) {
            vscode.window.showWarningMessage(tableInfo?.editError || 'This query cannot be edited');
            return;
        }

        // Get table metadata with primary keys
        tableInfo = await dataEditor.getTableMetadata(tableInfo, database);

        if (!tableInfo.isEditable) {
            vscode.window.showWarningMessage(tableInfo.editError || 'This table cannot be edited');
            return;
        }

        this.editState = {
            enabled: true,
            tableInfo,
            dataEditor,
            originalRows: this.currentResult?.rows ? [...this.currentResult.rows] : [],
            currentRows: this.currentResult?.rows ? JSON.parse(JSON.stringify(this.currentResult.rows)) : [],
            connectionId,
            database,
            query
        };

        // Refresh the view with edit mode enabled
        if (this.currentResult) {
            this.panel.webview.html = this.getEditableHtmlContent(this.currentResult, query);
        }

        vscode.window.showInformationMessage(`Edit mode enabled for table: ${tableInfo.tableName}`);
    }

    /**
     * Handle cell change from webview
     */
    private handleCellChange(change: CellChange): void {
        if (!this.editState.dataEditor) return;

        this.editState.dataEditor.addCellChange(change);
        
        // Update currentRows
        if (this.editState.currentRows[change.rowIndex]) {
            this.editState.currentRows[change.rowIndex][change.column] = change.newValue;
        }

        this.updateEditStatus();
    }

    /**
     * Handle add row from webview
     */
    private handleAddRow(rowData: Record<string, any>): void {
        if (!this.editState.dataEditor) return;

        const tempId = `new_${Date.now()}`;
        const newRow: NewRow = {
            tempId,
            data: { ...rowData, _tempId: tempId }
        };

        this.editState.dataEditor.addNewRow(newRow);
        this.editState.currentRows.push({ ...rowData, _tempId: tempId, _isNew: true });

        this.updateEditStatus();
    }

    /**
     * Handle delete row from webview
     */
    private handleDeleteRow(rowIndex: number): void {
        if (!this.editState.dataEditor) return;

        const row = this.editState.currentRows[rowIndex];
        if (!row) return;

        const deletedRow: DeletedRow = {
            rowIndex,
            data: row
        };

        this.editState.dataEditor.markRowForDeletion(deletedRow);
        
        // Mark row as deleted in UI
        this.editState.currentRows[rowIndex]._isDeleted = true;

        this.updateEditStatus();
    }

    /**
     * Handle save changes
     */
    private async handleSaveChanges(): Promise<void> {
        if (!this.editState.dataEditor || !this.editState.tableInfo) {
            vscode.window.showErrorMessage('Edit mode not properly initialized');
            return;
        }

        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Saving changes...',
                cancellable: false
            },
            async () => {
                return await this.editState.dataEditor!.executeChanges(
                    this.editState.tableInfo!,
                    this.editState.originalRows,
                    this.editState.database
                );
            }
        );

        if (result.success) {
            vscode.window.showInformationMessage(result.message);
            
            // Refresh the data
            await this.refreshData();
        } else {
            vscode.window.showErrorMessage(result.message);
        }
    }

    /**
     * Handle discard changes
     */
    private handleDiscardChanges(): void {
        if (!this.editState.dataEditor) return;

        this.editState.dataEditor.clearChanges();
        this.editState.currentRows = JSON.parse(JSON.stringify(this.editState.originalRows));
        this.editState.enabled = false;

        // Refresh view
        if (this.currentResult) {
            this.panel.webview.html = this.getHtmlContent(this.currentResult, this.editState.query);
        }

        vscode.window.showInformationMessage('Changes discarded');
    }

    /**
     * Refresh data from database
     */
    private async refreshData(): Promise<void> {
        if (!ResultsPanel.connectionManager || !this.editState.connectionId) return;

        try {
            const provider = ResultsPanel.connectionManager.getProvider(this.editState.connectionId);
            if (!provider) return;

            const result = await provider.executeQuery(this.editState.query, this.editState.database);
            this.currentResult = result;
            this.editState.originalRows = result.rows ? [...result.rows] : [];
            this.editState.currentRows = result.rows ? JSON.parse(JSON.stringify(result.rows)) : [];
            this.editState.dataEditor?.clearChanges();

            this.panel.webview.html = this.getEditableHtmlContent(result, this.editState.query);
        } catch (error) {
            Logger.error('Failed to refresh data', error as Error);
        }
    }

    /**
     * Update edit status in webview
     */
    private updateEditStatus(): void {
        const hasChanges = this.editState.dataEditor?.hasChanges() || false;
        const changes = this.editState.dataEditor?.getPendingChanges();
        
        this.panel.webview.postMessage({
            command: 'updateEditStatus',
            hasChanges,
            changeCount: {
                updates: changes?.updates.length || 0,
                inserts: changes?.inserts.length || 0,
                deletes: changes?.deletes.length || 0
            }
        });
    }

    /**
     * Generate HTML content for multiple results with tabs
     */
    private getMultipleResultsHtml(results: MultiQueryResult[]): string {
        const showRowCount = vscode.workspace.getConfiguration('dbConnector').get('showRowCount', true);

        const tabs = results.map((r, i) => {
            const statusIcon = r.result.error ? '❌' : '✓';
            const preview = r.query.substring(0, 30).replace(/\n/g, ' ');
            return `<button class="tab ${i === 0 ? 'active' : ''}" onclick="showTab(${i})">${statusIcon} Query ${i + 1}: ${this.escapeHtml(preview)}...</button>`;
        }).join('');

        const tabContents = results.map((r, i) => {
            return `<div class="tab-content ${i === 0 ? 'active' : ''}" id="tab-${i}">
                ${this.getResultContent(r.result, r.query, showRowCount, i)}
            </div>`;
        }).join('');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 0;
            margin: 0;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .tabs-container {
            display: flex;
            flex-wrap: wrap;
            gap: 2px;
            background-color: var(--vscode-tab-inactiveBackground);
            padding: 5px 5px 0 5px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .tab {
            background-color: var(--vscode-tab-inactiveBackground);
            color: var(--vscode-tab-inactiveForeground);
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            font-size: 12px;
            border-radius: 4px 4px 0 0;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .tab:hover {
            background-color: var(--vscode-tab-hoverBackground);
        }
        .tab.active {
            background-color: var(--vscode-tab-activeBackground);
            color: var(--vscode-tab-activeForeground);
            border-bottom: 2px solid var(--vscode-focusBorder);
        }
        .tab-content {
            display: none;
            padding: 20px;
        }
        .tab-content.active {
            display: block;
        }
        .summary {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px 20px;
            margin: 0;
            font-size: 13px;
        }
        .summary-success {
            color: var(--vscode-testing-iconPassed);
        }
        .summary-error {
            color: var(--vscode-testing-iconFailed);
        }
        .toolbar {
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
            align-items: center;
        }
        button.action {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button.action:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        .info {
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        tr:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .error-container {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 15px;
            margin: 10px 0;
        }
        .error-title {
            color: var(--vscode-errorForeground);
            font-weight: bold;
            margin-bottom: 10px;
        }
        .query-container {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            margin: 10px 0;
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
            font-size: 12px;
            max-height: 150px;
            overflow: auto;
        }
    </style>
</head>
<body>
    <div class="summary">
        <span class="summary-success">✓ ${results.filter(r => !r.result.error).length} successful</span> | 
        <span class="summary-error">❌ ${results.filter(r => r.result.error).length} failed</span> | 
        Total: ${results.reduce((sum, r) => sum + r.result.executionTime, 0)}ms
    </div>
    <div class="tabs-container">
        ${tabs}
    </div>
    ${tabContents}

    <script>
        const vscode = acquireVsCodeApi();

        function showTab(index) {
            // Hide all tabs and contents
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            // Show selected tab and content
            document.querySelectorAll('.tab')[index].classList.add('active');
            document.getElementById('tab-' + index).classList.add('active');
        }

        function exportResults(format, index) {
            vscode.postMessage({ command: 'export', format: format, index: index });
        }

        function copyTable(index) {
            const table = document.querySelector('#tab-' + index + ' table');
            if (!table) return;
            const text = Array.from(table.querySelectorAll('tr'))
                .map(row => Array.from(row.querySelectorAll('th, td'))
                    .map(cell => cell.textContent)
                    .join('\\t'))
                .join('\\n');
            vscode.postMessage({ command: 'copy', data: text });
        }
    </script>
</body>
</html>`;
    }

    /**
     * Get content for a single result (used in tabs)
     */
    private getResultContent(result: QueryResult, query: string, showRowCount: boolean, index: number): string {
        if (result.error) {
            return `
                <div class="error-container">
                    <div class="error-title">Error:</div>
                    <div>${this.escapeHtml(result.error)}</div>
                </div>
                <div class="query-container">${this.escapeHtml(query)}</div>
            `;
        }

        if (!result.rows || result.rows.length === 0) {
            return `
                <p><strong>Query executed successfully.</strong></p>
                <p>Rows affected: ${result.rowCount}</p>
                <p>Execution time: ${result.executionTime}ms</p>
                <div class="query-container">${this.escapeHtml(query)}</div>
            `;
        }

        const columns = result.fields?.map(f => f.name) || Object.keys(result.rows[0] || {});

        return `
            <div class="toolbar">
                <button class="action" onclick="exportResults('csv', ${index})">Export CSV</button>
                <button class="action" onclick="exportResults('json', ${index})">Export JSON</button>
                <button class="action" onclick="copyTable(${index})">Copy</button>
                <span class="info">${showRowCount ? `${result.rowCount} rows` : ''} | ${result.executionTime}ms</span>
            </div>
            <table>
                <thead>
                    <tr>${columns.map(col => `<th>${this.escapeHtml(col)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${result.rows.map(row => `
                        <tr>${columns.map(col => {
                            const value = row[col];
                            if (value === null || value === undefined) {
                                return '<td class="null-value">NULL</td>';
                            }
                            return `<td>${this.escapeHtml(String(value))}</td>`;
                        }).join('')}</tr>
                    `).join('')}
                </tbody>
            </table>
            <details style="margin-top: 15px;">
                <summary style="cursor: pointer; color: var(--vscode-descriptionForeground);">Show Query</summary>
                <div class="query-container">${this.escapeHtml(query)}</div>
            </details>
        `;
    }

    /**
     * Generate HTML content for the webview
     */
    private getHtmlContent(result: QueryResult, query: string): string {
        const showRowCount = vscode.workspace.getConfiguration('dbConnector').get('showRowCount', true);

        if (result.error) {
            return this.getErrorHtml(result.error, query);
        }

        if (!result.rows || result.rows.length === 0) {
            return this.getEmptyResultHtml(result, query);
        }

        return this.getTableHtml(result, query, showRowCount);
    }

    /**
     * Generate error HTML
     */
    private getErrorHtml(error: string, query: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .error-container {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            padding: 15px;
            margin: 20px 0;
        }
        .error-title {
            color: var(--vscode-errorForeground);
            font-weight: bold;
            margin-bottom: 10px;
        }
        .query-container {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 10px;
            border-radius: 4px;
            margin-top: 20px;
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <h2>Query Error</h2>
    <div class="error-container">
        <div class="error-title">Error:</div>
        <div>${this.escapeHtml(error)}</div>
    </div>
    <div class="query-container">
        <strong>Query:</strong><br>
        ${this.escapeHtml(query)}
    </div>
</body>
</html>`;
    }

    /**
     * Generate empty result HTML
     */
    private getEmptyResultHtml(result: QueryResult, _query: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .info {
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <h2>Query Results</h2>
    <p class="info">Query executed successfully.</p>
    <p><strong>Rows affected:</strong> ${result.rowCount}</p>
    <p><strong>Execution time:</strong> ${result.executionTime}ms</p>
</body>
</html>`;
    }

    /**
     * Generate table HTML
     */
    private getTableHtml(result: QueryResult, _query: string, showRowCount: boolean): string {
        const columns = result.fields?.map(f => f.name) || Object.keys(result.rows![0] || {});
        const canEdit = this.canEnableEditMode(_query);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Query Results</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .toolbar {
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.edit-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.edit-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .info {
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        tr:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
    </style>
</head>
<body>
    <h2>Query Results</h2>
    <div class="toolbar">
        <button onclick="exportResults('csv')">Export CSV</button>
        <button onclick="exportResults('json')">Export JSON</button>
        <button onclick="copyTable()">Copy</button>
        ${canEdit ? `<button class="edit-btn" onclick="enableEditMode()">✏️ Edit Data</button>` : ''}
        <span class="info">
            ${showRowCount ? `${result.rowCount} rows` : ''} | ${result.executionTime}ms
        </span>
    </div>
    <table>
        <thead>
            <tr>
                ${columns.map(col => `<th>${this.escapeHtml(col)}</th>`).join('')}
            </tr>
        </thead>
        <tbody>
            ${result.rows!.map(row => `
                <tr>
                    ${columns.map(col => {
                        const value = row[col];
                        if (value === null || value === undefined) {
                            return '<td class="null-value">NULL</td>';
                        }
                        return `<td>${this.escapeHtml(String(value))}</td>`;
                    }).join('')}
                </tr>
            `).join('')}
        </tbody>
    </table>

    <script>
        const vscode = acquireVsCodeApi();

        function exportResults(format) {
            vscode.postMessage({ command: 'export', format: format });
        }

        function copyTable() {
            const table = document.querySelector('table');
            const text = Array.from(table.querySelectorAll('tr'))
                .map(row => Array.from(row.querySelectorAll('th, td'))
                    .map(cell => cell.textContent)
                    .join('\\t'))
                .join('\\n');
            vscode.postMessage({ command: 'copy', data: text });
        }

        function enableEditMode() {
            vscode.postMessage({ 
                command: 'enableEditMode',
                connectionId: '${this.editState.connectionId}',
                database: '${this.editState.database || ''}',
                query: \`${_query.replace(/`/g, '\\`').replace(/\\/g, '\\\\')}\`
            });
        }
    </script>
</body>
</html>`;
    }

    /**
     * Check if edit mode can be enabled for this query
     */
    private canEnableEditMode(query: string): boolean {
        const normalized = query.trim().toLowerCase();
        if (!normalized.startsWith('select')) return false;
        if (/\bjoin\b/i.test(query)) return false;
        if (/\bunion\b/i.test(query)) return false;
        if (/\bgroup\s+by\b/i.test(query)) return false;
        if ((query.match(/select/gi) || []).length > 1) return false;
        return true;
    }

    /**
     * Generate editable HTML content
     */
    private getEditableHtmlContent(result: QueryResult, _query: string): string {
        const showRowCount = vscode.workspace.getConfiguration('dbConnector').get('showRowCount', true);
        const columns = result.fields?.map(f => f.name) || Object.keys(result.rows![0] || {});
        const primaryKeys = this.editState.tableInfo?.primaryKeys || [];
        const tableName = this.editState.tableInfo?.tableName || 'Unknown';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Data - ${this.escapeHtml(tableName)}</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .toolbar {
            margin-bottom: 15px;
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        .toolbar-group {
            display: flex;
            gap: 5px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            border-radius: 2px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.save-btn {
            background-color: var(--vscode-testing-iconPassed);
        }
        button.discard-btn {
            background-color: var(--vscode-testing-iconFailed);
        }
        button.add-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .info {
            margin-left: auto;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        .edit-status {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.8em;
        }
        .edit-mode-banner {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
            padding: 8px 12px;
            margin-bottom: 10px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        th, td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
        }
        th {
            background-color: var(--vscode-editor-selectionBackground);
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        th.pk {
            background-color: var(--vscode-editorGutter-modifiedBackground);
        }
        tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
        }
        tr:hover {
            background-color: var(--vscode-list-activeSelectionBackground);
        }
        tr.deleted {
            background-color: var(--vscode-diffEditor-removedTextBackground) !important;
            text-decoration: line-through;
            opacity: 0.6;
        }
        tr.new-row {
            background-color: var(--vscode-diffEditor-insertedTextBackground) !important;
        }
        td.editable {
            cursor: pointer;
            position: relative;
        }
        td.editable:hover {
            background-color: var(--vscode-editor-hoverHighlightBackground);
        }
        td.editable:hover::after {
            content: '✏️';
            position: absolute;
            right: 4px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 10px;
            opacity: 0.5;
        }
        td.modified {
            background-color: var(--vscode-editorGutter-modifiedBackground) !important;
        }
        td.pk-cell {
            background-color: var(--vscode-editorGutter-background);
            font-weight: bold;
        }
        .null-value {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .cell-input {
            width: 100%;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px;
            font-family: inherit;
            font-size: inherit;
        }
        .row-actions {
            white-space: nowrap;
        }
        .row-actions button {
            padding: 2px 8px;
            font-size: 12px;
        }
        .delete-btn {
            background-color: var(--vscode-testing-iconFailed);
        }
    </style>
</head>
<body>
    <h2>✏️ Edit Data - ${this.escapeHtml(tableName)}</h2>
    
    <div class="edit-mode-banner">
        <span>📝 Edit Mode Active</span>
        <span class="edit-status" id="changeStatus">No changes</span>
        <span style="flex: 1"></span>
        <span style="font-size: 0.85em; color: var(--vscode-descriptionForeground);">
            Primary Key: ${primaryKeys.map(pk => this.escapeHtml(pk)).join(', ')}
        </span>
    </div>
    
    <div class="toolbar">
        <div class="toolbar-group">
            <button class="save-btn" id="saveBtn" onclick="saveChanges()" disabled>💾 Save Changes</button>
            <button class="discard-btn" onclick="discardChanges()">↩️ Discard</button>
        </div>
        <div class="toolbar-group">
            <button class="add-btn" onclick="addNewRow()">➕ Add Row</button>
        </div>
        <span class="info">
            ${showRowCount ? `${result.rowCount} rows` : ''} | ${result.executionTime}ms
        </span>
    </div>
    
    <table id="dataTable">
        <thead>
            <tr>
                <th class="row-actions">Actions</th>
                ${columns.map(col => {
                    const isPk = primaryKeys.includes(col);
                    return `<th class="${isPk ? 'pk' : ''}" title="${isPk ? 'Primary Key' : ''}">${isPk ? '🔑 ' : ''}${this.escapeHtml(col)}</th>`;
                }).join('')}
            </tr>
        </thead>
        <tbody>
            ${this.editState.currentRows.map((row, rowIndex) => {
                const isDeleted = row._isDeleted;
                const isNew = row._isNew;
                return `
                <tr data-row-index="${rowIndex}" class="${isDeleted ? 'deleted' : ''} ${isNew ? 'new-row' : ''}">
                    <td class="row-actions">
                        ${!isDeleted ? `<button class="delete-btn" onclick="deleteRow(${rowIndex})" title="Delete row">🗑️</button>` : 
                          `<button onclick="undeleteRow(${rowIndex})" title="Undo delete">↩️</button>`}
                    </td>
                    ${columns.map(col => {
                        const value = row[col];
                        const isPk = primaryKeys.includes(col);
                        const isEditable = !isPk && !isDeleted;
                        const displayValue = value === null || value === undefined 
                            ? '<span class="null-value">NULL</span>' 
                            : this.escapeHtml(String(value));
                        
                        return `<td 
                            class="${isPk ? 'pk-cell' : ''} ${isEditable ? 'editable' : ''}"
                            data-row="${rowIndex}" 
                            data-col="${col}"
                            data-value="${this.escapeHtml(String(value ?? ''))}"
                            ${isEditable ? `ondblclick="startEdit(this)"` : ''}
                        >${displayValue}</td>`;
                    }).join('')}
                </tr>`;
            }).join('')}
        </tbody>
    </table>

    <script>
        const vscode = acquireVsCodeApi();
        const columns = ${JSON.stringify(columns)};
        const primaryKeys = ${JSON.stringify(primaryKeys)};
        let editingCell = null;
        let hasChanges = false;

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateEditStatus') {
                updateStatus(message.hasChanges, message.changeCount);
            }
        });

        function updateStatus(hasChanges, changeCount) {
            const status = document.getElementById('changeStatus');
            const saveBtn = document.getElementById('saveBtn');
            
            if (hasChanges) {
                const parts = [];
                if (changeCount.updates > 0) parts.push(changeCount.updates + ' modified');
                if (changeCount.inserts > 0) parts.push(changeCount.inserts + ' new');
                if (changeCount.deletes > 0) parts.push(changeCount.deletes + ' deleted');
                status.textContent = parts.join(', ');
                status.style.backgroundColor = 'var(--vscode-editorGutter-modifiedBackground)';
                saveBtn.disabled = false;
            } else {
                status.textContent = 'No changes';
                status.style.backgroundColor = '';
                saveBtn.disabled = true;
            }
        }

        function startEdit(cell) {
            if (editingCell) {
                finishEdit(editingCell, false);
            }

            const value = cell.dataset.value;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'cell-input';
            input.value = value === 'null' || value === 'undefined' ? '' : value;
            
            cell.innerHTML = '';
            cell.appendChild(input);
            input.focus();
            input.select();

            editingCell = cell;

            input.addEventListener('blur', () => finishEdit(cell, true));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    finishEdit(cell, true);
                } else if (e.key === 'Escape') {
                    finishEdit(cell, false);
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    finishEdit(cell, true);
                    // Move to next editable cell
                    const nextCell = findNextEditableCell(cell, e.shiftKey);
                    if (nextCell) startEdit(nextCell);
                }
            });
        }

        function finishEdit(cell, save) {
            const input = cell.querySelector('input');
            if (!input) return;

            const oldValue = cell.dataset.value;
            const newValue = save ? input.value : oldValue;
            
            cell.dataset.value = newValue;
            cell.innerHTML = newValue === '' ? '<span class="null-value">NULL</span>' : escapeHtml(newValue);
            
            editingCell = null;

            if (save && oldValue !== newValue) {
                cell.classList.add('modified');
                const rowIndex = parseInt(cell.dataset.row);
                const column = cell.dataset.col;
                
                vscode.postMessage({
                    command: 'cellChanged',
                    change: {
                        rowIndex: rowIndex,
                        column: column,
                        oldValue: oldValue === '' ? null : oldValue,
                        newValue: newValue === '' ? null : newValue
                    }
                });
            }
        }

        function findNextEditableCell(currentCell, backwards) {
            const cells = Array.from(document.querySelectorAll('td.editable'));
            const currentIndex = cells.indexOf(currentCell);
            const nextIndex = backwards ? currentIndex - 1 : currentIndex + 1;
            return cells[nextIndex];
        }

        function deleteRow(rowIndex) {
            const row = document.querySelector('tr[data-row-index="' + rowIndex + '"]');
            if (row) {
                row.classList.add('deleted');
                vscode.postMessage({ command: 'deleteRow', rowIndex: rowIndex });
            }
        }

        function undeleteRow(rowIndex) {
            // Would need to track and restore - for now, just discard all changes
            discardChanges();
        }

        function addNewRow() {
            const newRowData = {};
            columns.forEach(col => {
                if (!primaryKeys.includes(col)) {
                    newRowData[col] = null;
                }
            });
            vscode.postMessage({ command: 'addRow', row: newRowData });
        }

        function saveChanges() {
            vscode.postMessage({ command: 'saveChanges' });
        }

        function discardChanges() {
            vscode.postMessage({ command: 'discardChanges' });
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
    }

    /**
     * Export results to file
     */
    private async exportResults(format: string, index?: number): Promise<void> {
        // Get the result to export
        let resultToExport: QueryResult | undefined;
        
        if (this.currentResults && index !== undefined) {
            // Multiple results - export specific one
            resultToExport = this.currentResults[index]?.result;
        } else {
            // Single result
            resultToExport = this.currentResult;
        }

        if (!resultToExport || !resultToExport.rows) {
            vscode.window.showWarningMessage('No results to export');
            return;
        }

        const fileExtension = format === 'json' ? 'json' : 'csv';
        const fileName = index !== undefined ? `query_${index + 1}_results` : 'query_results';
        const uri = await vscode.window.showSaveDialog({
            filters: {
                [format.toUpperCase()]: [fileExtension]
            },
            defaultUri: vscode.Uri.file(`${fileName}.${fileExtension}`)
        });

        if (!uri) {
            return;
        }

        try {
            let content: string;

            if (format === 'json') {
                content = JSON.stringify(resultToExport.rows, null, 2);
            } else {
                content = this.convertToCSV(resultToExport.rows);
            }

            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
            vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
        } catch (error) {
            Logger.error('Failed to export results', error as Error);
            vscode.window.showErrorMessage(`Export failed: ${(error as Error).message}`);
        }
    }

    /**
     * Convert rows to CSV format
     */
    private convertToCSV(rows: any[]): string {
        if (rows.length === 0) {
            return '';
        }

        const columns = Object.keys(rows[0]);
        const header = columns.map(col => this.escapeCsvValue(col)).join(',');

        const dataRows = rows.map(row =>
            columns.map(col => {
                const value = row[col];
                return this.escapeCsvValue(value === null || value === undefined ? '' : String(value));
            }).join(',')
        );

        return [header, ...dataRows].join('\n');
    }

    /**
     * Escape CSV value
     */
    private escapeCsvValue(value: string): string {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    /**
     * Copy data to clipboard
     */
    private async copyToClipboard(data: string): Promise<void> {
        await vscode.env.clipboard.writeText(data);
        vscode.window.showInformationMessage('Results copied to clipboard');
    }

    /**
     * Escape HTML
     */
    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}
