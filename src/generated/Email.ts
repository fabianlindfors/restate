import * as __Internal from "../internal";
import { RestateClient } from "./";
export type Any = Created | Sent;
export type AnyTransition = Create | Send;

export enum State {
    Created = "created",
    Sent = "sent"
}

export enum Transition {
    Create = "create",
    Send = "send"
}

export interface Created {
    id: string;
    state: State.Created;
    userId: string;
    subject: string;
}

export interface Sent {
    id: string;
    state: State.Sent;
    userId: string;
    subject: string;
}

export interface Create {
    id: string;
    objectId: string;
    model: "Email";
    type: Transition.Create;
    data: CreateData;
    note?: string;
}

export interface CreateData {
    userId: string;
    subject: string;
}

export interface Send {
    id: string;
    objectId: string;
    model: "Email";
    type: Transition.Send;
    data: SendData;
    note?: string;
}

export interface SendData {
}

export interface TransitionImpl {
    create(client: RestateClient, transition: Create): Promise<Omit<Created, "id">>;
    send(client: RestateClient, original: Created, transition: Send): Promise<Omit<Sent, "id">>;
}

export interface QueryFilter {
    id?: string;
    state?: State | State[];
    userId?: string;
    subject?: string;
}

type EnumToState<E> = 
    			E extends any ? (
    				E extends State.Created ? Created :
    E extends State.Sent ? Sent :
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
    E extends Transition.Send ? Send :
    				never
    			) : never
    		;
export type TransitionFromFilter<T, S> = 
    			T extends S ? EnumToTransition<T> :
    			T extends S[] ? EnumToTransition<__Internal.ArrayElementType<T>> :
    			AnyTransition
    		;
export const __Meta: __Internal.ModelMeta = {
        name: "Email",
        states: {
            Created: {
                name: "Created",
                fields: {
                    userId: {
                        name: "userId",
                        type: new __Internal.String()
                    },
                    subject: {
                        name: "subject",
                        type: new __Internal.String()
                    }
                }
            },
            Sent: {
                name: "Sent",
                fields: {
                    userId: {
                        name: "userId",
                        type: new __Internal.String()
                    },
                    subject: {
                        name: "subject",
                        type: new __Internal.String()
                    }
                }
            }
        },
        transitions: {
            Create: {
                name: "Create",
                fields: {
                    userId: {
                        name: "userId",
                        type: new __Internal.String()
                    },
                    subject: {
                        name: "subject",
                        type: new __Internal.String()
                    }
                },
                fromStates: undefined,
                toStates: ["Created"]
            },
            Send: {
                name: "Send",
                fields: {},
                fromStates: ["Created"],
                toStates: ["Sent"]
            }
        },
        prefix: "email"
    };

export function createConsumer<T extends Transition | Transition[]>(consumer: { name: string; transition: T; handler: (client: RestateClient, model: Any, transition: TransitionFromFilter<T, Transition>) => Promise<void> }) {
    const { name, transition, handler } = consumer
    const arrayifiedTransitions: string | string[] = Array.isArray(transition) ? transition : [transition]
    return new __Internal.Consumer(name, __Meta, arrayifiedTransitions, handler)
}
