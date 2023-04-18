import { toPascalCase, toSnakeCase } from "js-convert-case";
import { DataType } from "./dataTypes";
import pluralize from "pluralize";

export class ProjectMeta {
  constructor(private modelMetas: ModelMeta[]) {}

  allModelMetas(): ModelMeta[] {
    return this.modelMetas;
  }

  getModelMeta(name: string): ModelMeta {
    return this.modelMetas.find((meta) => meta.pascalCaseName() === name);
  }
}

export class ModelMeta {
  constructor(
    // PascalCase name
    private name: string,
    public prefix: string,
    private states: StateMeta[],
    private transitions: TransitionMeta[]
  ) {}

  pascalCaseName(): string {
    return this.name;
  }

  pluralPascalCaseName(): string {
    return pluralize(this.name);
  }

  snakeCaseName(): string {
    return toSnakeCase(this.name);
  }

  pluralSnakeCaseName(): string {
    return pluralize(toSnakeCase(this.name));
  }

  allStateMetas(): StateMeta[] {
    return this.states;
  }

  getStateMeta(name: string): StateMeta {
    return this.states.find((meta) => meta.pascalCaseNmae() === name);
  }

  getStateMetaBySerializedName(serializedName: string): StateMeta {
    const pascalCaseStateName = toPascalCase(serializedName);
    return this.states.find(
      (meta) => meta.pascalCaseNmae() === pascalCaseStateName
    );
  }

  allTransitionMetas(): TransitionMeta[] {
    return this.transitions;
  }

  getTransitionMeta(name: string): TransitionMeta {
    return this.transitions.find((meta) => meta.pascalCaseNmae() === name);
  }
}

export class StateMeta {
  constructor(private name: string, private fields: FieldMeta[]) {}

  pascalCaseNmae(): string {
    return this.name;
  }

  allFieldMetas(): FieldMeta[] {
    return this.fields;
  }
}

export class TransitionMeta {
  constructor(
    private name: string,
    private fields: FieldMeta[],
    public fromStates: string[] | undefined,
    public toStates: string[]
  ) {}

  pascalCaseNmae(): string {
    return this.name;
  }

  snakeCaseName(): string {
    return toSnakeCase(this.name);
  }
}

export class FieldMeta {
  constructor(private name: string, public type: DataType) {}

  camelCaseName(): string {
    return this.name;
  }

  snakeCaseName(): string {
    return toSnakeCase(this.name);
  }
}
