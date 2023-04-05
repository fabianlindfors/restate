import * as __Internal from "../internal";
import { RestateClient } from "./";
export type Any = Created | Deleted;
export type AnyTransition = Create | CreateExtra | Delete;

export enum State {
    Created = "created",
    Deleted = "deleted"
}

export enum Transition {
    Create = "create",
    CreateExtra = "create_extra",
    Delete = "delete"
}

export interface Created {
    id: string;
    state: State.Created;
    name: string;
}

export interface Deleted {
    id: string;
    state: State.Deleted;
    name: string;
}

export interface Create {
    id: string;
    objectId: string;
    model: "User";
    type: Transition.Create;
    data: CreateData;
    note?: string;
}

export interface CreateData {
}

export interface CreateExtra {
    id: string;
    objectId: string;
    model: "User";
    type: Transition.CreateExtra;
    data: CreateExtraData;
    note?: string;
}

export interface CreateExtraData {
}

export interface Delete {
    id: string;
    objectId: string;
    model: "User";
    type: Transition.Delete;
    data: DeleteData;
    note?: string;
}

export interface DeleteData {
}

export interface TransitionImpl {
    create(client: RestateClient, transition: Create): Promise<Omit<Created, "id">>;
    createExtra(client: RestateClient, transition: CreateExtra): Promise<Omit<Created, "id">>;
    delete(client: RestateClient, original: Created, transition: Delete): Promise<Omit<Deleted, "id">>;
}

export interface QueryFilter {
    id?: string;
    state?: State | State[];
    name?: string;
}

type EnumToState<E> = 
    			E extends any ? (
    				E extends State.Created ? Created :
    E extends State.Deleted ? Deleted :
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
    E extends Transition.CreateExtra ? CreateExtra :
    E extends Transition.Delete ? Delete :
    				never
    			) : never
    		;
export type TransitionFromFilter<T, S> = 
    			T extends S ? EnumToTransition<T> :
    			T extends S[] ? EnumToTransition<__Internal.ArrayElementType<T>> :
    			AnyTransition
    		;
export const __Meta: __Internal.ModelMeta = {
        name: "User",
        states: {
            Created: {
                name: "Created",
                fields: {
                    name: {
                        name: "name",
                        type: new __Internal.String()
                    }
                }
            },
            Deleted: {
                name: "Deleted",
                fields: {
                    name: {
                        name: "name",
                        type: new __Internal.String()
                    }
                }
            }
        },
        transitions: {
            Create: {
                name: "Create",
                fields: {},
                fromStates: undefined,
                toStates: ["Created"]
            },
            CreateExtra: {
                name: "CreateExtra",
                fields: {},
                fromStates: undefined,
                toStates: ["Created"]
            },
            Delete: {
                name: "Delete",
                fields: {},
                fromStates: ["Created"],
                toStates: ["Deleted"]
            }
        },
        prefix: "user"
    };

export function createConsumer<T extends Transition | Transition[]>(consumer: { name: string; transition: T; handler: (client: RestateClient, model: Any, transition: TransitionFromFilter<T, Transition>) => Promise<void> }) {
    const { name, transition, handler } = consumer
    const arrayifiedTransitions: string | string[] = Array.isArray(transition) ? transition : [transition]
    return new __Internal.Consumer(name, __Meta, arrayifiedTransitions, handler)
}
