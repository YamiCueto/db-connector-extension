# [1.4.0] - 2026-06-13

### Improved

#### Results Panel — UX & Security
- **Column Sorting**: Click any column header to sort ascending/descending (▲/▼ indicator). Uses locale-aware numeric sorting.
- **Pagination**: Results are now paginated in pages of 200 rows with First/Prev/Next/Last controls. Eliminates browser freezing on large datasets.
- **Date Formatting**: Date/DateTime values now display as `YYYY-MM-DD HH:MM:SS` instead of the raw JavaScript Date string (e.g. `Tue Apr 28 2026 16:30:46 GMT-0500 ...`).
- **Row count pluralization**: Status bar now correctly shows `1 row` instead of `1 rows`.

### Fixed

- **Security**: Query text and connection metadata are now passed to the webview via `JSON.stringify` instead of raw string interpolation inside `<script>` tags, eliminating potential XSS/script injection.

---

# [1.3.0] - 2026-01-18

### Fixed

- **MSSQL Primary Key Detection**: Ahora la detección de claves primarias ignora mayúsculas, minúsculas y corchetes, permitiendo editar tablas con PK aunque el nombre esté entre corchetes o con distinto casing.
- **Edición habilitada para tablas MSSQL con PK**: Ya puedes editar cualquier tabla con clave primaria en SQL Server, sin importar el formato del nombre.

---
# Change Log

All notable changes to the "DB Connector Extension" will be documented in this file.

## [1.2.0] - 2026-01-15

### Added

#### Data Editing in Results
- **Edit Mode**: Click "✏️ Edit Data" button to enable editing on SELECT query results
- **Inline Editing**: Double-click any cell to edit its value
- **Add Rows**: Add new rows with "➕ Add Row" button
- **Delete Rows**: Remove rows with "🗑️" button per row
- **Save Changes**: Generates and executes UPDATE/INSERT/DELETE statements
- **Discard Changes**: Revert all modifications
- **Primary Key Detection**: Automatically detects PKs to build WHERE clauses
- **Visual Indicators**:
  - 🔑 Primary key columns highlighted (non-editable)
  - 🟡 Modified cells marked
  - 🟢 New rows with green background
  - 🔴 Deleted rows shown with strikethrough
- **Change Counter**: Shows pending updates, inserts, and deletes
- **Multi-database Support**: SQL generation adapts to MySQL, PostgreSQL, MSSQL, MariaDB

### Limitations
- Only simple SELECT queries are editable (no JOINs, UNIONs, subqueries, GROUP BY)
- Table must have a primary key

---

## [1.1.0] - 2026-01-15

### Added

#### Edit Connection
- Full connection editing with validation
- Test connection before saving changes
- SSL configuration options
- Password change option
- Reconnect after edit for active connections

#### Import/Export Connections
- Export connections to JSON file
- Selective export (all or specific connections)
- Optional password inclusion in export
- Import with duplicate handling (rename, skip, replace)
- Backup and share connection configurations

#### Multi-Query Execution
- Execute multiple queries separated by semicolon
- Tabbed results panel for each query
- Individual export/copy per result
- Progress indicator with cancellation support
- Smart query splitting respecting strings and comments

#### Query Templates
- 10 SQL templates (SELECT, INSERT, UPDATE, DELETE, COUNT, DISTINCT, JOIN, CREATE, ALTER, DROP)
- MongoDB templates support
- Context menu integration on tables
- Auto-fill with table columns

#### SQL IntelliSense (Autocomplete)
- SQL keywords completion
- SQL functions with snippets
- Table and column suggestions from connected databases
- 14 code snippets (sel, selw, ins, upd, del, cte, case, join, ljoin, grp, sub, exist, ctab, idx)
- Schema caching with 5-minute timeout

#### CodeLens (Run Query Buttons)
- "▶ Run Query" button above each SQL statement
- "▶▶ Run All Queries" for files with multiple queries
- Click to execute individual queries
- Query highlighting during execution

#### Auto-detect Connection
- File header comments to specify connection and database
- Format: `-- Connection: ConnectionName` and `-- Database: DatabaseName`
- Automatic connection selection when executing queries
- Skip connection picker when only one connection is active

#### Keyboard Shortcuts
- `F5` - Execute query
- `Ctrl+Enter` / `Cmd+Enter` - Execute query
- Context menu "DB Connector: Execute Query"

### Fixed
- Connection state detection using ConnectionState enum
- Webpack warnings for optional MongoDB/PostgreSQL dependencies

### Changed
- Improved query executor with better error handling
- Enhanced results panel with tabbed interface
- Better logging and diagnostics

---

## [1.0.0] - Initial Release

### Added
- Multi-database support for MySQL, PostgreSQL, SQL Server, MongoDB, and MariaDB
- Secure credential storage using VS Code Secret Storage API
- Database explorer tree view
- Query execution with results panel
- Query history tracking
- Export results to CSV and JSON
- Connection management (add, remove, connect, disconnect)
- Status bar showing active connections
- Syntax highlighting for SQL and MongoDB queries
- Webview results panel with rich formatting
- Configuration options for timeouts and display preferences

---

## [0.0.1] - Initial Release

### Added
- Multi-database support for MySQL, PostgreSQL, SQL Server, MongoDB, and MariaDB
- Secure credential storage using VS Code Secret Storage API
- Database explorer tree view
- Query execution with results panel
- Query history tracking
- Export results to CSV and JSON
- Connection management (add, remove, connect, disconnect)
- Status bar showing active connections
- Syntax highlighting for SQL and MongoDB queries
- Webview results panel with rich formatting
- Configuration options for timeouts and display preferences

### Features
- **Connection Manager**: Manage multiple database connections
- **Tree View**: Browse databases, tables/collections, and columns/fields
- **Query Executor**: Execute SQL and MongoDB queries
- **Results Panel**: View and export query results
- **Query History**: Track and replay queries
- **Secure Storage**: Passwords stored securely

### Known Issues
- SSH tunnel support not yet implemented
- Connection edit functionality placeholder
- MongoDB query parsing is simplified

### Coming Soon
- SSH tunnel support
- Enhanced MongoDB query editor
- Connection grouping and folders
- Query autocomplete
- Schema comparison tools
- Data editing capabilities
