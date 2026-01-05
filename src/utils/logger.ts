import * as vscode from 'vscode';

/**
 * Logger utility for the extension
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel;

    /**
     * Initialize the logger
     */
    public static initialize(context: vscode.ExtensionContext): void {
        Logger.outputChannel = vscode.window.createOutputChannel('DB Connector');
        context.subscriptions.push(Logger.outputChannel);
    }

    /**
     * Log an info message
     */
    public static info(message: string, ...args: any[]): void {
        const formattedMessage = Logger.formatMessage('INFO', message, ...args);
        Logger.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Log a warning message
     */
    public static warn(message: string, ...args: any[]): void {
        const formattedMessage = Logger.formatMessage('WARN', message, ...args);
        Logger.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Log an error message
     */
    public static error(message: string, error?: Error, ...args: any[]): void {
        const formattedMessage = Logger.formatMessage('ERROR', message, ...args);
        Logger.outputChannel.appendLine(formattedMessage);

        if (error) {
            Logger.outputChannel.appendLine(`  Error: ${error.message}`);
            if (error.stack) {
                Logger.outputChannel.appendLine(`  Stack: ${error.stack}`);
            }
        }
    }

    /**
     * Log a debug message
     */
    public static debug(message: string, ...args: any[]): void {
        const formattedMessage = Logger.formatMessage('DEBUG', message, ...args);
        Logger.outputChannel.appendLine(formattedMessage);
    }

    /**
     * Show the output channel
     */
    public static show(): void {
        Logger.outputChannel.show();
    }

    /**
     * Format a log message
     */
    private static formatMessage(level: string, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        let formattedMessage = `[${timestamp}] [${level}] ${message}`;

        if (args.length > 0) {
            formattedMessage += ' ' + args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
        }

        return formattedMessage;
    }
}
