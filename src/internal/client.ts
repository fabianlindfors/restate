import { toCamelCase, toPascalCase } from "js-convert-case";
import { Db } from "./db";
import { generateId, generateTransactionId } from "./id";
import { ModelMeta, TransitionMeta } from "./meta";
import BaseObject from "./object";
import Transition from "./transition";
import { QueryParams } from "./types";

export abstract class BaseClient {
  constructor(protected db: Db, protected modelMeta: ModelMeta) {}

  protected async internalFindAll(params: QueryParams<any>): Promise<any[]> {
    return await this.query(params);
  }

  protected async internalFindOne(
    params: QueryParams<any>
  ): Promise<any | undefined> {
    const results = await this.query(params);
    if (results.length == 0) {
      return undefined;
    }

    return results[0];
  }

  protected async internalFindOneOrThrow(
    params: QueryParams<any>
  ): Promise<any> {
    const results = await this.query(params);
    if (results.length == 0) {
      throw new Error("no object found");
    }

    return results[0];
  }

  protected async query(params: QueryParams<any>): Promise<any[]> {
    return await this.db.query(this.modelMeta, params?.where, params?.limit);
  }
}

export abstract class BaseTransitionsClient {
  constructor(protected db: Db, protected modelMeta: ModelMeta) {}

  protected async applyTransition(
    transitionMeta: TransitionMeta,
    transitionParams: any,
    existingObjectId: string | undefined,
    transitionFn: (object: any, transition: any) => Promise<any>
  ): Promise<{
    updatedTransition: Transition<any, string>;
    updatedObject: Object;
  }> {
    let object = undefined;
    if (existingObjectId) {
      object = await this.db.getById(this.modelMeta, existingObjectId);
    }

    let objectId = existingObjectId;
    if (objectId == undefined) {
      objectId = generateId(this.modelMeta.prefix);
    }

    // Set up the transition object
    const transition: Transition<any, string> = {
      id: generateTransactionId(),
      model: this.modelMeta.name,
      type: transitionMeta.name,
      objectId: objectId,
      data: transitionParams.data,
      note: transitionParams.note,
    };

    // Apply the transition implementation (from the project config)
    const transitionedObject = (await transitionFn(
      object,
      transition
    )) as BaseObject;
    transitionedObject.id = objectId;

    // Validate field values on object
    const camelCaseState = toPascalCase(transitionedObject.state);
    const stateMeta = this.modelMeta.states[camelCaseState];
    for (const field of Object.values(stateMeta.fields)) {
      const dataType = field.type;
      const value = (transitionedObject as any)[field.name];
      dataType.validate(value);
    }

    await this.db.applyTransition(
      this.modelMeta,
      transitionMeta,
      transition,
      transitionedObject
    );

    return {
      updatedTransition: transition,
      updatedObject: transitionedObject,
    };
  }
}
