export default interface Transition<Data, Type> {
  id: string;
  objectId: string;
  model: string;
  type: Type;
  from: string | null;
  to: string;
  data: Data;
  triggeredBy?: string;
  note?: string;
  appliedAt: Date;
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
