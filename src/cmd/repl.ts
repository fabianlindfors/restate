import { TestDb } from "../internal";
import * as tsNode from "ts-node";
import { rep } from "typescript-parsec";

export default class Repl {
  constructor(private config: any) {}

  async run() {
    const module = await this.generatedModule();
    const exports = Object.keys(module);

    const repl = tsNode.createRepl();

    const service = tsNode.create({ ...repl.evalAwarePartialHost });
    repl.setService(service);

    const command = `import { ${exports.join(
      ", "
    )} } from "${__dirname}/../generated"`;
    repl.start();
    repl.evalCode("console.log('test')");
    repl.evalCode(`import * as files from "fs"`);
  }

  private async generatedModule(): Promise<any> {
    const generatedPath = "../generated";
    return await import(generatedPath);
  }
}
