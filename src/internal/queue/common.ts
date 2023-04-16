import { toSnakeCase } from "js-convert-case";
import Consumer, { Task, TaskState } from "../consumer";
import { Db } from "../db";
import { generateConsumerTaskId } from "../id";
import { ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import Transition from "../transition";

export async function createTasksForTransition(
  db: Db,
  projectMeta: ProjectMeta,
  project: any,
  transition: Transition<any, string>
): Promise<Task[]> {
  const modelMeta = projectMeta.getModelMeta(transition.model);
  const transitionMeta = Object.values(modelMeta.transitions).find(
    (transitionMeta) => transitionMeta.name == transition.type
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
  projectMeta: ProjectMeta,
  project: any,
  client: any,
  task: Task
): Promise<Task> {
  const consumer = getConsumerByName(project, task.consumer);
  const transition = await db.getTransitionById(task.transitionId);
  const modelMeta = projectMeta.getModelMeta(transition.model);
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
