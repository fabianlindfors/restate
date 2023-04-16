import { ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import TestDb from "./TestDb";
import SqliteDb from "./SqliteDb";
import PostgresDb from "./PostgresDb";
import { Task, TaskState } from "../consumer";

export { TestDb, SqliteDb, PostgresDb };

export interface Db {
  setup(): Promise<void>;
  close(): Promise<void>;

  migrate(): Promise<void>;

  transaction(fn: (db: Db) => Promise<void>): Promise<void>;

  // Transitions
  applyTransition(
    modelMeta: ModelMeta,
    transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    object: Object
  ): Promise<void>;
  getTransitionById(id: string): Promise<Transition<any, string> | null>;
  getTransitionsForObject(objectId: string): Promise<Transition<any, string>[]>;

  // Object querying
  getById(model: ModelMeta, id: string): Promise<any>;
  query(
    model: ModelMeta,
    where?: { [key: string]: any },
    limit?: number
  ): Promise<any[]>;

  // Tasks
  insertTask(task: Task): Promise<void>;
  updateTask(task: Task): Promise<void>;
  getTasksForTransition(transition_id: string): Promise<Task[]>;
}
