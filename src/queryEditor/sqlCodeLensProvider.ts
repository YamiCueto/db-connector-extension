import * as vscode from 'vscode';

/**
 * CodeLens provider for SQL files
 * Shows "▶ Run Query" buttons above SQL statements
 */
export class SqlCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {
        // Refresh CodeLens when document changes
        vscode.workspace.onDidChangeTextDocument(() => {
            this._onDidChangeCodeLenses.fire();
        });
    }

    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        
        // Find all SQL statements (separated by semicolons or by query blocks)
        const queries = this.findQueries(text, document);
        
        for (const query of queries) {
            // Add "Run Query" CodeLens
            const runLens = new vscode.CodeLens(query.range, {
                title: "▶ Run Query",
                command: "dbConnector.executeQueryAtCursor",
                arguments: [query.range],
                tooltip: "Execute this SQL query"
            });
            codeLenses.push(runLens);

            // Add "Run All" at the top of the document (only once)
            if (query === queries[0] && queries.length > 1) {
                const runAllLens = new vscode.CodeLens(query.range, {
                    title: "▶▶ Run All Queries",
                    command: "dbConnector.executeQuery",
                    tooltip: "Execute all queries in this file"
                });
                codeLenses.push(runAllLens);
            }
        }

        return codeLenses;
    }

    /**
     * Find all SQL queries in the document
     */
    private findQueries(text: string, document: vscode.TextDocument): { range: vscode.Range; text: string }[] {
        const queries: { range: vscode.Range; text: string }[] = [];
        
        // Skip header comments (-- Connection:, -- Database:, etc.)
        const lines = text.split('\n');
        let queryStart = -1;
        let queryText = '';
        let inQuery = false;
        let skipHeaderLines = 0;

        // Count header lines to skip
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('--') && (
                line.toLowerCase().includes('connection:') ||
                line.toLowerCase().includes('database:') ||
                line.toLowerCase().includes('table:')
            )) {
                skipHeaderLines = i + 1;
            } else if (line && !line.startsWith('--')) {
                break;
            }
        }

        // Parse queries
        for (let i = skipHeaderLines; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip empty lines and comments between queries
            if (!trimmedLine || trimmedLine.startsWith('--')) {
                if (inQuery && queryText.trim()) {
                    // End current query if we hit empty line or comment
                    const endPos = document.lineAt(i - 1).range.end;
                    queries.push({
                        range: new vscode.Range(
                            new vscode.Position(queryStart, 0),
                            endPos
                        ),
                        text: queryText.trim()
                    });
                    queryText = '';
                    inQuery = false;
                    queryStart = -1;
                }
                continue;
            }

            // Start new query
            if (!inQuery) {
                queryStart = i;
                inQuery = true;
            }

            queryText += line + '\n';

            // Check if query ends with semicolon
            if (trimmedLine.endsWith(';')) {
                const endPos = document.lineAt(i).range.end;
                queries.push({
                    range: new vscode.Range(
                        new vscode.Position(queryStart, 0),
                        endPos
                    ),
                    text: queryText.trim()
                });
                queryText = '';
                inQuery = false;
                queryStart = -1;
            }
        }

        // Handle last query without semicolon
        if (inQuery && queryText.trim()) {
            const lastLine = lines.length - 1;
            queries.push({
                range: new vscode.Range(
                    new vscode.Position(queryStart, 0),
                    document.lineAt(lastLine).range.end
                ),
                text: queryText.trim()
            });
        }

        // If no queries found but there's content, treat whole file as one query
        if (queries.length === 0) {
            const firstContentLine = this.findFirstContentLine(lines, skipHeaderLines);
            if (firstContentLine >= 0) {
                queries.push({
                    range: new vscode.Range(
                        new vscode.Position(firstContentLine, 0),
                        document.lineAt(document.lineCount - 1).range.end
                    ),
                    text: text
                });
            }
        }

        return queries;
    }

    /**
     * Find first non-empty, non-comment line
     */
    private findFirstContentLine(lines: string[], startFrom: number): number {
        for (let i = startFrom; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line && !line.startsWith('--') && !line.startsWith('//')) {
                return i;
            }
        }
        return -1;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}
