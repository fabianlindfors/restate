import * as __Internal from "../internal";
import { RestateClient } from "./";
export type Any = Created;
export type AnyTransition = Create;

export enum State {
    Created = "created"
}

export enum Transition {
    Create = "create"
}

export interface Created {
    id: string;
    state: State.Created;
    string: string;
    integer: number;
    decimal: number;
    optional?: number;
    boolean: boolean;
}

export interface Create {
    id: string;
    objectId: string;
    model: "TypesTest";
    type: Transition.Create;
    data: CreateData;
    note?: string;
}

export interface CreateData {
    string: string;
    integer: number;
    decimal: number;
    optional?: number;
    boolean: boolean;
}

export interface TransitionImpl {
    create(client: RestateClient, transition: Create): Promise<Omit<Created, "id">>;
}

export interface QueryFilter {
    id?: string;
    state?: State | State[];
    string?: string;
    integer?: number;
    decimal?: number;
    optional?: number;
    boolean?: boolean;
}

type EnumToState<E> = 
    			E extends any ? (
    				E extends State.Created ? Created :
    				never
    			) : never
    		;
export type ResultFromQueryFilter<T extends QueryFilter, S> = 
    			T["state"] extends S ? EnumToState<T["state"]> :
    			T["state"] extends S[] ? EnumToState<__Internal.ArrayElementType<T["state"]>> :
    			Any
    		;
type EnumToTransition<E> = 
    			E extends any ? (
    				E extends Transition.Create ? Create :
    				never
    			) : never
    		;
export type TransitionFromFilter<T, S> = 
    			T extends S ? EnumToTransition<T> :
    			T extends S[] ? EnumToTransition<__Internal.ArrayElementType<T>> :
    			AnyTransition
    		;
export const __Meta: __Internal.ModelMeta = {
        name: "TypesTest",
        states: {
            Created: {
                name: "Created",
                fields: {
                    string: {
                        name: "string",
                        type: new __Internal.String()
                    },
                    integer: {
                        name: "integer",
                        type: new __Internal.Int()
                    },
                    decimal: {
                        name: "decimal",
                        type: new __Internal.Decimal()
                    },
                    optional: {
                        name: "optional",
                        type: new __Internal.Optional(new __Internal.Int())
                    },
                    boolean: {
                        name: "boolean",
                        type: new __Internal.Bool()
                    }
                }
            }
        },
        transitions: {
            Create: {
                name: "Create",
                fields: {
                    string: {
                        name: "string",
                        type: new __Internal.String()
                    },
                    integer: {
                        name: "integer",
                        type: new __Internal.Int()
                    },
                    decimal: {
                        name: "decimal",
                        type: new __Internal.Decimal()
                    },
                    optional: {
                        name: "optional",
                        type: new __Internal.Optional(new __Internal.Int())
                    },
                    boolean: {
                        name: "boolean",
                        type: new __Internal.Bool()
                    }
                },
                fromStates: undefined,
                toStates: ["Created"]
            }
        },
        prefix: "tt"
    };

export function createConsumer<T extends Transition | Transition[]>(consumer: { name: string; transition: T; handler: (client: RestateClient, model: Any, transition: TransitionFromFilter<T, Transition>) => Promise<void> }) {
    const { name, transition, handler } = consumer
    const arrayifiedTransitions: string | string[] = Array.isArray(transition) ? transition : [transition]
    return new __Internal.Consumer(name, __Meta, arrayifiedTransitions, handler)
}
