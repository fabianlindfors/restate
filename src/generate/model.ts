import { toSnakeCase } from "js-convert-case";
import {
  EnumDeclarationStructure,
  EnumMemberStructure,
  FunctionDeclarationStructure,
  ImportDeclarationStructure,
  InterfaceDeclarationStructure,
  MethodSignatureStructure,
  ParameterDeclarationStructure,
  PropertySignatureStructure,
  StatementStructures,
  StructureKind,
  TypeAliasDeclarationStructure,
  VariableDeclarationKind,
  VariableStatementStructure,
  WriterFunction,
  Writers,
} from "ts-morph";
import { Model, Transition, State, Field } from "../ast";
import { statesToType } from "./helpers";

export function generateModelFile(model: Model): StatementStructures[] {
  return [
    ...imports(),
    anyType(model),
    anyTransitionType(model),
    stateEnum(model),
    transitionEnum(model),
    ...stateTypes(model),
    ...transitionTypes(model),
    transitionInterface(model),
    ...queryTypes(model),
    modelMeta(model),
    createConsumerFunction(model),
  ];
}

function imports(): ImportDeclarationStructure[] {
  return [
    {
      kind: StructureKind.ImportDeclaration,
      namespaceImport: "__Internal",
      moduleSpecifier: "../internal",
    },
    {
      kind: StructureKind.ImportDeclaration,
      namedImports: ["RestateClient"],
      moduleSpecifier: "./",
    },
  ];
}

function anyType(model: Model): TypeAliasDeclarationStructure {
  const states = model.getStates();

  let type: string | WriterFunction;
  if (states.length == 1) {
    type = states[0].pascalCaseName();
  } else {
    const [state1, state2, ...restStates] = model.getStates();
    type = Writers.unionType(
      state1.pascalCaseName(),
      state2.pascalCaseName(),
      ...restStates.map((state) => state.pascalCaseName())
    );
  }

  return {
    name: "Any",
    kind: StructureKind.TypeAlias,
    type,
    isExported: true,
  };
}

function anyTransitionType(model: Model): TypeAliasDeclarationStructure {
  const transitions = model.getTransitions();

  let type: string | WriterFunction;
  if (transitions.length == 1) {
    type = transitions[0].pascalCaseName();
  } else {
    const [transition1, transition2, ...restTransitions] =
      model.getTransitions();
    type = Writers.unionType(
      transition1.pascalCaseName(),
      transition2.pascalCaseName(),
      ...restTransitions.map((transition) => transition.pascalCaseName())
    );
  }

  return {
    name: "AnyTransition",
    kind: StructureKind.TypeAlias,
    type,
    isExported: true,
  };
}

function stateEnum(model: Model): EnumDeclarationStructure {
  const members: EnumMemberStructure[] = model.getStates().map((state) => ({
    kind: StructureKind.EnumMember,
    name: state.pascalCaseName(),
    initializer: `"${toSnakeCase(state.pascalCaseName())}"`,
  }));

  return {
    kind: StructureKind.Enum,
    name: "State",
    isExported: true,
    members,
  };
}

function transitionEnum(model: Model): EnumDeclarationStructure {
  const members: EnumMemberStructure[] = model
    .getTransitions()
    .map((transition) => ({
      kind: StructureKind.EnumMember,
      name: transition.pascalCaseName(),
      initializer: `"${transition.snakeCaseName()}"`,
    }));

  return {
    kind: StructureKind.Enum,
    name: "Transition",
    isExported: true,
    members,
  };
}

function stateTypes(model: Model): InterfaceDeclarationStructure[] {
  return model.getStates().map((state) => {
    const properties = Array.from(state.getFields().values()).map((field) => {
      return {
        name: field.camelCaseName(),
        type: field.getType().getTypescriptType(),
        hasQuestionToken: field.getType().canBeUndefined(),
      };
    });

    return {
      name: state.pascalCaseName(),
      kind: StructureKind.Interface,
      properties: [
        {
          name: "id",
          type: "string",
        },
        {
          name: "state",
          type: `State.${state.pascalCaseName()}`,
        },
        ...properties,
      ],
      isExported: true,
    };
  });
}

function transitionTypes(
  model: Model
): (InterfaceDeclarationStructure | TypeAliasDeclarationStructure)[] {
  return model.getTransitions().flatMap((transition) => {
    const transitionType: InterfaceDeclarationStructure = {
      kind: StructureKind.Interface,
      name: transition.pascalCaseName(),
      isExported: true,
      properties: [
        {
          name: "id",
          type: "string",
        },
        {
          name: "objectId",
          type: "string",
        },
        {
          name: "model",
          type: `"${model.pascalCaseName()}"`,
        },
        {
          name: "type",
          type: `Transition.${transition.pascalCaseName()}`,
        },
        {
          name: "data",
          type: `${transition.pascalCaseName()}Data`,
        },
        {
          name: "note",
          type: "string",
          hasQuestionToken: true,
        },
        {
          name: "triggeredBy",
          type: "string | null",
        },
      ],
    };

    const dataProperties = transition.getFields().map((field) => {
      return {
        name: field.camelCaseName(),
        type: field.getType().getTypescriptType(),
        hasQuestionToken: field.getType().canBeUndefined(),
      };
    });

    const dataType: InterfaceDeclarationStructure = {
      name: `${transition.pascalCaseName()}Data`,
      kind: StructureKind.Interface,
      properties: [...dataProperties],
      isExported: true,
    };

    return [transitionType, dataType];
  });
}

function transitionInterface(model: Model): InterfaceDeclarationStructure {
  const methods = model
    .getTransitions()
    .map((transition) => transitionMethodSignature(model, transition));

  return {
    name: `TransitionImpl`,
    kind: StructureKind.Interface,
    methods,
    isExported: true,
  };
}

function transitionMethodSignature(
  model: Model,
  transition: Transition
): MethodSignatureStructure {
  let parameters: ParameterDeclarationStructure[] = [
    {
      kind: StructureKind.Parameter,
      name: "client",
      type: "RestateClient",
    },
  ];

  const fromStates = transition.getFromStates();
  if (fromStates) {
    const parameterType =
      fromStates == "*" ? model.pascalCaseName() : statesToType(fromStates);
    parameters.push({
      kind: StructureKind.Parameter,
      name: "original",
      type: parameterType,
    });
  }

  parameters.push({
    kind: StructureKind.Parameter,
    name: "transition",
    type: `${transition.pascalCaseName()}`,
  });

  const toStates = transition.getToStates();
  const returnType =
    toStates == "*" ? `${model.pascalCaseName()}.Any` : statesToType(toStates);

  return {
    kind: StructureKind.MethodSignature,
    name: transition.camelCaseName(),
    parameters: parameters,
    returnType: `Promise<Omit<${returnType}, "id">>`,
  };
}

function queryTypes(model: Model): StatementStructures[] {
  const flattenedFields: Map<string, Field> = new Map();
  for (const state of model.getStates()) {
    for (const field of state.getFields()) {
      flattenedFields.set(field.pascalCaseName(), field);
    }
  }

  const properties: PropertySignatureStructure[] = Array.from(
    flattenedFields.values()
  ).map((field) => {
    return {
      kind: StructureKind.PropertySignature,
      name: field.camelCaseName(),
      type: field.getType().getTypescriptType(),
      hasQuestionToken: true,
    };
  });

  const queryFilter: InterfaceDeclarationStructure = {
    name: "QueryFilter",
    kind: StructureKind.Interface,
    properties: [
      {
        name: "id",
        type: "string",
        hasQuestionToken: true,
      },
      {
        name: "state",
        type: "State | State[]",
        hasQuestionToken: true,
      },
      ...properties,
    ],
    isExported: true,
  };

  let enumToStateMappings: string[] = [];
  for (const state of model.getStates()) {
    enumToStateMappings.push(
      `E extends State.${state.pascalCaseName()} ? ${state.pascalCaseName()} :`
    );
  }
  const enumToStateType: TypeAliasDeclarationStructure = {
    kind: StructureKind.TypeAlias,
    name: "EnumToState",
    typeParameters: ["E"],
    type: `
			E extends any ? (
				${enumToStateMappings.join("\n")}
				never
			) : never
		`,
  };

  const resultFromFilter: TypeAliasDeclarationStructure = {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: "ResultFromQueryFilter",
    typeParameters: ["T extends QueryFilter", "S"],
    type: `
			T["state"] extends S ? EnumToState<T["state"]> :
			T["state"] extends S[] ? EnumToState<__Internal.ArrayElementType<T["state"]>> :
			Any
		`,
  };

  let enumToTransitionMappings: string[] = [];
  for (const transition of model.getTransitions()) {
    enumToTransitionMappings.push(
      `E extends Transition.${transition.pascalCaseName()} ? ${transition.pascalCaseName()} :`
    );
  }

  const enumToTransitionType: TypeAliasDeclarationStructure = {
    kind: StructureKind.TypeAlias,
    name: "EnumToTransition",
    typeParameters: ["E"],
    type: `
			E extends any ? (
				${enumToTransitionMappings.join("\n")}
				never
			) : never
		`,
  };

  const transitionFromFilter: TypeAliasDeclarationStructure = {
    kind: StructureKind.TypeAlias,
    isExported: true,
    name: "TransitionFromFilter",
    typeParameters: ["T", "S"],
    type: `
			T extends S ? EnumToTransition<T> :
			T extends S[] ? EnumToTransition<__Internal.ArrayElementType<T>> :
			AnyTransition
		`,
  };

  return [
    queryFilter,
    enumToStateType,
    resultFromFilter,
    enumToTransitionType,
    transitionFromFilter,
  ];
}

function modelMeta(model: Model): VariableStatementStructure {
  let statesObject: { [key: string]: WriterFunction } = {};
  for (const state of model.getStates()) {
    let fieldsObject: { [key: string]: WriterFunction } = {};

    for (const field of state.getFields()) {
      fieldsObject[field.camelCaseName()] = Writers.object({
        name: `"${field.camelCaseName()}"`,
        type: `${field.getType().initializer()}`,
      });
    }

    statesObject[state.pascalCaseName()] = Writers.object({
      name: `"${state.pascalCaseName()}"`,
      fields: Writers.object(fieldsObject),
    });
  }

  let transitionsObject: { [key: string]: WriterFunction } = {};
  for (const transition of model.getTransitions()) {
    let fieldsObject: { [key: string]: WriterFunction } = {};

    for (const field of transition.getFields()) {
      fieldsObject[field.camelCaseName()] = Writers.object({
        name: `"${field.camelCaseName()}"`,
        type: `${field.getType().initializer()}`,
      });
    }

    let fromStatesDefinition: string = "undefined";
    const fromStates = transition.getFromStates();
    if (fromStates) {
      let fromStatesExpanded: State[] = [];
      if (fromStates == "*") {
        fromStatesExpanded = model.getStates();
      } else {
        fromStatesExpanded = fromStates;
      }
      const fromStatesJoined = fromStatesExpanded
        .map((state) => `"${state.pascalCaseName()}"`)
        .join();
      fromStatesDefinition = `[${fromStatesJoined}]`;
    }

    let toStatesExpanded: State[] = [];
    const toStates = transition.getToStates();
    if (toStates == "*") {
      toStatesExpanded = model.getStates();
    } else {
      toStatesExpanded = toStates;
    }
    const toStatesJoined = toStatesExpanded
      .map((state) => `"${state.pascalCaseName()}"`)
      .join();
    const toStatesDefinition = `[${toStatesJoined}]`;

    transitionsObject[transition.pascalCaseName()] = Writers.object({
      name: `"${transition.pascalCaseName()}"`,
      fields: Writers.object(fieldsObject),
      fromStates: fromStatesDefinition,
      toStates: toStatesDefinition,
    });
  }

  let metaObject: any = {
    name: `"${model.pascalCaseName()}"`,
    states: Writers.object(statesObject),
    transitions: Writers.object(transitionsObject),
  };

  if (model.getPrefix()) {
    metaObject.prefix = `"${model.getPrefix()}"`;
  }

  return {
    kind: StructureKind.VariableStatement,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: `__Meta`,
        type: "__Internal.ModelMeta",
        initializer: Writers.object(metaObject),
      },
    ],
    isExported: true,
  };
}

function createConsumerFunction(model: Model): FunctionDeclarationStructure {
  return {
    kind: StructureKind.Function,
    name: "createConsumer",
    typeParameters: ["T extends Transition | Transition[]"],
    isExported: true,
    parameters: [
      {
        name: "consumer",
        type: "{ name: string; transition: T; handler: (client: RestateClient, model: Any, transition: TransitionFromFilter<T, Transition>) => Promise<void> }",
      },
    ],
    statements: [
      "const { name, transition, handler } = consumer",
      "const arrayifiedTransitions: string | string[] = Array.isArray(transition) ? transition : [transition]",
      "return new __Internal.Consumer(name, __Meta, arrayifiedTransitions, handler)",
    ],
  };
}
