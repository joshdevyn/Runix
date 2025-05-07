import { EventEmitter } from 'events';

export class RunixEmitter extends EventEmitter {
  emitTaskStarted(taskName: string) {
    this.emit('taskStarted', { taskName });
  }

  emitTaskCompleted(taskName: string) {
    this.emit('taskCompleted', { taskName });
  }
}
