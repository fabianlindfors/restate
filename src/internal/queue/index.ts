import { createTestConsumerRunner } from "./test";
import { SqliteQueue } from "./SqliteQueue";

interface Queue {
  run(): Promise<void>;
}

export { Queue, createTestConsumerRunner, SqliteQueue };
