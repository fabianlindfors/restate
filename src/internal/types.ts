export type ArrayElementType<Type extends any[]> =
  Type extends readonly (infer ElementType)[] ? ElementType : never;

export interface QueryParams<Filter> {
  where?: Filter;
  limit?: number;
}
