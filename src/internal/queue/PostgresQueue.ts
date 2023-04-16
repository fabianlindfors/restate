import { Client, ClientConfig, Connection } from "pg";
import { Pgoutput, PgoutputPlugin } from "pg-logical-replication";
import { Queue } from ".";
import Consumer, { Task } from "../consumer";
import { PostgresDb } from "../db";
import { ModelMeta, ProjectMeta, TransitionMeta } from "../meta";
import Project from "../project";
import Transition from "../transition";
import Logger from "../../cmd/logger";
import { createTasksForTransition, runTask } from "./common";

const MAX_TASKS = 10;
const TASK_PROCESS_INTERVAL_MS = 1_000;

const PUBLICATION_NAME = "restate_transitions_cdc";
const REPLICATION_SLOT_NAME = "restate_transitions_cdc";

// This class is responsible for finding enqueued tasks and running them.
// It will also automatically start a TaskEnqueuer, which is responsible for detecting new
// transitions and enqueueing tasks if there are any consumers interested in those tasks.
//
// To effectively use Postgres as a task queue, it uses SELECT FOR UPDATE and SKIP LOCKED.
// This way, multiple workers can fetch from the queue without grabbing the same tasks.
export class PostgresQueue implements Queue {
  private enqueuer: TaskEnqueuer;

  constructor(
    private logger: Logger,
    private projectMeta: ProjectMeta,
    private db: PostgresDb,
    private client: any,
    private project: Project
  ) {
    this.enqueuer = new TaskEnqueuer(logger, projectMeta, db, project);
  }

  async run(): Promise<void> {
    // Start enqueuer fully async
    (async () => {
      await this.enqueuer.run();
    })();

    await this.processTasks();
  }

  private async processTasks() {
    let numTasks = 0;

    // We need to run this in a transaction to make use of SELECT FOR UPDATE SKIP LOCKED
    this.db.transaction(async (txn) => {
      const tasks = await txn.getUnprocessedTasks(MAX_TASKS);
      numTasks = tasks.length;

      if (numTasks == 0) {
        return;
      }

      await Promise.all(
        tasks.map((task) =>
          runTask(txn, this.projectMeta, this.project, this.client, task)
        )
      );
    });

    // If no tasks were found, we wait a set interval and then try again
    // If tasks were found and processed, we simply try again immediately
    let waitTime = numTasks == 0 ? TASK_PROCESS_INTERVAL_MS : 0;
    setTimeout(async () => await this.processTasks(), waitTime);
  }
}

// This class sets up change data capture to detect when new transitions are inserted into the transitions table
// It achieves this by using logical replication, setting up a replication slot and listening for changes.
// When it detects a new transition having been inserted, it will find all consumers interested in that transition
// and create a new task for each of them. It won't actually run any tasks, that's handled by the worker process itself.
//
// Derived from https://github.com/kibae/pg-logical-replication
class TaskEnqueuer {
  private decodingPlugin: PgoutputPlugin;
  private client: Client;

  constructor(
    private logger: Logger,
    private projectMeta: ProjectMeta,
    private db: PostgresDb,
    private project: Project
  ) {
    this.decodingPlugin = new PgoutputPlugin({
      protoVersion: 1,
      publicationNames: [PUBLICATION_NAME],
    });
    this.client = new Client({
      replication: "database",
    } as ClientConfig);
  }

  async run() {
    await this.client.connect();

    // There can only be one worker consuming the change log. To ensure this, we
    // use an advisory lock. Only one worker will be able to hold the lock at any given
    // time and the others will be waiting for it to become available. This way, if the current
    // enqueueing worker fails, another one will automatically take its place.
    this.logger.debug(
      "Waiting for enqueuer lock (tasks will still be processed)"
    );
    await this.client.query("SELECT pg_advisory_lock(1)");
    this.logger.debug("Got lock-y! Starting enqueuer");

    // Set up replication if necessary. Only needs to be done once.
    await this.configureReplication();

    this.connection().on("copyData", ({ chunk }: { chunk: Buffer }) => {
      if (chunk[0] != 0x77 && chunk[0] != 0x6b) {
        this.logger.warn("Unknown message received from COPY", {
          message: chunk[0],
        });
        return;
      }

      const lsn =
        chunk.readUInt32BE(1).toString(16).toUpperCase() +
        "/" +
        chunk.readUInt32BE(5).toString(16).toUpperCase();

      if (chunk[0] == 0x77) {
        // XLogData
        // This indicates that a new change has happened and that the LSN has moved ahead
        this.onLog(lsn, this.decodingPlugin.parse(chunk.subarray(25)));
        this.acknowledge(lsn);
      } else if (chunk[0] == 0x6b) {
        // Primary keepalive message
        // These are heartbeats sent out by Postgres. If shouldRespond is true, we must ack, otherwise
        // Postgres will close our connection.
        const shouldRespond = !!chunk.readInt8(17);

        if (shouldRespond) {
          this.logger.debug("Acknowledging keepalive message", { lsn });
          this.acknowledge(lsn);
        }
      }
    });

    await this.decodingPlugin.start(
      this.client,
      REPLICATION_SLOT_NAME,
      "0/000000"
    );
  }

  private async configureReplication() {
    // Create publication for only the transitions table
    // We inject the PUBLICATION_NAME variable directly here, rather than use a parameterized query
    // as our connection is in replication mode and we can only use the simple query protocol.
    const { rows: existingPublicationSlots } = await this.client.query(
      `SELECT pubname FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}' LIMIT 1;`
    );
    if (existingPublicationSlots.length == 0) {
      this.logger.debug("Creating publication slot");
      await this.client.query(
        `CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE public.transitions`
      );
    }

    // Create replication slot which we'll use to get changes
    const { rows: existingReplicationSlots } = await this.client.query(
      `SELECT slot_name FROM pg_replication_slots WHERE slot_name = '${REPLICATION_SLOT_NAME}' LIMIT 1;`
    );
    if (existingReplicationSlots.length == 0) {
      this.logger.debug("Creating replication slot");
      await this.client.query(
        `SELECT pg_create_logical_replication_slot('${REPLICATION_SLOT_NAME}', 'pgoutput')`
      );
    }
  }

  async onLog(lsn: string, log: Pgoutput.Message) {
    if (log.tag != "insert") {
      return;
    }

    const transition = this.transitionFromLog(log);
    await this.createTasksForTransition(transition);
  }

  async acknowledge(lsn: string): Promise<boolean> {
    const slice = lsn.split("/");
    let [upperWAL, lowerWAL]: [number, number] = [
      parseInt(slice[0], 16),
      parseInt(slice[1], 16),
    ];

    // Timestamp as microseconds since midnight 2000-01-01
    const now = Date.now() - 946080000000;
    const upperTimestamp = Math.floor(now / 4294967.296);
    const lowerTimestamp = Math.floor(now - upperTimestamp * 4294967.296);

    if (lowerWAL === 4294967295) {
      // [0xff, 0xff, 0xff, 0xff]
      upperWAL = upperWAL + 1;
      lowerWAL = 0;
    } else {
      lowerWAL = lowerWAL + 1;
    }

    const response = Buffer.alloc(34);
    response.fill(0x72); // 'r'

    // Last WAL Byte + 1 received and written to disk locally
    response.writeUInt32BE(upperWAL, 1);
    response.writeUInt32BE(lowerWAL, 5);

    // Last WAL Byte + 1 flushed to disk in the standby
    response.writeUInt32BE(upperWAL, 9);
    response.writeUInt32BE(lowerWAL, 13);

    // Last WAL Byte + 1 applied in the standby
    response.writeUInt32BE(upperWAL, 17);
    response.writeUInt32BE(lowerWAL, 21);

    // Timestamp as microseconds since midnight 2000-01-01
    response.writeUInt32BE(upperTimestamp, 25);
    response.writeUInt32BE(lowerTimestamp, 29);

    // If 1, requests server to respond immediately - can be used to verify connectivity
    response.writeInt8(0, 33);

    (this.connection() as any).sendCopyFromChunk(response);

    return true;
  }

  private connection(): Connection {
    return (this.client as any).connection;
  }

  private async createTasksForTransition(transition: Transition<any, string>) {
    const tasks = await createTasksForTransition(
      this.db,
      this.projectMeta,
      this.project,
      transition
    );

    for (const task of tasks) {
      this.logger.info("Enqueued task", {
        task: task.id,
        transition: transition.id,
        consumer: task.consumer,
      });
    }
  }

  private transitionFromLog(
    log: Pgoutput.MessageInsert
  ): Transition<any, string> {
    return {
      id: log.new.id,
      model: log.new.model,
      type: log.new.type,
      objectId: log.new.object_id,
      data: log.new.data,
    };
  }
}
