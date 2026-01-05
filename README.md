# DB Connector Extension

A powerful VS Code extension for managing and querying multiple database connections. Supports MySQL, PostgreSQL, SQL Server (MSSQL), MongoDB, and MariaDB.

## Features

- **Multi-Database Support**: Connect to MySQL, PostgreSQL, SQL Server, MongoDB, and MariaDB
- **Secure Credential Storage**: Passwords stored securely using VS Code's Secret Storage API
- **Database Explorer**: Tree view showing connections, databases, tables/collections, and columns/fields
- **Query Editor**: Execute SQL and MongoDB queries with syntax highlighting
- **Results Viewer**: View query results in a rich webview panel
- **Query History**: Track and replay previous queries
- **Export Results**: Export query results to CSV or JSON
- **Multiple Connections**: Work with multiple database connections simultaneously

## Installation

### From Source

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Press `F5` to run the extension in debug mode

### From VSIX

1. Download the `.vsix` file
2. Open VS Code
3. Go to Extensions view (`Ctrl+Shift+X`)
4. Click the `...` menu and select "Install from VSIX..."

## Getting Started

### Adding a Database Connection

1. Open the Database Connections view in the Explorer sidebar
2. Click the `+` icon or run the command "DB Connector: Add Database Connection"
3. Select your database type (MySQL, PostgreSQL, MSSQL, MongoDB, or MariaDB)
4. Enter connection details:
   - Connection name
   - Host
   - Port
   - Username
   - Password
   - Database (optional)
5. The extension will test the connection before saving

### Connecting to a Database

1. In the Database Connections view, find your connection
2. Click the connect icon or right-click and select "Connect"
3. Once connected, expand the connection to view databases, tables, and columns

### Executing Queries

#### SQL Databases (MySQL, PostgreSQL, MSSQL, MariaDB)

1. Right-click a connection and select "New Query"
2. Write your SQL query
3. Click the play icon in the editor toolbar or run "DB Connector: Execute Query"
4. Results will appear in a new panel

#### MongoDB

1. Right-click a MongoDB connection and select "New Query"
2. Write your MongoDB query in JavaScript format:
   ```javascript
   db.collection('users').find({age: {$gt: 18}}).toArray()
   ```
3. Execute the query to see results

### Viewing Query Results

Query results appear in a webview panel with the following features:

- **Tabular View**: Results displayed in a sortable table
- **Export**: Export results to CSV or JSON
- **Copy**: Copy results to clipboard
- **Statistics**: View row count and execution time

## Configuration

Configure the extension through VS Code settings:

```json
{
  "dbConnector.connectionTimeout": 30000,
  "dbConnector.queryTimeout": 60000,
  "dbConnector.maxQueryHistorySize": 100,
  "dbConnector.autoExpandTreeItems": false,
  "dbConnector.showRowCount": true,
  "dbConnector.resultPageSize": 1000
}
```

### Configuration Options

- `connectionTimeout`: Connection timeout in milliseconds (default: 30000)
- `queryTimeout`: Query execution timeout in milliseconds (default: 60000)
- `maxQueryHistorySize`: Maximum number of queries to keep in history (default: 100)
- `autoExpandTreeItems`: Automatically expand tree items when connecting (default: false)
- `showRowCount`: Show row count in query results (default: true)
- `resultPageSize`: Number of rows to display per page (default: 1000)

## Commands

- `DB Connector: Add Database Connection` - Add a new database connection
- `DB Connector: Remove Connection` - Remove a database connection
- `DB Connector: Edit Connection` - Edit connection settings
- `DB Connector: Connect` - Connect to a database
- `DB Connector: Disconnect` - Disconnect from a database
- `DB Connector: Refresh Connection` - Refresh the tree view
- `DB Connector: Execute Query` - Execute the current query
- `DB Connector: New Query` - Create a new query file
- `DB Connector: Show Query History` - View query history
- `DB Connector: Export Results` - Export query results

## Keyboard Shortcuts

- `Ctrl+Shift+E` (or `Cmd+Shift+E` on Mac) - Execute query
- `F5` - Execute query (when in SQL/MongoDB file)

## Security

- Passwords are stored securely using VS Code's Secret Storage API
- Credentials are never stored in plain text
- Connections use SSL/TLS when configured
- SSH tunneling support for secure remote connections

## Database Support

### MySQL / MariaDB

- Full SQL syntax support
- View databases, tables, columns
- Execute queries and view results
- Support for stored procedures and functions

### PostgreSQL

- Full SQL syntax support
- Schema and table exploration
- Support for custom types and extensions
- Transaction support

### SQL Server (MSSQL)

- T-SQL syntax support
- Database and schema exploration
- Support for stored procedures
- Windows and SQL authentication

### MongoDB

- JavaScript query syntax
- Collection and field exploration
- Document sampling for schema inference
- Support for aggregation pipelines

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Build production bundle
npm run package

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
db-connector-extension/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── connectionManager.ts      # Connection management
│   ├── types.ts                  # TypeScript interfaces
│   ├── databaseProviders/        # Database-specific providers
│   │   ├── mysqlProvider.ts
│   │   ├── postgresProvider.ts
│   │   ├── mssqlProvider.ts
│   │   ├── mongoProvider.ts
│   │   └── mariadbProvider.ts
│   ├── treeView/                 # Tree view components
│   │   ├── databaseTreeProvider.ts
│   │   └── treeItems.ts
│   ├── queryEditor/              # Query execution
│   │   ├── queryExecutor.ts
│   │   └── resultsPanel.ts
│   └── utils/                    # Utilities
│       ├── encryption.ts
│       └── logger.ts
├── resources/                    # Icons and resources
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript config
└── webpack.config.js             # Webpack config
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting and formatting
6. Submit a pull request

## Troubleshooting

### Connection Issues

- Verify host, port, username, and password
- Check firewall settings
- Ensure the database server is running
- Try enabling SSL if required

### Query Execution Errors

- Check query syntax
- Verify you have permission to execute the query
- Check the database connection is active
- Review error messages in the output panel

### Extension Logs

View extension logs:
1. Open the Output panel (`Ctrl+Shift+U`)
2. Select "DB Connector" from the dropdown

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests:
- Create an issue on GitHub
- Check existing issues for solutions
- Review the documentation

## Roadmap

- [ ] SSH tunnel support
- [ ] Connection grouping
- [ ] Query autocomplete
- [ ] Schema diff tool
- [ ] Data editing in results
- [ ] Import/export connections
- [ ] Multi-query execution
- [ ] Query performance analytics

## Acknowledgments

Built with:
- [VS Code Extension API](https://code.visualstudio.com/api)
- [mysql2](https://github.com/sidorares/node-mysql2)
- [pg](https://github.com/brianc/node-postgres)
- [mssql](https://github.com/tediousjs/node-mssql)
- [mongodb](https://github.com/mongodb/node-mongodb-native)
