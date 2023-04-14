import knex, { Knex } from "knex";
import { Db } from ".";
import { PostgresDatabaseConfig } from "../config";
import { FieldMeta, ModelMeta, TransitionMeta } from "../meta";
import BaseObject from "../object";
import Transition from "../transition";
import { toPascalCase, toSnakeCase } from "js-convert-case";
import { generateConsumerTaskId } from "../id";
import { Task, TaskState } from "../consumer";
import { String, Int, DataType, Decimal, Optional, Bool } from "../dataTypes";

export default class PostgresDb implements Db {
  constructor(private models: ModelMeta[], private db: Knex) {}

  static fromConfig(
    models: ModelMeta[],
    config: PostgresDatabaseConfig
  ): PostgresDb {
    const db = knex({
      client: "postgres",
      connection: config.connection_string,
    });
    return new PostgresDb(models, db);
  }

  async transaction(fn: (db: PostgresDb) => Promise<void>) {
    await this.db.transaction(async (txn) => {
      const newDb = new PostgresDb(this.models, txn);
      await fn(newDb);
    });
  }

  async close() {
    await this.db.destroy();
  }

  async setup() {
    // Create transitions table
    if (!(await this.db.schema.hasTable("transitions"))) {
      await this.db.schema.createTable("transitions", (table) => {
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

              const type = this.typeToPostgresType(field.type);
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
    filter?: { [key: string]: any }
  ): Promise<any[]> {
    return [];
  }

  async insertTask(task: Task): Promise<void> {
    const id = generateConsumerTaskId();

    await this.db("consumer_tasks").insert({
      id,
      transition_id: task.transitionId,
      consumer: task.consumer,
      state: task.state,
    });
  }

  async updateTask(task: Task): Promise<void> {
    await this.db("consumer_tasks").where("id", task.id).update({
      state: task.state,
    });
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

  async getUnprocessedTasks(limit: number): Promise<Task[]> {
    const rows = await this.db
      .table("consumer_tasks")
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
    await this.db.table("consumer_tasks").where("id", "=", taskId).update({
      state: TaskState.Completed,
    });
  }
}

function tableName(model: ModelMeta): string {
  return toSnakeCase(model.name);
}

function columnName(field: FieldMeta): string {
  return toSnakeCase(field.name);
}
