#!/usr/bin/env ts-node

import App from "./app";

async function main() {
  let command = "dev";
  if (process.argv.length > 2) {
    command = process.argv[2];
  }

  const app = new App();

  switch (command) {
    case "main":
      app.startMain();
      break;
    case "worker":
      app.startWorker();
      break;
    case "dev":
      await app.startDev();
      break;
    case "generate":
      await app.generate();
      break;
    case "migrate":
      await app.generate();
      await app.migrate();
      break;
  }
}

main();
