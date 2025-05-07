import { DatabaseAdapter, DatabaseConfig, QueryResult } from './database.interface';
import { PostgresAdapter } from './adapters/postgres.adapter';
// Use dynamic imports to work around TypeScript module resolution issues
const { MysqlAdapter } = require('./adapters/mysql.adapter');
const { MongoAdapter } = require('./adapters/mongo.adapter');
const { SqliteAdapter } = require('./adapters/sqlite.adapter');

export class Database {
  private static instance: Database;
  private adapter: DatabaseAdapter | null = null;
  private initialized = false;

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database();
    }
    return Database.instance;
  }

  public async initialize(config: DatabaseConfig): Promise<void> {
    if (this.initialized) {
      await this.adapter?.disconnect();
    }

    this.adapter = this.createAdapter(config);
    await this.adapter.connect(config);
    this.initialized = true;
  }

  private createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case 'postgres':
        return new PostgresAdapter();
      case 'mysql':
        return new MysqlAdapter();
      case 'mongodb':
        return new MongoAdapter();
      case 'sqlite':
        return new SqliteAdapter();
      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  public async query<T = any>(sql: string, params?: any[]): Promise<QueryResult> {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter.query<T>(sql, params);
  }

  public async execute(sql: string, params?: any[]): Promise<number> {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter.execute(sql, params);
  }

  public async beginTransaction(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter.beginTransaction();
  }

  public async commit(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter.commit();
  }

  public async rollback(): Promise<void> {
    if (!this.adapter) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.adapter.rollback();
  }

  public isConnected(): boolean {
    if (!this.adapter) {
      return false;
    }
    return this.adapter.isConnected();
  }

  public async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
      this.initialized = false;
    }
  }
}
