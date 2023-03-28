import fs from "fs";
import path from "path";
import axios from "axios";
import childProcess from "child_process";
import { INlpEngine, ITranslateResult } from "./base";

export class HelsinkiNlpEngine implements INlpEngine {
	private nlp: childProcess.ChildProcessWithoutNullStreams;
	private cache: Record<string, string>;
	constructor() {
		this.cache = {};
	}

	getNlpPath() {
		const gpu = path.resolve(process.cwd(), "nlp-gpu-server");
		if (fs.existsSync(gpu)) {
			console.log("nlp-gpu-server exists! use it");
			return { nlpDir: gpu, exePath: path.resolve(gpu, "./NLP-GPU-API.exe") };
		}

		const cpu = path.resolve(process.cwd(), "nlp-server");
		if (fs.existsSync(cpu)) {
			console.log("use nlp-server");
			return { nlpDir: cpu, exePath: path.resolve(cpu, "./NLP-API.exe") };
		}

		return { nlpDir: "", exePath: "" };
	}

	async init() {
		console.log("try to init nlp engine");
		const { nlpDir, exePath } = this.getNlpPath();
		if (nlpDir && exePath) {
			return new Promise((resolve, reject) => {
				console.log("nlpDir exists, start nlp server", nlpDir);
				const nlp = childProcess.spawn(exePath, [`--lang-from=en`, `--lang-to=zh`, `--model-dir=.\\model`], { windowsHide: true, detached: false /** hide console */ });
				this.nlp = nlp;
				nlp.stdout.on("data", (data) => {
					console.log(`stdout: ${data}`);
					if (data.includes("has been started")) {
						console.log("nlp server started");
						resolve(true);
					}
				});

				nlp.stderr.on("data", (data) => {
					console.error(`stderr: ${data}`);
				});

				nlp.on("close", (code) => {
					console.log(`nlp server exit: ${code}`);
					reject(false);
				});
			});
		} else {
			console.log("nlp server not exist");
		}
	}

	async destroy() {
		if (this.nlp) {
			console.log("exit nlp server process");
			process.kill(this.nlp?.pid);
			process.exit();
		}
	}

	async translate(text: string): Promise<ITranslateResult> {
		try {
			if (this.cache[text]) {
				return { text: this.cache[text] };
			}
			const translated = await axios.post(
				"http://localhost:8100/translate",
				{
					text,
				},
				{ timeout: 0 }
			);
			const result = translated.data.result[0].translation_text;
			this.cache[text] = result;
			return { text: result };
		} catch (error) {
			console.log(`translate failed: ${error.message}`);
			return { text: "" };
		}
	}
}
