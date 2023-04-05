import { ulid } from "ulid";

export function generateTransactionId(): string {
    return generateId("tsn")
}

export function generateConsumerTaskId(): string {
    return generateId("task")
}

export function generateId(prefix: string): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}
