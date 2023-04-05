import { toSnakeCase } from "js-convert-case";
import Project from "../project";
import { Callback } from "../db/TestDb";
import { ModelMeta, TransitionMeta } from "../meta";
import Transition from "../transition";

export function createTestConsumerRunner(
  project: Project,
  client: any
): Callback {
  return async (
    modelMeta: ModelMeta,
    transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    updatedObject: any
  ): Promise<void> => {
    if (project.consumers === undefined) {
      return;
    }

    // Find all consumers which match this transition
    const consumers = project.consumers.filter(
      (consumer) =>
        consumer.model.name == modelMeta.name &&
        consumer.transitions.includes(toSnakeCase(transitionMeta.name))
    );

    // Execute each consumer
    const consumerPromises = consumers.map(consumer => consumer.handler(client, updatedObject, transition))
    await Promise.all(consumerPromises)
  };
}