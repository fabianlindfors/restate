import {
  RestateClient,
  RestateProject,
  Email,
  User,
  TypesTest,
} from "../../src/generated";

const project: RestateProject = {
  main: async function (restate: RestateClient): Promise<void> {
    await new Promise((res) => setTimeout(() => res(undefined), 1_000));
    const user = await restate.user.transition.create();
    console.log("Created user", user);
  },
  transitions: {
    user: {
      async create(restate: RestateClient) {
        return {
          state: User.State.Created,
          name: "Test Name",
        };
      },
      async createExtra(restate: RestateClient) {
        return {
          state: User.State.Created,
          name: "Test Name",
        };
      },
      async delete(restate: RestateClient, existing: User.Created) {
        return {
          ...existing,
          state: User.State.Deleted,
        };
      },
    },
    email: {
      async create(restate: RestateClient, transition: Email.Create) {
        return {
          state: Email.State.Created,
          userId: transition.data.userId,
          subject: transition.data.subject,
        };
      },
      async send(
        restate: RestateClient,
        email: Email.Created,
        transition: Email.Send
      ) {
        return {
          ...email,
          state: Email.State.Sent,
        };
      },
    },
    typesTest: {
      async create(restate: RestateClient, transition: TypesTest.Create) {
        return {
          state: TypesTest.State.Created,
          ...transition.data,
        };
      },
    },
  },
  consumers: [
    User.createConsumer({
      name: "SendEmailOnUserCreation",
      transition: User.Transition.Create,
      handler: async (restate, user, transition) => {
        const [email] = await restate.email.transition.create({
          data: {
            userId: transition.objectId,
            subject: "Welcome!",
          },
        });
        console.log("[SendEmailOnUserCreation] Created email", email);
      },
    }),
    Email.createConsumer({
      name: "SendEmail",
      transition: Email.Transition.Create,
      handler: async (restate, email, transition) => {
        const [sentEmail] = await restate.email.transition.send({
          object: email.id,
        });
        console.log("[SendEmail] Updated email to sent", sentEmail);
      },
    }),
  ],
};

export default project;
