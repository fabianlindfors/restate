import Project from "../project";
import { Callback } from "../db/TestDb";
import { ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import Transition from "../transition";
import { createTasksForTransition, runTask } from "./common";
import { Db } from "../db";

export function createTestConsumerRunner(
  db: Db,
  project: Project,
  client: any,
  projectMeta: ProjectMeta
): Callback {
  return async (
    _modelMeta: ModelMeta,
    _transitionMeta: TransitionMeta,
    transition: Transition<any, string>,
    _updatedObject: any
  ): Promise<void> => {
    const tasks = await createTasksForTransition(
      db,
      projectMeta,
      project,
      transition
    );

    await Promise.all(
      tasks.map((task) => runTask(db, projectMeta, project, client, task))
    );
  };
}
