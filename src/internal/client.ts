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
  ): Promise<any | null> {
    const results = await this.query(params);
    if (results.length == 0) {
      return null;
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

  protected async getTransitionById(
    id: string
  ): Promise<Transition<any, string> | null> {
    return await this.db.getTransitionById(id);
  }

  protected async getTransitionsForObject(
    objectId: string
  ): Promise<Transition<any, string>[]> {
    return await this.db.getTransitionsForObject(objectId);
  }
}

export abstract class BaseTransitionsClient {
  constructor(protected db: Db, protected modelMeta: ModelMeta) {}

  protected async applyTransition(
    transitionMeta: TransitionMeta,
    transitionParams: any,
    existingObjectId: string | undefined,
    transitionFn: (object: any, transition: any) => Promise<any>,
    triggeredBy: string | null
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
      model: this.modelMeta.pascalCaseName(),
      type: transitionMeta.pascalCaseNmae(),
      from: object?.state || null,
      to: "",
      objectId: objectId,
      data: transitionParams.data,
      note: transitionParams.note,
      triggeredBy,
      appliedAt: new Date(),
    };

    // Apply the transition implementation (from the project config)
    const transitionedObject = (await transitionFn(
      object,
      transition
    )) as BaseObject;
    transitionedObject.id = objectId;
    transition.to = transitionedObject.state;

    // Validate field values on object
    const stateMeta = this.modelMeta.getStateMetaBySerializedName(
      transitionedObject.state
    );
    for (const field of stateMeta.allFieldMetas()) {
      const dataType = field.type;
      const value = (transitionedObject as any)[field.camelCaseName()];
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
