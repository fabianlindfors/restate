import { readFileSync, existsSync, readdirSync } from "fs";
import * as path from "path";
import { generate } from "../generate";
import { parse } from "../parser";
import { Model } from "../ast";
import chokidar from "chokidar";
import { spawn, ChildProcess } from "child_process";
import pt from "prepend-transform";
import Main from "./main";
import Worker from "./worker";
import chalk from "chalk";
import Repl from "./repl";
import { dbFromConfig, loadGeneratedModule, loadProject } from "./common";
import { loadConfig, getEnv } from "../internal/config";
import merge from "deepmerge";

const welcomeMessage = chalk.bold(` _____________________ 
< Welcome to Restate! >
 --------------------- 
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||
`);
const version = "0.0.1";
const checkmark = chalk.green("✓");

export default class App {
  private mainProcess: ChildProcess | undefined;
  private workerProcess: ChildProcess | undefined;

  async startDev() {
    const env = getEnv() || "development";
    const config = loadConfig(env);

    console.log(welcomeMessage);
    console.log("Version:", chalk.bold(version));
    console.log("Environment:", chalk.bold(env));
    console.log("Database:", chalk.bold(config.database.type));
    console.log("");

    await this.runDev();

    chokidar
      .watch(["src/", "restate/", "restate.config.json"])
      .on("change", (_event, _path) => {
        console.log("");
        console.log("🔂 File changed, restarting...");
        this.runDev();
      });
  }

  async startMain() {
    const project = await loadProject();
    const main = new Main(project);
    await main.run();
  }

  async startWorker() {
    const project = await loadProject();
    const worker = new Worker(project);
    await worker.run();
  }

  async startRepl() {
    const project = await loadProject();
    const repl = new Repl(project);
    await repl.run();
  }

  async generate() {
    // Find and parse models from all files in the restate/ directory
    process.stdout.write("🛠️  Generating client... ");
    const files = existsSync("restate/") ? readdirSync("restate/") : [];
    const models = files
      .map((file) => readFileSync(path.join("restate", file)).toString())
      .flatMap(parse)
      .map((parsed) => new Model(parsed));

    // Output the generated Typescript files to the packages directory
    // This way, they can be imported directly from the project
    const outputPath = `${__dirname}/../generated`;
    await generate(models, outputPath);
    console.log(checkmark);
  }

  async migrate() {
    const project = await loadProject();
    if (project === undefined) {
      console.log(chalk.yellow("⚠️  No restate.ts project definition found!"));
      return;
    }

    process.stdout.write("⏩️ Migrating database... ");

    const config = loadConfig();

    // Set up client using the imported config
    const generatedModule = await loadGeneratedModule();
    const db = dbFromConfig(generatedModule.__ModelMetas, config.database);
    const Client = generatedModule.RestateClient;
    const client = new Client(project, db);
    await client.setup();

    // Set up database if it hasn't already been set up
    await client.migrate();
    await client.close();

    console.log(checkmark);
  }

  private async runDev() {
    await this.generate();

    // Import the project definition dynamically from the project directory.
    // This project definition contains the transition implementations and consumers.
    process.stdout.write("🚛 Loading project... ");
    const project = await loadProject();
    if (project === undefined) {
      console.log(
        chalk.yellow("\n⚠️  No restate.ts project definition found!")
      );
      return;
    }

    console.log(checkmark);

    const env = getEnv() || "development";
    const config = loadConfig(env);

    // Set up client using the imported config
    const generatedModule = await loadGeneratedModule();
    const db = dbFromConfig(generatedModule.__ModelMetas, config.database);
    const Client = generatedModule.RestateClient;
    const client = new Client(project, db);
    await client.setup();

    // Set up database if it hasn't already been set up
    process.stdout.write("⏩️ Migrating database... ");
    await client.migrate();
    console.log(checkmark);

    this.spawnWorker();
    this.spawnMain();
  }

  private spawnWorker() {
    // Spawn a child process to run the projects consumers
    process.stdout.write("👷‍♀️ Starting worker... ");

    // If a main process is already running, kill it
    if (this.workerProcess) {
      this.workerProcess.kill();
    }

    this.workerProcess = spawn(`${__dirname}/entrypoint.ts`, ["worker"], {
      env: merge({ NODE_ENV: "development" }, process.env),
    });

    const prefix = chalk.yellow("[worker] ");
    this.workerProcess.stdout?.pipe(pt(prefix)).pipe(process.stdout);
    this.workerProcess.stderr?.pipe(pt(prefix)).pipe(process.stderr);

    console.log(checkmark);
  }

  private spawnMain() {
    // Spawn a child process to run the projects main function
    process.stdout.write("🚀 Starting application... ");

    // If a main process is already running, kill it
    if (this.mainProcess) {
      this.mainProcess.kill();
    }

    this.mainProcess = spawn(`${__dirname}/entrypoint.ts`, ["main"], {
      env: merge({ NODE_ENV: "development" }, process.env),
    });

    const prefix = chalk.cyan("[main]   ");
    this.mainProcess.stdout?.pipe(pt(prefix)).pipe(process.stdout);
    this.mainProcess.stderr?.pipe(pt(prefix)).pipe(process.stderr);

    console.log(checkmark);
  }
}
