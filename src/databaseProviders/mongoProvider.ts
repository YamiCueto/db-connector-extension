import { MongoClient, Db } from 'mongodb';
import {
    IMongoDBProvider,
    ConnectionConfig,
    ConnectionState,
    DatabaseType,
    DatabaseInfo,
    TableInfo,
    ColumnInfo,
    CollectionInfo,
    FieldInfo,
    QueryResult
} from '../types';
import { Logger } from '../utils/logger';

/**
 * MongoDB database provider
 */
export class MongoDBProvider implements IMongoDBProvider {
    private client: MongoClient | null = null;
    private state: ConnectionState = ConnectionState.Disconnected;

    /**
     * Connect to MongoDB database
     */
    public async connect(config: ConnectionConfig, password: string): Promise<void> {
        try {
            this.state = ConnectionState.Connecting;

            const uri = this.buildConnectionUri(config, password);
            this.client = new MongoClient(uri, {
                serverSelectionTimeoutMS: 30000,
                connectTimeoutMS: 30000,
                ...config.options
            });

            await this.client.connect();
            // Test connection
            await this.client.db('admin').command({ ping: 1 });

            this.state = ConnectionState.Connected;
            Logger.info(`Connected to MongoDB: ${config.host}:${config.port}`);
        } catch (error) {
            this.state = ConnectionState.Error;
            Logger.error('MongoDB connection failed', error as Error);
            throw error;
        }
    }

    /**
     * Disconnect from MongoDB database
     */
    public async disconnect(): Promise<void> {
        try {
            if (this.client) {
                await this.client.close();
                this.client = null;
            }
            this.state = ConnectionState.Disconnected;
            Logger.info('Disconnected from MongoDB');
        } catch (error) {
            Logger.error('MongoDB disconnect failed', error as Error);
            throw error;
        }
    }

    /**
     * Test MongoDB connection
     */
    public async testConnection(config: ConnectionConfig, password: string): Promise<boolean> {
        let testClient: MongoClient | null = null;
        try {
            const uri = this.buildConnectionUri(config, password);
            testClient = new MongoClient(uri, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000
            });

            await testClient.connect();
            await testClient.db('admin').command({ ping: 1 });
            await testClient.close();
            return true;
        } catch (error) {
            Logger.error('MongoDB connection test failed', error as Error);
            if (testClient) {
                await testClient.close();
            }
            return false;
        }
    }

    /**
     * Get list of databases with collections
     */
    public async getDatabases(): Promise<DatabaseInfo[]> {
        this.ensureConnected();

        try {
            const adminDb = this.client!.db('admin');
            const { databases } = await adminDb.admin().listDatabases();

            const databaseInfos: DatabaseInfo[] = [];

            for (const db of databases) {
                const database = this.client!.db(db.name);
                const collections = await database.listCollections().toArray();

                const collectionInfos: CollectionInfo[] = await Promise.all(
                    collections.map(async (coll) => {
                        try {
                            const count = await database.collection(coll.name).estimatedDocumentCount();
                            return {
                                name: coll.name,
                                documentCount: count
                            };
                        } catch (error) {
                            return {
                                name: coll.name
                            };
                        }
                    })
                );

                databaseInfos.push({
                    name: db.name,
                    collections: collectionInfos
                });
            }

            return databaseInfos;
        } catch (error) {
            Logger.error('Failed to get databases', error as Error);
            throw error;
        }
    }

    /**
     * Get collections for a database
     */
    public async getCollections(database: string): Promise<CollectionInfo[]> {
        this.ensureConnected();

        try {
            const db = this.client!.db(database);
            const collections = await db.listCollections().toArray();

            return await Promise.all(
                collections.map(async (coll) => {
                    try {
                        const count = await db.collection(coll.name).estimatedDocumentCount();
                        return {
                            name: coll.name,
                            documentCount: count
                        };
                    } catch (error) {
                        return {
                            name: coll.name
                        };
                    }
                })
            );
        } catch (error) {
            Logger.error('Failed to get collections', error as Error);
            throw error;
        }
    }

    /**
     * Get fields for a collection (by sampling documents)
     */
    public async getFields(database: string, collection: string): Promise<FieldInfo[]> {
        this.ensureConnected();

        try {
            const db = this.client!.db(database);
            const coll = db.collection(collection);

            // Sample a few documents to infer schema
            const samples = await coll.find().limit(10).toArray();

            if (samples.length === 0) {
                return [];
            }

            // Collect all unique field names and types
            const fieldMap = new Map<string, Set<string>>();

            samples.forEach(doc => {
                this.extractFields(doc, fieldMap);
            });

            return Array.from(fieldMap.entries()).map(([name, types]) => ({
                name,
                type: Array.from(types).join(' | '),
                isRequired: samples.every(doc => this.hasField(doc, name))
            }));
        } catch (error) {
            Logger.error('Failed to get fields', error as Error);
            throw error;
        }
    }

    /**
     * Not applicable for MongoDB (returns empty array)
     */
    public async getTables(_database: string): Promise<TableInfo[]> {
        return [];
    }

    /**
     * Not applicable for MongoDB (returns empty array)
     */
    public async getColumns(_database: string, _table: string): Promise<ColumnInfo[]> {
        return [];
    }

    /**
     * Execute a MongoDB query
     */
    public async executeQuery(query: string, database?: string): Promise<QueryResult> {
        this.ensureConnected();

        const startTime = Date.now();
        try {
            const db = this.client!.db(database || 'test');

            // Parse and execute the query
            // This is a simplified version - in production, you'd want more robust parsing
            const result = await this.executeMongoQuery(db, query);
            const executionTime = Date.now() - startTime;

            if (Array.isArray(result)) {
                return {
                    rows: result,
                    rowCount: result.length,
                    executionTime
                };
            } else {
                return {
                    rows: [result],
                    rowCount: 1,
                    executionTime
                };
            }
        } catch (error) {
            const executionTime = Date.now() - startTime;
            Logger.error('Query execution failed', error as Error);
            return {
                rowCount: 0,
                executionTime,
                error: (error as Error).message
            };
        }
    }

    /**
     * Get connection state
     */
    public getState(): ConnectionState {
        return this.state;
    }

    /**
     * Get database type
     */
    public getType(): DatabaseType {
        return DatabaseType.MongoDB;
    }

    /**
     * Build MongoDB connection URI
     */
    private buildConnectionUri(config: ConnectionConfig, password: string): string {
        const auth = `${encodeURIComponent(config.username)}:${encodeURIComponent(password)}`;
        const ssl = config.ssl ? '?ssl=true' : '';
        return `mongodb://${auth}@${config.host}:${config.port}/${config.database || 'admin'}${ssl}`;
    }

    /**
     * Execute MongoDB query (simplified)
     */
    private async executeMongoQuery(db: Db, query: string): Promise<any> {
        // This is a very simplified implementation
        // In production, you'd want a proper MongoDB query parser
        try {
            // Try to evaluate as JavaScript
            const func = new Function('db', `return ${query}`);
            return await func(db);
        } catch (error) {
            throw new Error(`Failed to execute query: ${(error as Error).message}`);
        }
    }

    /**
     * Extract fields from a document recursively
     */
    private extractFields(obj: any, fieldMap: Map<string, Set<string>>, prefix = ''): void {
        Object.keys(obj).forEach(key => {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];
            const type = this.getValueType(value);

            if (!fieldMap.has(fullKey)) {
                fieldMap.set(fullKey, new Set());
            }
            fieldMap.get(fullKey)!.add(type);

            // Don't recurse too deep
            if (type === 'object' && prefix.split('.').length < 2) {
                this.extractFields(value, fieldMap, fullKey);
            }
        });
    }

    /**
     * Get MongoDB type name
     */
    private getValueType(value: any): string {
        if (value === null) { return 'null'; }
        if (Array.isArray(value)) { return 'array'; }
        if (value instanceof Date) { return 'date'; }
        return typeof value;
    }

    /**
     * Check if document has a field (supports nested fields)
     */
    private hasField(doc: any, fieldName: string): boolean {
        const parts = fieldName.split('.');
        let current = doc;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return false;
            }
        }

        return true;
    }

    /**
     * Ensure connection is active
     */
    private ensureConnected(): void {
        if (!this.client || this.state !== ConnectionState.Connected) {
            throw new Error('Not connected to MongoDB database');
        }
    }
}
