export default interface Transition<Data, Type> {
  id: string;
  objectId: string;
  model: string;
  type: Type;
  data: Data;
  triggeredBy?: string;
  note?: string;
}

export interface TransitionParameters {
  triggeredBy?: string;
  note?: string;
}

export interface TransitionWithObject<Object> {
  object: string | Object;
}

export interface TransitionWithData<Data> {
  data: Data;
}
