import { Project } from "ts-morph";
import { Model } from "../ast";
import { generateDbFile } from "./client";
import { generateModelFile } from "./model";

export async function generate(models: Model[], outputDir: string) {
	const project = new Project({});

	models.forEach(model => {
		project.createSourceFile(`${outputDir}//${model.pascalCaseName()}.ts`, {
			statements: generateModelFile(model),
		}, {
			overwrite: true,
		});
	})

	project.createSourceFile(`${outputDir}/index.ts`, {
		statements: generateDbFile(models),
	}, {
		overwrite: true
	});

	await project.save();
}
