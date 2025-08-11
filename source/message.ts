import { Interpreter } from "./interpreter";

export class InterpreterMessage {
	constructor(
		public message: string
	) {}
}

export class SystemMessage extends InterpreterMessage {
	constructor(
		message: string
	) {
		super(message);
	}
}

export class AssistantMessage extends InterpreterMessage {
	constructor(
		message: string
	) {
		super(message);
	}

	static fromToolResponse(tool: string, parameters: any) {
		return new AssistantMessage(`${Interpreter.toolStartToken}${tool}({ ${
			Object.keys(parameters).map(name => `${name}: ${typeof parameters[name] == 'string' ? JSON.stringify(parameters[name]) : parameters[name]}`)
		} })${Interpreter.toolEndToken}`);
	}
}

export class UserMessage extends InterpreterMessage {
	constructor(
		message: string
	) {
		super(message);
	}
}
