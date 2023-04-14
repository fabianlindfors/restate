import Project from "../project";
import SqliteDb from "../db/SqliteDb";
import { ModelMeta } from "../meta";
import { Queue } from ".";
import { createTasksForTransition, runTask } from "./common";

const TRANSITION_PROCESS_INTERVAL = 500;
const TASK_PROCESS_INTERVAL = 500;

export class SqliteQueue implements Queue {
  private lastSeqId: number | undefined;

  constructor(
    private modelMetas: ModelMeta[],
    private db: SqliteDb,
    private client: any,
    private project: Project
  ) {}

  async run(): Promise<void> {
    this.lastSeqId = await this.db.getLatestTransitionSeqId();

    await this.processTransitions();
    await this.processTasks();
  }

  private async processTransitions() {
    const newTransitions = await this.db.getTransitions(this.lastSeqId);
    for (const transition of newTransitions) {
      await createTasksForTransition(
        this.db,
        this.modelMetas,
        this.project,
        transition
      );
    }

    if (newTransitions.length != 0) {
      this.lastSeqId = newTransitions[newTransitions.length - 1].seqId;
    }

    // Process transitions again in a second
    setTimeout(
      async () => await this.processTransitions(),
      TRANSITION_PROCESS_INTERVAL
    );
  }

  private async processTasks() {
    const tasks = await this.db.getUnprocessedTasks();
    await Promise.all(
      tasks.map((task) =>
        runTask(this.db, this.modelMetas, this.project, this.client, task)
      )
    );

    // Process tasks again after a set interval
    setTimeout(async () => await this.processTasks(), TASK_PROCESS_INTERVAL);
  }
}
