import { Logger } from '../utils/logger';

export interface Task {
  name: string;
  run(...args: any[]): Promise<void>;
}

export class BaseTask implements Task {
  private logger = Logger.getInstance();

  constructor(public name: string) {}
  async run(...args: any[]): Promise<void> {
    this.logger.info(`Running task: ${this.name} with args:`, { args });
  }
}
