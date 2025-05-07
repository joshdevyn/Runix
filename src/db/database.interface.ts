export interface DatabaseConfig {
  type: 'mysql' | 'postgres' | 'mongodb' | 'sqlite';
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database: string;
  connectionString?: string;
}

export interface QueryResult {
  rows: any[];
  rowCount: number;
  fields?: any[];
}

export interface DatabaseAdapter {
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(query: string, params?: any[]): Promise<QueryResult>;
  execute(query: string, params?: any[]): Promise<number>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isConnected(): boolean;
}
