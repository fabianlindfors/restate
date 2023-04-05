import { State } from "../ast";

export function statesToType(states: State[]): string {
  return states.map((state) => state.pascalCaseName()).join(" | ");
}
