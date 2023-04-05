import { toSnakeCase } from "js-convert-case";
import Project from "../project";
import Consumer, { Task, TaskState } from "../consumer";
import SqliteDb from "../db/SqliteDb";
import { ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import { Queue } from ".";

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
      await this.createTasksForTransition(transition);
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

  private async createTasksForTransition(transition: Transition<any, string>) {
    const [modelMeta, transitionMeta] = this.getMetaForTransition(transition);
    const allConsumers = this.project.consumers;
    if (allConsumers === undefined) {
      return;
    }

    // Find all consumers which match this transition
    const consumers = allConsumers.filter(
      (consumer) =>
        consumer.model.name == modelMeta.name &&
        consumer.transitions.includes(toSnakeCase(transitionMeta.name))
    );

    // Create a new task for each consumer
    for (const consumer of consumers) {
      if (!consumer.transitions.includes(toSnakeCase(transition.type))) {
        continue;
      }

      await this.db.createConsumerTask(
        transition.id,
        consumer.name,
        TaskState.Created
      );
    }
  }

  private async processTasks() {
    const tasks = await this.db.getUnprocessedTasks();
    await Promise.all(tasks.map((task) => this.processTask(task)));

    // Process tasks again after a set interval
    setTimeout(async () => await this.processTasks(), TASK_PROCESS_INTERVAL);
  }

  private async processTask(task: Task) {
    const consumer = this.getConsumerByName(task.consumer);
    const transition = await this.db.getTransitionById(task.transitionId);
    const [modelMeta, _] = this.getMetaForTransition(transition);
    const object = await this.db.getById(modelMeta, transition.objectId);

    console.log(
      `Running ${consumer.name} for ${transition.objectId} (${transition.id})`
    );
    await consumer.handler(this.client, object, transition);
    await this.db.setTaskProcessed(task.id);
  }

  private getConsumerByName(name: string): Consumer {
    const allConsumers = this.project.consumers;
    if (allConsumers == undefined) {
      throw new Error(`couldn't find consumer named ${name}`);
    }

    const consumer = allConsumers.find((consumer) => consumer.name == name);
    if (consumer == undefined) {
      throw new Error(`couldn't find consumer named ${name}`);
    }

    return consumer;
  }

  private getMetaForTransition(
    transition: Transition<any, string>
  ): [ModelMeta, TransitionMeta] {
    const modelMeta = this.modelMetas.find(
      (meta) => meta.name == transition.model
    );
    if (modelMeta === undefined) {
      throw new Error(`couldn't find model meta with name ${transition.model}`);
    }

    const transitionMeta = Object.values(modelMeta.transitions).find(
      (transitionMeta) => transitionMeta.name == transition.type
    );
    if (transitionMeta === undefined) {
      throw new Error(
        `couldn't find transition meta with name ${transition.type}`
      );
    }

    return [modelMeta, transitionMeta];
  }
}
