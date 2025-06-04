import { DatabaseAdapter, DatabaseConfig, QueryResult } from '../database.interface';
import { Logger, LogContext } from '../../utils/logger';

export class SqliteAdapter implements DatabaseAdapter {
  private db: any = null;
  private connected = false;
  private logger = Logger.getInstance();

  async connect(config: DatabaseConfig): Promise<void> {
    try {
      this.logger.info(`Connecting to SQLite database: ${config.database}`);
      this.connected = true;
    } catch (error) {
      this.logger.error('Failed to connect to SQLite', {}, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.logger.info('Disconnecting from SQLite');
      this.connected = false;
    } catch (error) {
      this.logger.error('Failed to disconnect from SQLite', {}, error);
      throw error;
    }
  }

  async query<T = any>(query: string, params?: any[]): Promise<QueryResult> {
    if (!this.isConnected()) {
      throw new Error('Database not connected');
    }
    try {
      this.logger.info(`Executing query: ${query}`, params);
      return {
        rows: [],
        rowCount: 0,
        fields: []
      };
    } catch (error) {
      this.logger.error('Query failed', {}, error);
      throw error;
    }
  }

  async execute(query: string, params?: any[]): Promise<number> {
    if (!this.isConnected()) {
      throw new Error('Database not connected');
    }
    try {
      this.logger.info(`Executing statement: ${query}`, params);
      return 0; // Changes (affected rows)
    } catch (error) {
      this.logger.error('Execute failed', {}, error);
      throw error;
    }
  }

  async beginTransaction(): Promise<void> {
    await this.query('BEGIN TRANSACTION');
  }

  async commit(): Promise<void> {
    await this.query('COMMIT');
  }

  async rollback(): Promise<void> {
    try {
      await this.query('ROLLBACK');
    } catch (error) {
      this.logger.error('Transaction failed', {}, error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
