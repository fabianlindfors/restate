import { ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import TestDb from "./TestDb";
import SqliteDb from "./SqliteDb";
import PostgresDb from "./PostgresDb";

export { TestDb, SqliteDb, PostgresDb };

export interface Db {
  setup(): Promise<void>;
  close(): Promise<void>;

  migrate(): Promise<void>;

  transaction(fn: (db: Db) => Promise<void>): Promise<void>;

  // Transitioning
  applyTransition(
    modelMeta: ModelMeta,
    transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    object: Object
  ): Promise<void>;

  // Querying
  getById(model: ModelMeta, id: string): Promise<any>;
  query(
    model: ModelMeta,
    where?: { [key: string]: any },
    limit?: number
  ): Promise<any[]>;

  getTransitionById(id: string): Promise<Transition<any, string> | null>;
  getTransitionsForObject(objectId: string): Promise<Transition<any, string>[]>;
}
