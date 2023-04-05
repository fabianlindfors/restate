import { toCamelCase, toPascalCase, toSnakeCase } from "js-convert-case";
import { DataType, dataTypeFromParsed } from "./internal/dataTypes";
import * as Parser from "./parser";

export class Model {
  private name: string;
  private states: Map<string, State>;
  private transitions: Map<string, Transition>;
  private prefix: string;

  constructor({ name, states, transitions, baseFields, prefix }: Parser.Model) {
    if (!prefix) {
      throw new Error(`Missing prefix for model ${name}`);
    }

    const newStates: Map<string, State> = kvToMap(
      states.map((state) => [state.name, new State(state)])
    );

    // Fill in the extended states
    states.forEach((state) => {
      const newState = newStates.get(state.name)!;
      newState.setExtendedStates(
        state.extends.map((extended) => newStates.get(extended)!)
      );
    });

    // Add fields from extended states
    newStates.forEach((state, _1, _2) => {
      baseFields.forEach((baseField) => {
        state.addField(new Field(baseField));
      });

      Model.addFieldsFromExtendedStates(state);
    });

    const newTransitions: Map<string, Transition> = kvToMap(
      transitions.map((transition) => [
        transition.name,
        new Transition(transition, newStates),
      ])
    );

    this.name = name;
    this.states = newStates;
    this.transitions = newTransitions;
    this.prefix = prefix.prefix;
  }

  private static addFieldsFromExtendedStates(state: State) {
    state.getExtendedStates().forEach((extended) => {
      // Add extended fields recursively
      Model.addFieldsFromExtendedStates(extended);

      extended.getFields().forEach((field) => state.addField(field));
    });
  }

  getStates(): State[] {
    return Array.from(this.states.values());
  }

  getTransitions(): Transition[] {
    return Array.from(this.transitions.values());
  }

  getPrefix(): string {
    return this.prefix;
  }

  pascalCaseName(): string {
    return this.name;
  }

  camelCaseName(): string {
    return toCamelCase(this.name);
  }
}

export class State {
  private name: string;
  private fields: Map<string, Field>;
  private extendedStates: State[];

  constructor({ name, fields }: Parser.State) {
    const newFields: Map<string, Field> = kvToMap(
      fields.map((field) => [field.name, new Field(field)])
    );

    this.name = name;
    this.fields = newFields;
    this.extendedStates = [];
  }

  addField(field: Field) {
    this.fields.set(field.camelCaseName(), field);
  }

  getFields(): Field[] {
    return Array.from(this.fields.values());
  }

  setExtendedStates(extended: State[]) {
    this.extendedStates = extended;
  }

  getExtendedStates(): State[] {
    return this.extendedStates;
  }

  pascalCaseName(): string {
    return this.name;
  }

  camelCaseName(): string {
    return toCamelCase(this.name);
  }
}

export class Field {
  private name: string;
  private type: DataType;

  constructor({ name, type }: Parser.Field) {
    this.name = name;
    this.type = dataTypeFromParsed(type);
  }

  pascalCaseName(): string {
    return toPascalCase(this.name);
  }

  camelCaseName(): string {
    return this.name;
  }

  getType(): DataType {
    return this.type;
  }
}

export class Transition {
  private name: string;
  private from?: State[] | "*";
  private to: State[] | "*";
  private fields: Map<string, Field>;

  constructor(
    { name, from, to, fields }: Parser.Transition,
    states: Map<string, State>
  ) {
    const fromState = (() => {
      if (!from) {
        return undefined;
      }
      return from[0] == "*" ? "*" : from.map((name) => states.get(name)!);
    })();

    const toState = to[0] == "*" ? "*" : to.map((name) => states.get(name)!);
    const newFields: Map<string, Field> = kvToMap(
      fields.map((field) => [field.name, new Field(field)])
    );

    this.name = name;
    this.from = fromState;
    this.to = toState;
    this.fields = newFields;
  }

  pascalCaseName(): string {
    return toPascalCase(this.name);
  }

  camelCaseName(): string {
    return toCamelCase(this.name);
  }

  snakeCaseName(): string {
    return toSnakeCase(this.name);
  }

  getFromStates(): undefined | State[] | "*" {
    return this.from;
  }

  getToStates(): State[] | "*" {
    return this.to;
  }

  getFields(): Field[] {
    return Array.from(this.fields.values());
  }
}

function kvToMap<K, V>(entries: [K, V][]): Map<K, V> {
  let map: Map<K, V> = new Map();

  for (const [key, value] of entries) {
    map.set(key, value);
  }

  return map;
}
