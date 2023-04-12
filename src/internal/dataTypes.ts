import * as Parser from "../parser";

export interface DataType {
  validate(value: any): void;
  getTypescriptType(): string;
  canBeUndefined(): boolean;
  initializer(): string;
}

export function dataTypeFromParsed(type: Parser.Type): DataType {
  switch (type.name) {
    case "String":
      return new String();
    case "Int":
      return new Int();
    case "Decimal":
      return new Decimal();
    case "Optional":
      const nested = dataTypeFromParsed(type.nested as Parser.Type);
      return new Optional(nested);
    case "Bool":
      return new Bool();
    default:
      throw new Error(`unsupported type "${type.name}"`);
  }
}

export class String implements DataType {
  validate(value: any) {
    if (typeof value !== "string") {
      throw new Error("not a string");
    }
  }

  getTypescriptType(): string {
    return "string";
  }

  canBeUndefined(): boolean {
    return false;
  }

  initializer(): string {
    return `new __Internal.String()`;
  }
}

export class Int implements DataType {
  validate(value: any) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      throw new Error("not an integer");
    }
  }

  getTypescriptType(): string {
    return "number";
  }

  canBeUndefined(): boolean {
    return false;
  }

  initializer(): string {
    return `new __Internal.Int()`;
  }
}

export class Decimal implements DataType {
  validate(value: any) {
    if (typeof value !== "number") {
      throw new Error("not a number");
    }
  }

  getTypescriptType(): string {
    return "number";
  }

  canBeUndefined(): boolean {
    return false;
  }

  initializer(): string {
    return `new __Internal.Decimal()`;
  }
}

export class Optional implements DataType {
  constructor(private nestedType: DataType) {}

  validate(value: any) {
    if (value !== undefined && value !== null) {
      this.nestedType.validate(value);
    }
  }

  getTypescriptType(): string {
    return this.nestedType.getTypescriptType();
  }

  canBeUndefined(): boolean {
    return true;
  }

  initializer(): string {
    return `new __Internal.Optional(${this.nestedType.initializer()})`;
  }

  getNestedType(): DataType {
    return this.nestedType;
  }
}

export class Bool implements DataType {
  validate(value: any) {
    if (typeof value !== "boolean") {
      throw new Error("not a boolean");
    }
  }

  getTypescriptType(): string {
    return "boolean";
  }

  canBeUndefined(): boolean {
    return false;
  }

  initializer(): string {
    return `new __Internal.Bool()`;
  }
}
