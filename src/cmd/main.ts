import { loadConfig } from "../internal/config";
import { dbFromConfig, loadGeneratedModule } from "./common";

export default class Main {
  constructor(private project: any) {}

  async run() {
    const generatedModule = await loadGeneratedModule();
    const config = loadConfig();

    const db = dbFromConfig(generatedModule.__ModelMetas, config.database);
    const client = new generatedModule.RestateClient(this.project, db);
    await client.setup();

    const main: Function = this.project.main;
    await (main.call(undefined, client) as Promise<void>);
  }
}
