import { test, expect, beforeEach, afterEach, describe } from "@jest/globals";
import {
  Email,
  RestateClient,
  setupTestClient,
  User,
} from "../../src/generated";
import { State } from "../../src/generated/User";
import { TaskState } from "../../src/internal/consumer";
import project from "./restate";

let client: RestateClient;

beforeEach(async () => {
  client = await setupTestClient(project);
});

describe("transitions", () => {
  test("initializing", async () => {
    const [user, transition] = await client.user.transition.create();

    // User should get an autogenerated ID with a prefix
    expect(user.id).toMatch(/user_[a-zA-Z0-9]+/);
    expect(user.name).toBe("Test Name");
    expect(user.state).toBe(State.Created);

    expect(transition.from).toBeNull();
    expect(transition.to).toBe(State.Created);
  });

  test("transition existing object", async () => {
    const [createdUser] = await client.user.transition.create();
    const [user, transition] = await client.user.transition.delete({
      object: createdUser,
    });

    expect(user.state).toBe(State.Deleted);

    expect(transition.from).toBe(State.Created);
    expect(transition.to).toBe(State.Deleted);
  });

  test("notes", async () => {
    const [_, transition] = await client.user.transition.create({
      note: "A little helpful note for the future",
    });

    expect(transition.note).toBe("A little helpful note for the future");
  });

  test("get transition by ID", async () => {
    const [_, transition] = await client.user.transition.create();

    const foundTransition = await client.user.getTransition(transition.id);
    expect(foundTransition.id).toBe(transition.id);
    expect(foundTransition.objectId).toBe(transition.objectId);
    expect(foundTransition.model).toBe(transition.model);
    expect(foundTransition.type).toBe(transition.type);
    expect(foundTransition.from).toBeNull();
    expect(foundTransition.to).toBe(State.Created);
    expect(foundTransition.triggeredBy).toBe(transition.triggeredBy);
  });

  test("get non-existent transition by ID", async () => {
    const missingTransition = await client.user.getTransition("tsn_missing");
    expect(missingTransition).toBeNull();
  });

  test("get transitions for object", async () => {
    const [user, createTransition] = await client.user.transition.create();
    const [_, deleteTransition] = await client.user.transition.delete({
      object: user,
    });

    const transitions = await client.user.getObjectTransitions(user);
    expect(transitions).toHaveLength(2);
    expect(transitions[0].id).toBe(deleteTransition.id);
    expect(transitions[1].id).toBe(createTransition.id);
  });

  test("triggeredBy not set when running directly", async () => {
    const [_, transition] = await client.user.transition.create();
    expect(transition.triggeredBy).toBe(null);
  });

  test("triggeredBy set to transition ID when created from another transition", async () => {
    const [user, transition] = await client.user.transition.createDouble();
    const otherTransition = await client.user.getTransition(
      user.duplicateTransition
    );

    expect(otherTransition.triggeredBy).toEqual(transition.id);
  });

  test("triggeredBy set to task ID when created from a consumer", async () => {
    const [user] = await client.user.transition.create();
    const email = await client.email.findOneOrThrow({
      where: {
        userId: user.id,
      },
    });

    const transitions = await client.email.getObjectTransitions(email);
    expect(transitions[0].triggeredBy).not.toBeNull();
  });
});

describe("query", () => {
  let user1: User.Any;
  let user2: User.Any;

  beforeEach(async () => {
    [user1] = await client.user.transition.create();

    [user2] = await client.user.transition.create();
    await client.user.transition.delete({ object: user2 });
  });

  test("findMany", async () => {
    const results = await client.user.findAll();

    expect(results).toHaveLength(2);
  });

  test("findMany with limit", async () => {
    const results = await client.user.findAll({
      limit: 1,
    });

    expect(results).toHaveLength(1);
  });

  test("findMany by state", async () => {
    const results = await client.user.findAll({
      where: {
        state: State.Created,
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(user1.id);
  });

  test("findOne by ID", async () => {
    const result = await client.user.findOne({
      where: {
        id: user1.id,
      },
    });

    expect(result).not.toBeUndefined();
    expect(result.id).toBe(user1.id);
  });

  test("findOne non-existing", async () => {
    const result = await client.user.findOne({
      where: {
        id: "user_asdadas",
      },
    });

    expect(result).toBeNull();
  });

  test("findOneOrThrow non-existing", async () => {
    await expect(async () => {
      await client.user.findOneOrThrow({
        where: {
          id: "user_asdadas",
        },
      });
    }).rejects.toThrow("no object found");
  });
});

describe("consumers", () => {
  let user: User.Any;
  let transition: User.Create;
  let results: Email.Any[];

  beforeEach(async () => {
    [user, transition] = await client.user.transition.create();
    results = await client.email.findAll({
      where: {
        userId: user.id,
      },
    });
  });

  test("can create another object", async () => {
    // `SendEmailOnUserCreation` consumer should have created a welcome email for the user
    expect(results).toHaveLength(1);
    expect(results[0].userId).toBe(user.id);
    expect(results[0].subject).toBe("Welcome!");
  });

  test("can be chained", async () => {
    // `SendEmail` consumer should have transitioned created email to sent
    expect(results).toHaveLength(1);
    expect(results[0].state).toBe(Email.State.Sent);
  });

  test("getTasksForTransition returns tasks", async () => {
    const tasks = await client.getTasksForTransition(transition);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBeDefined();
    expect(tasks[0].state).toBe(TaskState.Completed);
    expect(tasks[0].transitionId).toBe(transition.id);
  });
});

describe("data types", () => {
  test("can save and retrieve values", async () => {
    // Create object with example values
    const [{ id }] = await client.typesTest.transition.create({
      data: {
        string: "Test",
        integer: 5,
        decimal: 5.5,
        optional: 1,
        boolean: true,
      },
    });

    // Read object back from database
    const result = await client.typesTest.findOneOrThrow({ where: { id: id } });

    expect(result.string).toBe("Test");
    expect(result.integer).toBe(5);
    expect(result.decimal).toBe(5.5);
    expect(result.optional).toBe(1);
  });

  test("validates strings", async () => {
    await expect(async () => {
      await client.typesTest.transition.create({
        data: {
          string: undefined, // Not a string
          integer: 5,
          decimal: 5.5,
          boolean: true,
        },
      });
    }).rejects.toThrow("not a string");
  });

  test("validates integers", async () => {
    await expect(async () => {
      await client.typesTest.transition.create({
        data: {
          string: "Test",
          integer: 0.1, // Not an integer
          decimal: 5.5,
          boolean: true,
        },
      });
    }).rejects.toThrow("not an integer");
  });

  test("validates decimals", async () => {
    await expect(async () => {
      await client.typesTest.transition.create({
        data: {
          string: "Test",
          integer: 5,
          decimal: undefined, // Not a number
          boolean: true,
        },
      });
    }).rejects.toThrow("not a number");
  });

  test("validates optional nested value", async () => {
    await expect(async () => {
      await client.typesTest.transition.create({
        data: {
          string: "Test",
          integer: 1,
          decimal: 5.5,
          optional: 0.1, // Not an integer
          boolean: true,
        },
      });
    }).rejects.toThrow("not an integer");
  });

  test("validates booleans", async () => {
    await expect(async () => {
      await client.typesTest.transition.create({
        data: {
          string: "Test",
          integer: 5,
          decimal: 5.5,
          boolean: undefined, // Not a boolean
        },
      });
    }).rejects.toThrow("not a boolean");
  });
});

afterEach(async () => {
  await client.close();
});
