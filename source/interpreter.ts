import { Tool, ToolError, ToolParameter } from "./tool";
import { AssistantMessage, InterpreterMessage, SystemMessage } from "./message";
import { InterpreterModel } from "./model";

export class Interpreter {
	tools: Tool[] = [];
	history: InterpreterMessage[] = [];

	static readonly toolStartToken = '<ACTION>';
	static readonly toolEndToken = '</ACTION>';

	constructor(
		public model: InterpreterModel
	) {}

	get metaInitiator() {
		let message = [
			'You are a helpful assistant.',
			'Do not tell me what you are doing, just respond.',

			'You can only execute actions, but only do it when asked to.',
			'Wrap parameters in objects, following this example',
			'',
			'Function: test(name: string, value: number)',
			`${Interpreter.toolStartToken}test({ name: "string parameter", value: 5.111 })${Interpreter.toolEndToken}`,
			'',
			'If you want to omit a optional parameter, supply null.',
			'The following actions are available to you.'
		];

		for (let tool of this.tools) {
			message.push(`- ${tool.name}(${tool.parameters.map(parameter => `${parameter.name}: ${parameter.type.name}${parameter.optional ? ' (optional)' : ''}`).join(', ')})`);
		}

		message.push(
			'When calling actions, make sure to use the correct data types, encapsulated in JSON.',
			`Encapsulate each call in ${Interpreter.toolStartToken} ... ${Interpreter.toolEndToken}.`
		);

		return message.join('\n');
	}

	remember(history: InterpreterMessage[]) {
		this.history.push(...history);
	}

	async execute(...messages: InterpreterMessage[]) {
		const message = await this.model.execute([
			new SystemMessage(this.metaInitiator),
			...this.history,
			...messages
		]);

		if (!message.includes(Interpreter.toolStartToken)) {
			console.warn(`[interpreter] no tools called.`);

			return await this.execute(...messages);
		}

		const calls: { tool: Tool, values: any[] }[] = [];

		for (let call of message.split(Interpreter.toolStartToken).slice(1)) {
			const content = call.split(Interpreter.toolEndToken)[0].trim();

			const toolName = content.split('(')[0];
			const tool = this.tools.find(tool => tool.name == toolName);

			if (!tool) {
				console.warn(`[interpreter] no tool named '${toolName}'.`);

				return await this.execute(...messages);
			}

			let parameters: any[];

			try {
				parameters = this.parseParameters(content.split('(').slice(1).join('('), tool.parameters);
			} catch (error) {
				console.warn(`[interpreter] parameter parsing failed '${toolName}': ${error.message} (${content})`);

				return await this.execute(...messages);
			}

			calls.push({ tool, values: parameters });
		}

		for (let call of calls) {
			try {
				await call.tool.action(...call.values);
			} catch (error) {
				console.warn(`[interpreter] tool call failed: ${call.tool.name}`, error);

				if (error instanceof ToolError) {
					messages.push(
						new AssistantMessage(message),
						new SystemMessage(error.issue),
						new SystemMessage('Retry, calling the tools again with an improved answer')
					);
				}

				return await this.execute(...messages);
			}
		}

		// only add messages to history if it worked
		this.history.push(
			...messages,
			new AssistantMessage(message)
		);

		return message;
	}

	addTool(name: string, parameters: ToolParameter[], action: Function) {
		const existing = this.tools.findIndex(tool => tool.name == name);

		if (existing != -1) {
			this.tools.splice(existing, 1);
		}

		this.tools.push({
			name,
			parameters,
			action
		});
	}

	private parseParameters(source: string, parameters: ToolParameter[]) {
		source = this.fixInStringNewLines(source);

		const object = this.findJSONObject(source);
		const data = [];

		for (let parameter of parameters) {
			if (!parameter.optional && !(parameter.name in object)) {
				throw new Error(`Parameter '${parameter.name}' missing`);
			}

			const value = object[parameter.name];

			if (value === null || value === undefined) {
				if (!parameter.optional) {
					throw new Error(`Parameter '${parameter.name}' empty but not optional`);
				}

				data.push(null);
			} else {
				const proxy = new parameter.type();

				if (typeof value != typeof proxy.valueOf()) {
					throw new Error(`Parameter '${parameter.name}' has an invalid type`);
				}

				data.push(value);
			}
		}

		return data;
	}

	// llms struggle with putting '\n' in multiline strings
	// replaces new lines with \n as a string, making it valid JSON
	private fixInStringNewLines(source: string) {
		let inString = false;
		let buffer = '';

		for (let characterIndex = 0; characterIndex < source.length; characterIndex++) {
			const character = source[characterIndex];

			if (inString) {
				if (character == '\n') {
					buffer += "\\n";
				} else {
					if (character == '"') {
						inString = false;
					}

					buffer += character;
				}
			} else {
				if (character == '"') {
					inString = true;
				}

				buffer += character;
			}
		}

		return buffer.trim();
	}

	private findJSONObject(source: string) {
		let level = 0;
		let inString = false;

		let serialized = '';
		let buffer = '';

		for (let characterIndex = 0; characterIndex < source.length; characterIndex++) {
			const character = source[characterIndex];

			if (character == '"') {
				inString = !inString;

				// fix properties not encapsulated in quotes
				if (inString) {
					buffer = this.fixParameterEscaping(buffer);
				}

				serialized += `${buffer}"`;
				buffer = '';
			} else if (inString) {
				buffer += character;
			} else {
				if (character == '{') {
					level++;

					buffer += '{';
				} else if (character == '}') {
					level--;

					buffer += '}';

					// exited object
					if (level == 0) {
						serialized += this.fixParameterEscaping(buffer);

						return JSON.parse(serialized);
					}
				} else {
					buffer += character;
				}
			}
		}

		throw new Error('Parameter string invalid, no JSON data found');
	}

	private fixParameterEscaping(buffer: string) {
		buffer = buffer.replace(/[a-zA-Z0-9]+\:/g, match => `"${match.substring(0, match.length - 1)}":`);

		while (buffer.includes('""')) {
			buffer = buffer.replace('""', '"');
		}

		return buffer;
	}
}
