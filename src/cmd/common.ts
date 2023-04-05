import winston, { config } from "winston";
import { Db, Project, SqliteDb, SqliteQueue } from "../internal";
import { DatabaseConfig } from "../internal/config";
import { PostgresDb } from "../internal/db";
import { Queue } from "../internal/queue";
import { PostgresQueue } from "../internal/queue/PostgresQueue";
import Logger from "./logger";
import { existsSync } from "fs";

export async function loadGeneratedModule(): Promise<{
  __ModelMetas: any[];
  RestateClient: any;
}> {
  const generatedPath = "../generated";
  return await import(generatedPath);
}

export async function loadProject(): Promise<any> {
  const configPath = `${process.cwd()}/src/restate.ts`;
  if (!existsSync(configPath)) {
    return undefined;
  }

  return (await import(configPath)).default;
}

export function dbFromConfig(modelMetas: any[], config: DatabaseConfig): Db {
  switch (config.type) {
    case "sqlite":
      return SqliteDb.fromConfig(modelMetas, config);
    case "postgres":
      return PostgresDb.fromConfig(modelMetas, config);
  }
}

export function queueFromDb(
  logger: Logger,
  modelMetas: any[],
  db: Db,
  client: any,
  project: Project
): Queue {
  if (db instanceof SqliteDb) {
    return new SqliteQueue(modelMetas, db, client, project);
  }

  if (db instanceof PostgresDb) {
    return new PostgresQueue(logger, modelMetas, db, client, project);
  }

  throw new Error("couldn't determine what queue to create for database");
}
