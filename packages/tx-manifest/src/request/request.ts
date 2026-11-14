export type ParsedLiquidProcessCtParams = {
	action: string;
	broadcast: boolean;
	contractSources: Record<string, string>;
	instance?: Record<string, unknown>;
	manifest: Record<string, unknown>;
	params: Record<string, unknown>;
	state?: Record<string, unknown>;
};

export type RequestPart = "contractSources" | "instance" | "params" | "state";

export type MissingPart = {
	keys?: string[];
	part: RequestPart;
	reason: string;
};
