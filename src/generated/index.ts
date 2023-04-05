import * as Email from "./Email";
import * as TypesTest from "./TypesTest";
import * as User from "./User";
import * as __Internal from "../internal";
export * as Email from "./Email";
export * as TypesTest from "./TypesTest";
export * as User from "./User";

export interface TransitionImpls {
    email: Email.TransitionImpl;
    typesTest: TypesTest.TransitionImpl;
    user: User.TransitionImpl;
}

export const __ModelMetas: __Internal.ModelMeta[] = [Email.__Meta, TypesTest.__Meta, User.__Meta];

export interface RestateProject {
    main: (restate: RestateClient) => Promise<void>;
    transitions: TransitionImpls;
    consumers: __Internal.Consumer[];
}

export async function setupTestClient(project: RestateProject): Promise<RestateClient> {
    const db = new __Internal.TestDb(__ModelMetas)
    await db.setup()
    await db.migrate()
    const client = new RestateClient(project, db)
    const consumerCallback = __Internal.createTestConsumerRunner(project, client)
    db.setTransitionCallback(consumerCallback)
    return client
}

export class RestateClient {
    email: EmailClient;
    typesTest: TypesTestClient;
    user: UserClient;
    __db: __Internal.Db;
    __project: RestateProject;

    constructor(project: RestateProject, db: __Internal.Db) {
        this.__db = db
        this.__project = project
        this.email = new EmailClient(this);
        this.typesTest = new TypesTestClient(this);
        this.user = new UserClient(this);
    }

    async setup(): Promise<void> {
        await this.__db.setup();
    }

    async migrate(): Promise<void> {
        await this.__db.migrate();
    }

    async close(): Promise<void> {
        await this.__db.close();
    }
}

class EmailClient extends __Internal.BaseClient {
    private parent: RestateClient;
    public transition: EmailTransitionsClient;

    constructor(parent: RestateClient) {
        super(parent.__db, Email.__Meta)
        this.parent = parent
        this.transition = new EmailTransitionsClient(parent)
    }

    async findOne<F extends Email.QueryFilter, Out extends Email.ResultFromQueryFilter<F, Email.State>>(params?: __Internal.QueryParams<F>): Promise<Out | undefined> {
        const result = await this.internalFindOne(params || {});
        return result as Out | undefined
    }

    async findOneOrThrow<F extends Email.QueryFilter, Out extends Email.ResultFromQueryFilter<F, Email.State>>(params?: __Internal.QueryParams<F>): Promise<Out> {
        const result = await this.internalFindOneOrThrow(params || {});
        return result as Out
    }

    async findAll<F extends Email.QueryFilter, Out extends Email.ResultFromQueryFilter<F, Email.State>>(params?: __Internal.QueryParams<F>): Promise<Out[]> {
        const result = await this.internalFindAll(params || {});
        return result as Out[]
    }
}

class TypesTestClient extends __Internal.BaseClient {
    private parent: RestateClient;
    public transition: TypesTestTransitionsClient;

    constructor(parent: RestateClient) {
        super(parent.__db, TypesTest.__Meta)
        this.parent = parent
        this.transition = new TypesTestTransitionsClient(parent)
    }

    async findOne<F extends TypesTest.QueryFilter, Out extends TypesTest.ResultFromQueryFilter<F, TypesTest.State>>(params?: __Internal.QueryParams<F>): Promise<Out | undefined> {
        const result = await this.internalFindOne(params || {});
        return result as Out | undefined
    }

    async findOneOrThrow<F extends TypesTest.QueryFilter, Out extends TypesTest.ResultFromQueryFilter<F, TypesTest.State>>(params?: __Internal.QueryParams<F>): Promise<Out> {
        const result = await this.internalFindOneOrThrow(params || {});
        return result as Out
    }

    async findAll<F extends TypesTest.QueryFilter, Out extends TypesTest.ResultFromQueryFilter<F, TypesTest.State>>(params?: __Internal.QueryParams<F>): Promise<Out[]> {
        const result = await this.internalFindAll(params || {});
        return result as Out[]
    }
}

class UserClient extends __Internal.BaseClient {
    private parent: RestateClient;
    public transition: UserTransitionsClient;

    constructor(parent: RestateClient) {
        super(parent.__db, User.__Meta)
        this.parent = parent
        this.transition = new UserTransitionsClient(parent)
    }

    async findOne<F extends User.QueryFilter, Out extends User.ResultFromQueryFilter<F, User.State>>(params?: __Internal.QueryParams<F>): Promise<Out | undefined> {
        const result = await this.internalFindOne(params || {});
        return result as Out | undefined
    }

    async findOneOrThrow<F extends User.QueryFilter, Out extends User.ResultFromQueryFilter<F, User.State>>(params?: __Internal.QueryParams<F>): Promise<Out> {
        const result = await this.internalFindOneOrThrow(params || {});
        return result as Out
    }

    async findAll<F extends User.QueryFilter, Out extends User.ResultFromQueryFilter<F, User.State>>(params?: __Internal.QueryParams<F>): Promise<Out[]> {
        const result = await this.internalFindAll(params || {});
        return result as Out[]
    }
}

class EmailTransitionsClient extends __Internal.BaseTransitionsClient {
    private parent: RestateClient;
    private transitionImpls: Email.TransitionImpl;

    constructor(parent: RestateClient) {
        super(parent.__db, Email.__Meta)
        this.parent = parent
        this.transitionImpls = parent.__project.transitions.email
    }

    async create(params: __Internal.TransitionParameters & __Internal.TransitionWithData<Email.CreateData>): Promise<[Email.Created, Email.Create]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.create(this.parent, transition);
        const { updatedObject, updatedTransition } = await this.applyTransition(Email.__Meta.transitions.Create, params, undefined, fn);
        return [updatedObject as Email.Created, updatedTransition as Email.Create];
    }

    async send(params: __Internal.TransitionParameters & __Internal.TransitionWithObject<Email.Created>): Promise<[Email.Sent, Email.Send]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.send(this.parent, object, transition);
        const id = typeof params.object == 'string' ? params.object : params.object.id;
        const { updatedObject, updatedTransition } = await this.applyTransition(Email.__Meta.transitions.Send, params, id, fn);
        return [updatedObject as Email.Sent, updatedTransition as Email.Send];
    }
}

class TypesTestTransitionsClient extends __Internal.BaseTransitionsClient {
    private parent: RestateClient;
    private transitionImpls: TypesTest.TransitionImpl;

    constructor(parent: RestateClient) {
        super(parent.__db, TypesTest.__Meta)
        this.parent = parent
        this.transitionImpls = parent.__project.transitions.typesTest
    }

    async create(params: __Internal.TransitionParameters & __Internal.TransitionWithData<TypesTest.CreateData>): Promise<[TypesTest.Created, TypesTest.Create]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.create(this.parent, transition);
        const { updatedObject, updatedTransition } = await this.applyTransition(TypesTest.__Meta.transitions.Create, params, undefined, fn);
        return [updatedObject as TypesTest.Created, updatedTransition as TypesTest.Create];
    }
}

class UserTransitionsClient extends __Internal.BaseTransitionsClient {
    private parent: RestateClient;
    private transitionImpls: User.TransitionImpl;

    constructor(parent: RestateClient) {
        super(parent.__db, User.__Meta)
        this.parent = parent
        this.transitionImpls = parent.__project.transitions.user
    }

    async create(params: __Internal.TransitionParameters = {}): Promise<[User.Created, User.Create]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.create(this.parent, transition);
        const { updatedObject, updatedTransition } = await this.applyTransition(User.__Meta.transitions.Create, params, undefined, fn);
        return [updatedObject as User.Created, updatedTransition as User.Create];
    }

    async createExtra(params: __Internal.TransitionParameters = {}): Promise<[User.Created, User.CreateExtra]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.createExtra(this.parent, transition);
        const { updatedObject, updatedTransition } = await this.applyTransition(User.__Meta.transitions.CreateExtra, params, undefined, fn);
        return [updatedObject as User.Created, updatedTransition as User.CreateExtra];
    }

    async delete(params: __Internal.TransitionParameters & __Internal.TransitionWithObject<User.Created>): Promise<[User.Deleted, User.Delete]> {
        const fn = async (object: any, transition: any) => await this.transitionImpls.delete(this.parent, object, transition);
        const id = typeof params.object == 'string' ? params.object : params.object.id;
        const { updatedObject, updatedTransition } = await this.applyTransition(User.__Meta.transitions.Delete, params, id, fn);
        return [updatedObject as User.Deleted, updatedTransition as User.Delete];
    }
}
