import { InterpreterMessage } from "./message";

export interface InterpreterModel {
	execute(messages: InterpreterMessage[]): Promise<string>;
}
