# Quick Start Guide

Get up and running with DB Connector Extension in 5 minutes!

## Installation & First Run

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start Development

```bash
# Option A: Open in VS Code and press F5
# Option B: Run this command
npm run watch
```

Then press `F5` in VS Code to launch the extension.

## Your First Database Connection

### For MySQL/MariaDB

1. **Open Command Palette**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)
2. **Run**: Type "DB Connector: Add Database Connection"
3. **Select**: Choose "MySQL" or "MariaDB"
4. **Enter Details**:
   - Name: `My Local MySQL`
   - Host: `localhost`
   - Port: `3306`
   - Username: `root`
   - Password: `your-password`
   - Database: (leave empty or enter database name)
5. **Test & Save**: Extension will test connection automatically

### For PostgreSQL

Same steps as MySQL, but:
- Select: "PostgreSQL"
- Port: `5432` (default)
- Database: `postgres` (or your database)

### For SQL Server (MSSQL)

Same steps, but:
- Select: "SQL Server (MSSQL)"
- Port: `1433` (default)

### For MongoDB

Same steps, but:
- Select: "MongoDB"
- Port: `27017` (default)
- Database: `admin` (or your database)

## Connecting & Browsing

1. **Open Database Connections View**: Look for the database icon in the Activity Bar (left sidebar)
2. **Connect**: Click the plug icon next to your connection
3. **Browse**: Expand the connection to see:
   - Databases
   - Tables/Collections
   - Columns/Fields

## Running Your First Query

### SQL Query (MySQL, PostgreSQL, MSSQL)

1. **New Query**: Right-click your connection → "New Query"
2. **Write SQL**:
   ```sql
   SELECT * FROM your_table LIMIT 10;
   ```
3. **Execute**: Click the play button (▶) in the editor toolbar or press `F5`
4. **View Results**: Results appear in a new panel

### MongoDB Query

1. **New Query**: Right-click your MongoDB connection → "New Query"
2. **Write Query**:
   ```javascript
   db.collection('users').find({}).limit(10).toArray()
   ```
3. **Execute**: Click play button or press `F5`
4. **View Results**: See your documents in the results panel

## Exporting Results

After running a query:
1. **Find Export Buttons** in the results panel
2. **Choose Format**: Click "Export as CSV" or "Export as JSON"
3. **Save File**: Choose location and save

## Viewing Query History

1. **Open Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P`
2. **Run**: "DB Connector: Show Query History"
3. **Select Query**: Click to open it in a new editor

## Tips & Tricks

### Execute Selected Text Only

1. Highlight part of your query
2. Press `F5` or click play
3. Only the selected text will execute

### Multiple Connections

You can:
- Connect to multiple databases simultaneously
- Switch between them when executing queries
- View them all in the tree view

### Keyboard Shortcuts

- `F5`: Execute query
- `Ctrl+Shift+P`: Command palette
- `Ctrl+Shift+E`: Focus explorer (to see connections)

## Common Tasks

### Disconnect from Database

- Right-click connection → "Disconnect"
- Or click the disconnect icon

### Remove Connection

- Right-click connection → "Remove Connection"
- Confirm deletion

### Refresh Tree View

- Click refresh icon in tree view toolbar
- Or right-click → "Refresh Connection"

## Configuration

Open VS Code settings and search for "dbConnector":

```json
{
  "dbConnector.connectionTimeout": 30000,
  "dbConnector.queryTimeout": 60000,
  "dbConnector.showRowCount": true
}
```

## Troubleshooting Quick Fixes

### Can't Connect?

✅ Check database is running
✅ Verify host and port
✅ Test credentials in database client
✅ Check firewall settings

### Query Won't Execute?

✅ Make sure you're connected (green icon)
✅ Select the right connection when prompted
✅ Check query syntax
✅ View logs: Output panel → "DB Connector"

### Extension Won't Load?

✅ Reload window: `Ctrl+Shift+P` → "Reload Window"
✅ Check for errors: Help → Toggle Developer Tools → Console

## Example Queries

### MySQL/PostgreSQL

```sql
-- Select data
SELECT * FROM users WHERE age > 18;

-- Join tables
SELECT o.id, u.name, o.total
FROM orders o
JOIN users u ON o.user_id = u.id;

-- Insert data
INSERT INTO users (name, email) VALUES ('John', 'john@example.com');

-- Update data
UPDATE users SET status = 'active' WHERE id = 1;
```

### MongoDB

```javascript
// Find documents
db.collection('users').find({ age: { $gt: 18 } }).toArray()

// Aggregate
db.collection('orders').aggregate([
  { $group: { _id: '$user_id', total: { $sum: '$amount' } } }
]).toArray()

// Insert
db.collection('users').insertOne({ name: 'John', email: 'john@example.com' })

// Update
db.collection('users').updateOne(
  { _id: ObjectId('...') },
  { $set: { status: 'active' } }
)
```

## Next Steps

1. ✅ **Explore**: Browse your database structure
2. ✅ **Query**: Run some test queries
3. ✅ **Export**: Try exporting results
4. ✅ **History**: Check your query history
5. ✅ **Configure**: Customize settings to your preference

## Need More Help?

- 📖 Read the full [README.md](README.md)
- 🛠️ Check the [SETUP.md](SETUP.md) for development
- 📝 Review [CHANGELOG.md](CHANGELOG.md) for features
- 🐛 Report issues on GitHub

Happy querying! 🚀
