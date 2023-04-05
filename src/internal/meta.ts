import { DataType } from "./dataTypes";

export type ModelMeta = {
  // Name in PascalCase
  name: string;
  states: { [key: string]: StateMeta };
  transitions: { [key: string]: TransitionMeta };
  prefix: string;
};

export type StateMeta = {
  // Name in PascalCase
  name: string;
  fields: { [key: string]: FieldMeta };
};

export type TransitionMeta = {
  // Name in camelCase
  name: string;
  fields: { [key: string]: FieldMeta };
  fromStates?: string[];
  toStates: string[];
};

export type FieldMeta = {
  // name in camelCase
  name: string;
  type: DataType;
};
