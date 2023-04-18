import { FieldMeta, ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import { generateTransactionId } from "../id";
import knex, { Knex } from "knex";
import { toSnakeCase } from "js-convert-case";
import { Db } from ".";
import { Database } from "sqlite3";
import { Task, TaskState } from "../consumer";
import BaseObject from "../object";
import { SqliteDatabaseConfig } from "../config";
import { Bool, DataType, Decimal, Int, Optional, String } from "../dataTypes";

const TRANSITIONS_TABLE = "transitions";
const TASKS_TABLE = "tasks";

type TransitionWithSeqId = Transition<any, string> & { seqId: number };

export default class SqliteDb implements Db {
  constructor(private projectMeta: ProjectMeta, private db: Knex) {}

  static fromConfig(
    projectMeta: ProjectMeta,
    config: SqliteDatabaseConfig
  ): SqliteDb {
    const db = knex({
      client: "sqlite3",
      connection: {
        filename: config.file,
      },
      useNullAsDefault: true,
    });

    return new SqliteDb(projectMeta, db);
  }

  async transaction(fn: (db: SqliteDb) => Promise<void>) {
    await this.db.transaction(async (txn) => {
      const newDb = new SqliteDb(this.projectMeta, txn);
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
    if (!(await this.db.schema.hasTable(TRANSITIONS_TABLE))) {
      await this.db.schema.createTable(TRANSITIONS_TABLE, (table) => {
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

  async getLatestTransitionSeqId(): Promise<number | undefined> {
    const row = await this.db
      .table(TRANSITIONS_TABLE)
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
    let query = this.db.table(TRANSITIONS_TABLE);
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
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
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
      data: row.data,
      note: row.note,
      triggeredBy: row.triggered_by,
    }));
  }

  async insertTask(task: Task): Promise<void> {
    await this.db.table(TASKS_TABLE).insert({
      id: task.id,
      transition_id: task.transitionId,
      consumer: task.consumer,
      state: task.state,
    });
  }

  async updateTask(task: Task): Promise<void> {
    await this.db.table(TASKS_TABLE).where("id", task.id).update({
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

  async getUnprocessedTasks(): Promise<Task[]> {
    const rows = await this.db
      .table(TASKS_TABLE)
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
    await this.db.table(TASKS_TABLE).where("id", "=", taskId).update({
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
    model: model.pascalCaseName(),
    type: transition.pascalCaseNmae(),
    data,
  };
}

function tableName(model: ModelMeta): string {
  return model.pluralSnakeCaseName();
}

function columnName(field: FieldMeta): string {
  return field.snakeCaseName();
}
