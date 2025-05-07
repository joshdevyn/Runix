import { DatabaseAdapter } from '../database.interface';

export class MysqlAdapter implements DatabaseAdapter {
  connect(config: any): Promise<void>;
  disconnect(): Promise<void>;
  query<T = any>(query: string, params?: any[]): Promise<any>;
  execute(query: string, params?: any[]): Promise<number>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  isConnected(): boolean;
}
