import { toSnakeCase } from "js-convert-case";
import Consumer, { Task, TaskState } from "../consumer";
import { Db } from "../db";
import { generateConsumerTaskId } from "../id";
import { ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";

export async function createTasksForTransition(
  db: Db,
  modelMetas: ModelMeta[],
  project: any,
  transition: Transition<any, string>
): Promise<Task[]> {
  const [modelMeta, transitionMeta] = getMetaForTransition(
    modelMetas,
    transition
  );
  const allConsumers = project.consumers;
  if (allConsumers === undefined) {
    return;
  }

  // Find all consumers which match this transition
  const consumers = allConsumers.filter(
    (consumer) =>
      consumer.model.name == modelMeta.name &&
      consumer.transitions.includes(toSnakeCase(transitionMeta.name))
  );

  let tasks = [];

  // Create a new task for each consumer
  for (const consumer of consumers) {
    if (!consumer.transitions.includes(toSnakeCase(transition.type))) {
      continue;
    }

    const task: Task = {
      id: generateConsumerTaskId(),
      consumer: consumer.name,
      transitionId: transition.id,
      state: TaskState.Created,
    };

    await db.insertTask(task);
    tasks.push(task);
  }

  return tasks;
}

export async function runTask(
  db: Db,
  modelMetas: ModelMeta[],
  project: any,
  client: any,
  task: Task
): Promise<Task> {
  const consumer = getConsumerByName(project, task.consumer);
  const transition = await db.getTransitionById(task.transitionId);
  const [modelMeta, _] = getMetaForTransition(modelMetas, transition);
  const object = await db.getById(modelMeta, transition.objectId);

  const taskSpecificClient = client.withTriggeredBy(task.id);
  await consumer.handler(taskSpecificClient, object, transition);

  const updatedTask: Task = {
    ...task,
    state: TaskState.Completed,
  };
  await db.updateTask(updatedTask);

  return updatedTask;
}

function getMetaForTransition(
  modelMetas: ModelMeta[],
  transition: Transition<any, string>
): [ModelMeta, TransitionMeta] {
  const modelMeta = modelMetas.find((meta) => meta.name == transition.model);
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

function getConsumerByName(project: any, name: string): Consumer {
  const allConsumers = project.consumers;
  if (allConsumers == undefined) {
    throw new Error(`couldn't find consumer named ${name}`);
  }

  const consumer = allConsumers.find((consumer) => consumer.name == name);
  if (consumer == undefined) {
    throw new Error(`couldn't find consumer named ${name}`);
  }

  return consumer;
}
