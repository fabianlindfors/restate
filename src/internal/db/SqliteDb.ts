import { FieldMeta, ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import { generateTransactionId } from "../id";
import knex, { Knex } from "knex";
import { toPascalCase, toSnakeCase } from "js-convert-case";
import { Db } from ".";
import { Database } from "sqlite3";
import { Task, TaskState } from "../consumer";
import BaseObject from "../object";
import { SqliteDatabaseConfig } from "../config";
import { Bool, DataType, Decimal, Int, Optional, String } from "../dataTypes";

type TransitionWithSeqId = Transition<any, string> & { seqId: number };

export default class SqliteDb implements Db {
  constructor(private models: ModelMeta[], private db: Knex) {}

  static fromConfig(
    models: ModelMeta[],
    config: SqliteDatabaseConfig
  ): SqliteDb {
    const db = knex({
      client: "sqlite3",
      connection: {
        filename: config.file,
      },
      useNullAsDefault: true,
    });

    return new SqliteDb(models, db);
  }

  async transaction(fn: (db: SqliteDb) => Promise<void>) {
    await this.db.transaction(async (txn) => {
      const newDb = new SqliteDb(this.models, txn);
      await fn(newDb);
    });
  }

  async close() {
    await this.db.destroy();
  }

  async getRawSqliteConnection(): Promise<Database> {
    return await this.db.client.acquireRawConnection();
  }

  async setup() {
    // Create transitions table
    if (!(await this.db.schema.hasTable("transitions"))) {
      await this.db.schema.createTable("transitions", (table) => {
        table.increments("seq_id");
        table.text("id");
        table.text("model").notNullable();
        table.text("type").notNullable();
        table.text("object_id").notNullable();
        table.jsonb("data");
        table.text("note");
        table.text("triggered_by");
        table.datetime("applied_at").notNullable().defaultTo(this.db.fn.now());
      });
    }

    // Create consumer_tasks table
    if (!(await this.db.schema.hasTable("consumer_tasks"))) {
      await this.db.schema.createTable("consumer_tasks", (table) => {
        table.text("id");
        table.text("transition_id").notNullable();
        table.text("consumer").notNullable();
        table.text("state").notNullable();
      });
    }
  }

  async migrate() {
    // Create model tables
    for (const model of this.models) {
      if (!(await this.db.schema.hasTable(tableName(model)))) {
        await this.db.schema.createTable(tableName(model), (table) => {
          const addedFields = new Set<string>();
          table.text("id").primary();
          table.text("state").notNullable();

          for (const [_1, state] of Object.entries(model.states)) {
            for (const [_2, field] of Object.entries(state.fields)) {
              // Keep track of which fields have already been added
              // to avoid duplicates when some states share fields.
              if (addedFields.has(field.name)) {
                continue;
              }
              addedFields.add(field.name);

              const type = this.typeToSqliteType(field.type);
              const builder = table.specificType(columnName(field), type);

              if (!field.type.canBeUndefined()) {
                builder.notNullable();
              }
            }
          }
        });
      }
    }
  }

  private typeToSqliteType(type: DataType): string {
    // SQLite data types reference: https://www.sqlite.org/datatype3.html
    if (type instanceof String) {
      return "text";
    } else if (type instanceof Int) {
      return "integer";
    } else if (type instanceof Decimal) {
      return "real";
    } else if (type instanceof Bool) {
      return "integer";
    } else if (type instanceof Optional) {
      return this.typeToSqliteType(type.getNestedType());
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
    const targetStateMeta = modelMeta.states[toPascalCase(object.state)];

    // If we don't have from states, then this is an initializing transition
    // and we should be inserting a new row.
    const newRow = transitionMeta.fromStates == undefined;

    let data: { [key: string]: any } = {
      id: object.id,
      state: object.state,
    };

    // Populate object data based on model fields
    for (const [_1, field] of Object.entries(targetStateMeta.fields)) {
      data[columnName(field)] = (object as any)[field.name];
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
    await this.db("transitions").insert({
      id: transition.id,
      object_id: transition.objectId,
      model: transition.model,
      type: transition.type,
      data: transition.data,
      note: transition.note,
      triggered_by: transition.triggeredBy,
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
    const stateMeta = model.states[toPascalCase(state)];

    // Convert row to object
    const data: { [key: string]: any } = {
      id: row.id,
      state,
    };
    for (const [_1, field] of Object.entries(stateMeta.fields)) {
      const value = row[columnName(field)];
      data[field.name] = value;
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
      const stateMeta = model.states[toPascalCase(state)];

      const data: { [key: string]: any } = {
        id: row.id,
        state,
      };
      for (const [_1, field] of Object.entries(stateMeta.fields)) {
        const value = row[columnName(field)];
        data[field.name] = value;
      }

      return data;
    });

    return results;
  }

  async getLatestTransitionSeqId(): Promise<number | undefined> {
    const row = await this.db
      .table("transitions")
      .orderBy("id", "desc")
      .limit(1)
      .first("seq_id");
    if (!row) {
      return undefined;
    }

    return row.seq_id;
  }

  async getTransitions(
    afterSeqId: number | undefined
  ): Promise<TransitionWithSeqId[]> {
    let query = this.db.table("transitions");
    if (afterSeqId) {
      query = query.where("seq_id", ">", afterSeqId);
    }

    const rows = await query.orderBy("id", "desc").select("*");

    return rows.map((row) => ({
      id: row.id,
      seqId: row.seq_id,
      objectId: row.object_id,
      model: row.model,
      type: row.type,
      data: row.data,
    }));
  }

  async getTransitionById(
    id: string
  ): Promise<Transition<any, string> | undefined> {
    const rows = await this.db.table("transitions").where("id", id).select("*");
    if (rows.length == 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      objectId: row.object_id,
      model: row.model,
      type: row.type,
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
    };
  }

  async getTransitionsForObject(
    objectId: string
  ): Promise<Transition<any, string>[]> {
    const rows = await this.db
      .table("transitions")
      .where("object_id", objectId)
      .orderBy("id", "desc")
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      objectId: row.object_id,
      model: row.model,
      type: row.type,
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
    }));
  }

  async insertTask(task: Task): Promise<void> {
    await this.db.table("consumer_tasks").insert({
      id: task.id,
      transition_id: task.transitionId,
      consumer: task.consumer,
      state: task.state,
    });
  }

  async updateTask(task: Task): Promise<void> {
    await this.db.table("consumer_tasks").where("id", task.id).update({
      state: task.state,
    });
  }

  async getTasksForTransition(transitionId: string): Promise<Task[]> {
    const rows = await this.db
      .table("consumer_tasks")
      .where("transition_id", transitionId)
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      transitionId: row.transition_id,
      state: row.state,
      consumer: row.consumer,
    }));
  }

  async getUnprocessedTasks(): Promise<Task[]> {
    const rows = await this.db
      .table("consumer_tasks")
      .where("state", "=", TaskState.Created)
      .select("*");

    return rows.map((row) => ({
      id: row.id,
      transitionId: row.transition_id,
      state: row.state,
      consumer: row.consumer,
    }));
  }

  async setTaskProcessed(taskId: string): Promise<void> {
    await this.db.table("consumer_tasks").where("id", "=", taskId).update({
      state: TaskState.Completed,
    });
  }
}

function createTransition(
  model: ModelMeta,
  transition: TransitionMeta,
  data: any,
  objectId: string
): Transition<any, string> {
  return {
    id: generateTransactionId(),
    objectId,
    model: model.name,
    type: transition.name,
    data,
  };
}

function tableName(model: ModelMeta): string {
  return toSnakeCase(model.name);
}

function columnName(field: FieldMeta): string {
  return toSnakeCase(field.name);
}
