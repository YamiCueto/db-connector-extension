import { MySQLProvider } from './mysqlProvider';
import { DatabaseType } from '../types';

/**
 * MariaDB database provider
 * MariaDB is compatible with MySQL, so we extend the MySQL provider
 */
export class MariaDBProvider extends MySQLProvider {
    /**
     * Get database type
     */
    public getType(): DatabaseType {
        return DatabaseType.MariaDB;
    }
}
