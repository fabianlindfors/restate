import { readFileSync, existsSync } from "fs";
import merge from "deepmerge";
import JSON5 from "json5";

export interface Config {
  database: DatabaseConfig;
}

export function loadConfig(environmentOverride?: string): Config {
  const env = getEnv() || environmentOverride || "production";

  // If a config file exists, we load that and merge it with the default config
  let fileConfig = {};
  if (existsSync("restate.config.json")) {
    const configFileContents = readFileSync("restate.config.json").toString();
    const configFromFile = JSON5.parse(configFileContents) || {};
    const environmentConfigFromFile = configFromFile[env] || {};

    fileConfig = merge(configFromFile, environmentConfigFromFile);
  }

  const environmentDefaultConfig = environmentSpecificDefaultConfigs[env] || {};
  const defaultConfig = merge(baseDefaultConfig, environmentDefaultConfig);

  return merge(defaultConfig, fileConfig);
}

export function getEnv(): string | undefined {
  return process.env.NODE_ENV;
}

export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig;

export type SqliteDatabaseConfig = {
  type: "sqlite";
  file: string;
};

export type PostgresDatabaseConfig = {
  type: "postgres";
  connection_string: string;
};

const baseDefaultConfig: Config = {
  database: {
    type: "postgres",
    connection_string: "postgres://postgres:@localhost:5432/postgres",
  },
};

const environmentSpecificDefaultConfigs: {
  [environment: string]: Config;
} = {
  development: {
    database: {
      type: "sqlite",
      file: "restate.sqlite",
    },
  },
};
