export type Tool = {
	name: string,
	parameters: ToolParameter[],
	action: Function
};

export type ToolParameter = {
	name: string,
	type: typeof Number | typeof String,
	optional?: true
};

export class ToolError extends Error {
	constructor(
		public issue: string
	) {
		super();
	}
}
