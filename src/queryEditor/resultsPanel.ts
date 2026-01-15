import * as vscode from 'vscode';
import { QueryResult } from '../types';
import { Logger } from '../utils/logger';
import { MultiQueryResult } from './queryExecutor';

/**
 * Results panel for displaying query results
 */
export class ResultsPanel {
    private static currentPanel: ResultsPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private currentResult: QueryResult | undefined;
    private currentResults: MultiQueryResult[] | undefined;

    private constructor(panel: vscode.WebviewPanel, private context: vscode.ExtensionContext) {
        this.panel = panel;

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'export':
                        this.exportResults(message.format, message.index);
                        break;
                    case 'copy':
                        this.copyToClipboard(message.data);
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
    public static show(context: vscode.ExtensionContext, result: QueryResult, query: string): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (ResultsPanel.currentPanel) {
            ResultsPanel.currentPanel.panel.reveal(column);
            ResultsPanel.currentPanel.updateResults(result, query);
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
        ResultsPanel.currentPanel.updateResults(result, query);
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
    private updateResults(result: QueryResult, query: string): void {
        this.currentResult = result;
        this.currentResults = undefined;
        this.panel.webview.html = this.getHtmlContent(result, query);
    }

    /**
     * Update results in the panel (multiple queries)
     */
    private updateMultipleResults(results: MultiQueryResult[]): void {
        this.currentResults = results;
        this.currentResult = results[0]?.result;
        this.panel.webview.html = this.getMultipleResultsHtml(results);
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
        <button onclick="exportResults('csv')">Export as CSV</button>
        <button onclick="exportResults('json')">Export as JSON</button>
        <button onclick="copyTable()">Copy to Clipboard</button>
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
