export type RejectToken =
	| "foreign-chain"
	| "foreign-format"
	| "unimplemented-construct"
	| "foreign-compiler"
	| "source-mismatch"
	| "unreadable-build-mode"
	| "unproducible-witness"
	| "foreign-asset"
	| "unbuildable-utxo-type"
	| "unbuildable-position"
	| "incomplete-request"
	| "no-such-action"
	| "no-utxo-to-spend"
	| "chain-read-failed"
	| "program-mismatch"
	| "no-fee-rate"
	| "no-funds-at-signing-address"
	| "shortfall"
	| "document-fault"
	| "built-something-else";

export class Refusal extends Error {
	readonly reject: RejectToken;

	constructor(reason: string, reject: RejectToken = "document-fault") {
		super(reason);
		this.name = "Refusal";
		this.reject = reject;
	}

	get reason(): string {
		return this.message;
	}

	static attempt<T>(run: () => T): T | undefined {
		try {
			return run();
		} catch (error) {
			if (error instanceof Refusal) {
				return undefined;
			}

			throw error;
		}
	}

	static amend<T>(run: () => T, amend: (reason: string) => string, reject?: RejectToken): T {
		try {
			return run();
		} catch (error) {
			if (error instanceof Refusal) {
				throw new Refusal(amend(error.reason), reject ?? error.reject);
			}

			throw error;
		}
	}
}
