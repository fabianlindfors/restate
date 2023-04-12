import { toCamelCase } from "js-convert-case";
import {
  ts,
  ClassDeclarationStructure,
  ConstructorDeclarationStructure,
  PropertyDeclarationStructure,
  StatementStructures,
  StructureKind,
  VariableStatementStructure,
  printNode,
  MethodDeclarationStructure,
  ParameterDeclarationStructure,
  ImportDeclarationStructure,
  ExportDeclarationStructure,
  InterfaceDeclarationStructure,
  Scope,
  FunctionDeclarationStructure,
  VariableDeclarationKind,
} from "ts-morph";
import { Model, Transition } from "../ast";

export function generateDbFile(models: Model[]): StatementStructures[] {
  const modelClientDeclarations = models.map(modelClientClass);
  const modelTransitionsClientDeclarations = models.map(modelTransitionsClass);

  return [
    ...imports(models),
    ...reexports(models),
    transitonImplType(models),
    modelMetasConstant(models),
    projectType(),
    testClientFunction(),
    clientClass(models),
    ...modelClientDeclarations,
    ...modelTransitionsClientDeclarations,
  ];
}

function imports(models: Model[]): ImportDeclarationStructure[] {
  const modelImports: ImportDeclarationStructure[] = models.map((model) => ({
    kind: StructureKind.ImportDeclaration,
    namespaceImport: model.pascalCaseName(),
    moduleSpecifier: `./${model.pascalCaseName()}`,
  }));

  const internalImport: ImportDeclarationStructure = {
    kind: StructureKind.ImportDeclaration,
    namespaceImport: "__Internal",
    moduleSpecifier: "../internal",
  };

  return [...modelImports, internalImport];
}

function reexports(models: Model[]): ExportDeclarationStructure[] {
  return models.map((model) => ({
    kind: StructureKind.ExportDeclaration,
    namespaceExport: model.pascalCaseName(),
    moduleSpecifier: `./${model.pascalCaseName()}`,
  }));
}

function transitonImplType(models: Model[]): InterfaceDeclarationStructure {
  const properties = models.map((model) => {
    return {
      name: toCamelCase(model.pascalCaseName()),
      type: `${model.pascalCaseName()}.TransitionImpl`,
    };
  });

  return {
    name: "TransitionImpls",
    kind: StructureKind.Interface,
    properties,
    isExported: true,
  };
}

function modelMetasConstant(models: Model[]): VariableStatementStructure {
  return {
    kind: StructureKind.VariableStatement,
    declarationKind: VariableDeclarationKind.Const,
    declarations: [
      {
        name: "__ModelMetas",
        type: "__Internal.ModelMeta[]",
        initializer:
          "[" +
          models.map((model) => `${model.pascalCaseName()}.__Meta`).join(", ") +
          "]",
      },
    ],
    isExported: true,
  };
}

function projectType(): InterfaceDeclarationStructure {
  return {
    name: "RestateProject",
    kind: StructureKind.Interface,
    properties: [
      {
        name: "main",
        type: "(restate: RestateClient) => Promise<void>",
      },
      {
        name: "transitions",
        type: "TransitionImpls",
      },
      {
        name: "consumers",
        type: "__Internal.Consumer[]",
      },
    ],
    isExported: true,
  };
}

function testClientFunction(): FunctionDeclarationStructure {
  return {
    kind: StructureKind.Function,
    name: "setupTestClient",
    isExported: true,
    isAsync: true,
    parameters: [
      {
        name: "project",
        type: "RestateProject",
      },
    ],
    returnType: "Promise<RestateClient>",
    statements: [
      "const db = new __Internal.TestDb(__ModelMetas)",
      "await db.setup()",
      "await db.migrate()",
      "const client = new RestateClient(project, db)",
      "const consumerCallback = __Internal.createTestConsumerRunner(project, client)",
      "db.setTransitionCallback(consumerCallback)",
      "return client",
    ],
  };
}

function clientClass(models: Model[]): ClassDeclarationStructure {
  const modelClientProperties: PropertyDeclarationStructure[] = models.map(
    (model) => {
      return {
        kind: StructureKind.Property,
        name: toCamelCase(model.pascalCaseName()),
        type: modelClientClassName(model),
      };
    }
  );

  const internalDbProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    name: "__db",
    type: "__Internal.Db",
  };

  const internalConfigProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    name: "__project",
    type: "RestateProject",
  };

  const internalTriggeredByPropery: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    name: "__triggeredBy",
    type: "string | null",
    initializer: "null",
  };

  const modelPropertyAssignments: string[] = models.map((model) =>
    // `this.{MODEL_NAME} = new {MODEL_NAME}Db(this.__db)`
    printNode(
      ts.factory.createExpressionStatement(
        ts.factory.createBinaryExpression(
          ts.factory.createPropertyAccessExpression(
            ts.factory.createThis(),
            ts.factory.createIdentifier(toCamelCase(model.pascalCaseName()))
          ),
          ts.factory.createToken(ts.SyntaxKind.EqualsToken),
          ts.factory.createNewExpression(
            ts.factory.createIdentifier(modelClientClassName(model)),
            undefined,
            [ts.factory.createThis()]
          )
        )
      )
    )
  );

  const internalDbAssignment = "this.__db = db";
  const internalConfigAssignment = "this.__project = project";

  const constructor: ConstructorDeclarationStructure = {
    kind: StructureKind.Constructor,
    parameters: [
      {
        kind: StructureKind.Parameter,
        name: "project",
        type: "RestateProject",
      },
      {
        kind: StructureKind.Parameter,
        name: "db",
        type: "__Internal.Db",
      },
    ],
    statements: [
      internalDbAssignment,
      internalConfigAssignment,
      ...modelPropertyAssignments,
    ],
  };

  const setupMethod: MethodDeclarationStructure = {
    kind: StructureKind.Method,
    name: "setup",
    statements: ["await this.__db.setup();"],
    isAsync: true,
    returnType: `Promise<void>`,
  };

  const migrateMethod: MethodDeclarationStructure = {
    kind: StructureKind.Method,
    name: "migrate",
    statements: ["await this.__db.migrate();"],
    isAsync: true,
    returnType: `Promise<void>`,
  };

  const closeMethod: MethodDeclarationStructure = {
    kind: StructureKind.Method,
    name: "close",
    statements: ["await this.__db.close();"],
    isAsync: true,
    returnType: `Promise<void>`,
  };

  const withTriggeredByMethod: MethodDeclarationStructure = {
    kind: StructureKind.Method,
    name: "withTriggeredBy",
    statements: [
      "const newClient = new RestateClient(this.__project, this.__db)",
      "newClient.__triggeredBy = triggeredBy",
      "return newClient",
    ],
    parameters: [
      {
        kind: StructureKind.Parameter,
        name: "triggeredBy",
        type: "string",
      },
    ],
    returnType: `RestateClient`,
  };

  return {
    kind: StructureKind.Class,
    name: "RestateClient",
    properties: [
      ...modelClientProperties,
      internalDbProperty,
      internalConfigProperty,
      internalTriggeredByPropery,
    ],
    ctors: [constructor],
    methods: [setupMethod, migrateMethod, closeMethod, withTriggeredByMethod],
    isExported: true,
  };
}

function modelClientClass(model: Model): ClassDeclarationStructure {
  const internalClientProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    scope: Scope.Private,
    name: "parent",
    type: "RestateClient",
  };

  const transitionClientProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    scope: Scope.Public,
    name: "transition",
    type: modelTransitionsClassName(model),
  };

  const constructor: ConstructorDeclarationStructure = {
    kind: StructureKind.Constructor,
    parameters: [
      {
        kind: StructureKind.Parameter,
        name: "parent",
        type: "RestateClient",
      },
    ],
    statements: [
      `super(parent.__db, ${model.pascalCaseName()}.__Meta)`,
      "this.parent = parent",
      `this.transition = new ${modelTransitionsClassName(model)}(parent)`,
    ],
  };

  const methods = [];

  return {
    kind: StructureKind.Class,
    name: modelClientClassName(model),
    properties: [internalClientProperty, transitionClientProperty],
    methods: [...modelQueryMethods(model), ...modelGetTransitionMethods(model)],
    ctors: [constructor],
    extends: "__Internal.BaseClient",
  };
}

function modelTransitionsClass(model: Model): ClassDeclarationStructure {
  const internalClientProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    scope: Scope.Private,
    name: "parent",
    type: "RestateClient",
  };

  const transitionImplsProperty: PropertyDeclarationStructure = {
    kind: StructureKind.Property,
    scope: Scope.Private,
    name: "transitionImpls",
    type: `${model.pascalCaseName()}.TransitionImpl`,
  };

  const transitionMethods: MethodDeclarationStructure[] = model
    .getTransitions()
    .map((transition) => modelDbClassTransitionMethod(model, transition));

  const constructor: ConstructorDeclarationStructure = {
    kind: StructureKind.Constructor,
    parameters: [
      {
        kind: StructureKind.Parameter,
        name: "parent",
        type: "RestateClient",
      },
    ],
    statements: [
      `super(parent.__db, ${model.pascalCaseName()}.__Meta)`,
      "this.parent = parent",
      `this.transitionImpls = parent.__project.transitions.${model.camelCaseName()}`,
    ],
  };

  return {
    kind: StructureKind.Class,
    name: modelTransitionsClassName(model),
    extends: `__Internal.BaseTransitionsClient`,
    properties: [internalClientProperty, transitionImplsProperty],
    methods: [...transitionMethods],
    ctors: [constructor],
  };
}

function modelQueryMethods(model: Model): MethodDeclarationStructure[] {
  const typeParameters: string[] = [
    `F extends ${model.pascalCaseName()}.QueryFilter`,
    `Out extends ${model.pascalCaseName()}.ResultFromQueryFilter<F, ${model.pascalCaseName()}.State>`,
  ];

  const filterParameter: ParameterDeclarationStructure = {
    kind: StructureKind.Parameter,
    name: "params",
    type: "__Internal.QueryParams<F>",
    hasQuestionToken: true,
  };

  return [
    {
      kind: StructureKind.Method,
      name: "findOne",
      typeParameters,
      parameters: [filterParameter],
      statements: [
        `const result = await this.internalFindOne(params || {});`,
        `return result as Out | undefined`,
      ],
      isAsync: true,
      returnType: `Promise<Out | undefined>`,
    },
    {
      kind: StructureKind.Method,
      name: "findOneOrThrow",
      typeParameters,
      parameters: [filterParameter],
      statements: [
        `const result = await this.internalFindOneOrThrow(params || {});`,
        `return result as Out`,
      ],
      isAsync: true,
      returnType: `Promise<Out>`,
    },
    {
      kind: StructureKind.Method,
      name: "findAll",
      typeParameters,
      parameters: [filterParameter],
      statements: [
        `const result = await this.internalFindAll(params || {});`,
        `return result as Out[]`,
      ],
      isAsync: true,
      returnType: `Promise<Out[]>`,
    },
  ];
}

function modelGetTransitionMethods(model: Model): MethodDeclarationStructure[] {
  const transitionType = `__Internal.Transition<${model.pascalCaseName()}.AnyTransition, ${model.pascalCaseName()}.Transition>`;

  return [
    {
      kind: StructureKind.Method,
      name: "getTransition",
      parameters: [
        {
          kind: StructureKind.Parameter,
          name: "id",
          type: "string",
        },
      ],
      statements: [
        `const result = await this.getTransitionById(id);`,
        `return result as ${transitionType}`,
      ],
      isAsync: true,
      returnType: `Promise<${transitionType}>`,
    },
    {
      kind: StructureKind.Method,
      name: "getObjectTransitions",
      parameters: [
        {
          kind: StructureKind.Parameter,
          name: "object",
          type: `string | ${model.pascalCaseName()}.Any`,
        },
      ],
      statements: [
        "const id = typeof object == 'string' ? object : object.id;",
        `const result = await this.getTransitionsForObject(id);`,
        `return result as ${transitionType}[]`,
      ],
      isAsync: true,
      returnType: `Promise<${transitionType}[]>`,
    },
  ];
}

function modelDbClassTransitionMethod(
  model: Model,
  transition: Transition
): MethodDeclarationStructure {
  let parameterUnionTypes = ["__Internal.TransitionParameters"];
  let requiresParameters = false;

  // From state is not defined for initializing transition
  const fromStates = transition.getFromStates();
  if (fromStates) {
    const fromStatesType =
      fromStates == "*"
        ? `${model.pascalCaseName()}.Any`
        : fromStates
            .map(
              (state) => `${model.pascalCaseName()}.${state.pascalCaseName()}`
            )
            .join(" | ");

    parameterUnionTypes.push(
      `__Internal.TransitionWithObject<${fromStatesType}>`
    );
    requiresParameters = true;
  }

  if (transition.getFields().length != 0) {
    parameterUnionTypes.push(
      `__Internal.TransitionWithData<${model.pascalCaseName()}.${transition.pascalCaseName()}Data>`
    );
    requiresParameters = true;
  }

  let parameters: ParameterDeclarationStructure[] = [
    {
      kind: StructureKind.Parameter,
      name: "params",
      type: parameterUnionTypes.join(" & "),
      initializer: !requiresParameters ? "{}" : undefined,
    },
  ];

  const statements: string[] = [];
  if (fromStates) {
    statements.push(
      `const fn = async (object: any, transition: any) => await this.transitionImpls.${transition.camelCaseName()}(this.parent.withTriggeredBy(transition.id), object, transition);`,
      "const id = typeof params.object == 'string' ? params.object : params.object.id;",
      `const { updatedObject, updatedTransition } = await this.applyTransition(${model.pascalCaseName()}.__Meta.transitions.${transition.pascalCaseName()}, params, id, fn, this.parent.__triggeredBy);`
    );
  } else {
    statements.push(
      `const fn = async (object: any, transition: any) => await this.transitionImpls.${transition.camelCaseName()}(this.parent.withTriggeredBy(transition.id), transition);`,
      `const { updatedObject, updatedTransition } = await this.applyTransition(${model.pascalCaseName()}.__Meta.transitions.${transition.pascalCaseName()}, params, undefined, fn, this.parent.__triggeredBy);`
    );
  }

  const toStates = transition.getToStates();
  const toStateType =
    toStates == "*"
      ? `${model.pascalCaseName()}.Any`
      : toStates
          .map((state) => `${model.pascalCaseName()}.${state.pascalCaseName()}`)
          .join(" | ");

  const transitionType = `${model.pascalCaseName()}.${transition.pascalCaseName()}`;

  statements.push(
    `return [updatedObject as ${toStateType}, updatedTransition as ${transitionType}];`
  );

  return {
    kind: StructureKind.Method,
    name: transition.camelCaseName(),
    parameters: parameters,
    statements,
    isAsync: true,
    returnType: `Promise<[${toStateType}, ${transitionType}]>`,
  };
}

function modelClientClassName(model: Model): string {
  return `${model.pascalCaseName()}Client`;
}

function modelTransitionsClassName(model: Model): string {
  return `${model.pascalCaseName()}TransitionsClient`;
}
