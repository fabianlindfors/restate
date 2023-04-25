import knex, { Knex } from "knex";
import { Db } from ".";
import { PostgresDatabaseConfig } from "../config";
import { FieldMeta, ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import BaseObject from "../object";
import Transition from "../transition";
import { Task, TaskState } from "../consumer";
import { String, Int, DataType, Decimal, Optional, Bool } from "../dataTypes";
import { toSnakeCase } from "js-convert-case";

const TRANSITIONS_TABLE = "transitions";
const TASKS_TABLE = "tasks";

export default class PostgresDb implements Db {
  constructor(private projectMeta: ProjectMeta, private db: Knex) {}

  static fromConfig(
    projectMeta: ProjectMeta,
    config: PostgresDatabaseConfig
  ): PostgresDb {
    const db = knex({
      client: "postgres",
      connection: config.connection_string,
    });
    return new PostgresDb(projectMeta, db);
  }

  async transaction(fn: (db: PostgresDb) => Promise<void>) {
    await this.db.transaction(async (txn) => {
      const newDb = new PostgresDb(this.projectMeta, txn);
      await fn(newDb);
    });
  }

  async close() {
    await this.db.destroy();
  }

  async setup() {
    // Create transitions table
    if (!(await this.db.schema.hasTable(TRANSITIONS_TABLE))) {
      await this.db.schema.createTable(TRANSITIONS_TABLE, (table) => {
        table.text("id");
        table.text("model").notNullable();
        table.text("type").notNullable();
        table.text("from");
        table.text("to").notNullable();
        table.text("object_id").notNullable();
        table.jsonb("data");
        table.text("note");
        table.text("triggered_by");
        table.datetime("applied_at").notNullable();
      });
    }

    // Create tasks table
    if (!(await this.db.schema.hasTable(TASKS_TABLE))) {
      await this.db.schema.createTable(TASKS_TABLE, (table) => {
        table.text("id");
        table.text("transition_id").notNullable();
        table.text("consumer").notNullable();
        table.text("state").notNullable();
      });
    }
  }

  async migrate() {
    // Create model tables
    for (const modelMeta of this.projectMeta.allModelMetas()) {
      if (!(await this.db.schema.hasTable(tableName(modelMeta)))) {
        await this.db.schema.createTable(tableName(modelMeta), (table) => {
          const addedFields = new Set<string>();
          table.text("id").primary();
          table.text("state").notNullable();

          for (const state of modelMeta.allStateMetas()) {
            for (const field of state.allFieldMetas()) {
              // Keep track of which fields have already been added
              // to avoid duplicates when some states share fields.
              if (addedFields.has(field.camelCaseName())) {
                continue;
              }
              addedFields.add(field.camelCaseName());

              const type = this.typeToPostgresType(field.type);
              const builder = table.specificType(columnName(field), type);

              if (
                modelMeta.doesFieldAppearInAllStates(field) &&
                !field.type.canBeNull()
              ) {
                builder.notNullable();
              }
            }
          }
        });
      }
    }
  }

  private typeToPostgresType(type: DataType): string {
    // Postgres data types reference: https://www.postgresql.org/docs/current/datatype.html
    if (type instanceof String) {
      return "text";
    } else if (type instanceof Int) {
      return "integer";
    } else if (type instanceof Decimal) {
      return "decimal";
    } else if (type instanceof Bool) {
      return "boolean";
    } else if (type instanceof Optional) {
      return this.typeToPostgresType(type.getNestedType());
    } else {
      throw new Error(`unrecognized data type ${type}`);
    }
  }

  async applyTransition(
    modelMeta: ModelMeta,
    transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    object: BaseObject
  ): Promise<void> {
    const targetStateMeta = modelMeta.getStateMetaBySerializedName(
      object.state
    );

    // If we don't have from states, then this is an initializing transition
    // and we should be inserting a new row.
    const newRow = transitionMeta.fromStates == undefined;

    let data: { [key: string]: any } = {
      id: object.id,
      state: object.state,
    };

    // Populate object data based on model fields
    for (const field of targetStateMeta.allFieldMetas()) {
      data[columnName(field)] = (object as any)[field.camelCaseName()];
    }

    // Insert or update object
    const table = this.db(tableName(modelMeta));
    if (newRow) {
      await table.insert(data);
      object.id = data.id;
    } else {
      await table.where("id", object.id).update(data);
    }

    // Record transition event
    await this.insertTransition(transition);
  }

  private async insertTransition(transition: Transition<any, string>) {
    await this.db(TRANSITIONS_TABLE).insert({
      id: transition.id,
      object_id: transition.objectId,
      model: transition.model,
      type: transition.type,
      from: transition.from,
      to: transition.to,
      data: transition.data,
      note: transition.note,
      triggered_by: transition.triggeredBy,
      applied_at: transition.appliedAt,
    });
  }

  async getById(model: ModelMeta, id: string): Promise<any> {
    const rows = await this.db
      .table(tableName(model))
      .where("id", id)
      .select("*");
    if (rows.length == 0) {
      throw new Error(`No object found with ID ${id}`);
    }

    const row = rows[0];
    const state = row.state;
    const stateMeta = model.getStateMetaBySerializedName(state);

    // Convert row to object
    const data: { [key: string]: any } = {
      id: row.id,
      state,
    };
    for (const field of stateMeta.allFieldMetas()) {
      const value = row[columnName(field)];
      data[field.camelCaseName()] = value;
    }

    return data;
  }

  async query(
    model: ModelMeta,
    where?: { [key: string]: any },
    limit?: number
  ): Promise<any[]> {
    let query = this.db.table(tableName(model));

    if (where) {
      for (const [key, value] of Object.entries(where)) {
        const columnName = toSnakeCase(key);
        if (Array.isArray(value)) {
          query = query.whereIn(columnName, value);
        } else {
          query = query.where(columnName, value);
        }
      }
    }

    if (limit) {
      query = query.limit(limit);
    }

    const rows = await query.select("*");
    const results = rows.map((row) => {
      const state = row.state;
      const stateMeta = model.getStateMetaBySerializedName(state);

      const data: { [key: string]: any } = {
        id: row.id,
        state,
      };
      for (const field of stateMeta.allFieldMetas()) {
        const value = row[columnName(field)];
        data[field.camelCaseName()] = value;
      }

      return data;
    });

    return results;
  }

  async insertTask(task: Task): Promise<void> {
    await this.db(TASKS_TABLE).insert({
      id: task.id,
      transition_id: task.transitionId,
      consumer: task.consumer,
      state: task.state,
    });
  }

  async updateTask(task: Task): Promise<void> {
    await this.db(TASKS_TABLE).where("id", task.id).update({
      state: task.state,
    });
  }

  async getTasksForTransition(transitionId: string): Promise<Task[]> {
    const rows = await this.db
      .table(TASKS_TABLE)
      .where("transition_id", transitionId)
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      transitionId: row.transition_id,
      state: row.state,
      consumer: row.consumer,
    }));
  }

  async getTransitionById(
    id: string
  ): Promise<Transition<any, string> | undefined> {
    const rows = await this.db
      .table(TRANSITIONS_TABLE)
      .where("id", id)
      .select("*");
    if (rows.length == 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      objectId: row.object_id,
      model: row.model,
      type: row.type,
      from: row.from,
      to: row.to,
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
      appliedAt: row.applied_at,
    };
  }

  async getTransitionsForObject(
    objectId: string
  ): Promise<Transition<any, string>[]> {
    const rows = await this.db
      .table(TRANSITIONS_TABLE)
      .where("object_id", objectId)
      .orderBy("id", "desc")
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      model: row.model,
      type: row.type,
      from: row.from,
      to: row.to,
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
      appliedAt: row.applied_at,
    }));
  }

  async getUnprocessedTasks(limit: number): Promise<Task[]> {
    const rows = await this.db
      .table(TASKS_TABLE)
      .where("state", "=", TaskState.Created)
      .limit(limit)
      .forUpdate()
      .skipLocked()
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      transitionId: row.transition_id,
      state: row.state,
      consumer: row.consumer,
    }));
  }

  async setTaskProcessed(taskId: string): Promise<void> {
    await this.db.table(TASKS_TABLE).where("id", "=", taskId).update({
      state: TaskState.Completed,
    });
  }
}

function tableName(model: ModelMeta): string {
  return model.pluralSnakeCaseName();
}

function columnName(field: FieldMeta): string {
  return field.snakeCaseName();
}
