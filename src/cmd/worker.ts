import { loadConfig } from "../internal/config";
import {
  dbFromConfig,
  loadGeneratedModule,
  loadProject,
  queueFromDb,
} from "./common";
import { createLogger } from "./logger";

export default class Worker {
  constructor(private project: any) {}

  async run() {
    const config = loadConfig();
    const project = await loadProject();
    const generatedModule = await loadGeneratedModule();

    const db = dbFromConfig(generatedModule.__ProjectMeta, config.database);

    const Client = generatedModule.RestateClient;
    const client = new Client(this.project, db);
    await client.setup();

    const logger = createLogger();

    logger.info("Starting worker");

    const queue = queueFromDb(
      logger,
      generatedModule.__ProjectMeta,
      db,
      client,
      project
    );
    await queue.run();
  }
}
