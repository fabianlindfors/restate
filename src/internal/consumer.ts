import { ModelMeta } from "./meta";

// Should never be instantiated directly. Use the generated helper functions on each model instead.
export default class Consumer {
  constructor(
    public name: string,
    public model: ModelMeta,
    public transitions: string[],
    public handler: (
      client: any,
      updatedObject: any,
      transition: any
    ) => Promise<void>
  ) {}
}

export enum TaskState {
  Created = "created",
  Completed = "completed",
}

export interface Task {
  id: string;
  transitionId: string;
  consumer: string;
  state: TaskState;
}
