import knex from "knex";
import { ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import BaseObject from "../object";
import Transition from "../transition";
import SqliteDb from "./SqliteDb";

export type Callback = (
  modelMeta: ModelMeta,
  transitionMeta: TransitionMeta,
  transition: Transition<any, string>,
  updatedModel: any
) => Promise<void>;

export default class TestDb extends SqliteDb {
  private callback?: Callback;

  constructor(projectMeta: ProjectMeta) {
    const knexDb = knex({
      client: "sqlite",
      connection: {
        filename: ":memory:",
      },
      useNullAsDefault: true,
    });

    super(projectMeta, knexDb);
  }

  setTransitionCallback(callback: Callback) {
    this.callback = callback;
  }

  async applyTransition(
    modelMeta: ModelMeta,
    transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    object: BaseObject
  ): Promise<void> {
    await super.applyTransition(modelMeta, transitionMeta, transition, object);

    if (this.callback) {
      await this.callback(modelMeta, transitionMeta, transition, object);
    }
  }
}
