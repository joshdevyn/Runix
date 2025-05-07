export interface Task {
  name: string;
  run(...args: any[]): Promise<void>;
}

export class BaseTask implements Task {
  constructor(public name: string) {}
  async run(...args: any[]): Promise<void> {
    // Implementation logic here
    console.log(`Running task: ${this.name} with args:`, args);
  }
}
