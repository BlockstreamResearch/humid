import { type Outpoint, outpointKey } from "./outpoint";
import type { FieldForm, ParsedTxOut } from "./rawTransaction";
import { spentInputs, txOutsOf } from "./rawTransaction";

export type GuardResult = { ok: true } | { ok: false; reason: string };

export type ExpectedInputs = {
	covenantInputs: Outpoint[];
	walletInputs: Outpoint[];
};

export function guardSpentInputs(transactionHex: string, expected: ExpectedInputs): GuardResult {
	const observed = spentInputs(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	const required = [...expected.covenantInputs, ...expected.walletInputs];
	const repeated = firstRepeat(required);

	if (repeated !== undefined) {
		return {
			ok: false,
			reason:
				`This action requires ${repeated} more than once, which no transaction can spend. ` +
				"Nothing is returned.",
		};
	}

	const spentTwice = firstRepeat(observed.spent);

	if (spentTwice !== undefined) {
		return {
			ok: false,
			reason: `The signed transaction spends ${spentTwice} twice. Nothing is returned.`,
		};
	}

	const permitted = new Set(required.map((outpoint) => outpointKey(outpoint)));
	const seen = new Set(observed.spent.map((outpoint) => outpointKey(outpoint)));

	for (const outpoint of observed.spent) {
		if (!permitted.has(outpointKey(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction spends ${outpointKey(outpoint)}, which this action does not ` +
					"require and the wallet did not choose. Nothing is returned.",
			};
		}
	}

	for (const outpoint of required) {
		if (!seen.has(outpointKey(outpoint))) {
			return {
				ok: false,
				reason:
					`The signed transaction leaves out ${outpointKey(outpoint)}, which this action ` +
					"requires. Nothing is returned.",
			};
		}
	}

	return { ok: true };
}

function firstRepeat(outpoints: Outpoint[]): string | undefined {
	const seen = new Set<string>();

	for (const outpoint of outpoints) {
		const key = outpointKey(outpoint);

		if (seen.has(key)) {
			return key;
		}

		seen.add(key);
	}

	return undefined;
}

export type ExpectedOutput = {
	asset: string;
	blinded: boolean;
	id: string;
	sats: bigint;
	scriptPubKeyHex: string;
};

export type ExpectedOutputs = {
	changeBlinded: boolean;
	changeScriptPubKeyHex: string;
	feeSats: bigint;
	outputs: ExpectedOutput[];
	policyAsset: string;
};

export function guardBuiltOutputs(transactionHex: string, expected: ExpectedOutputs): GuardResult {
	const observed = txOutsOf(transactionHex);

	if (!observed.ok) {
		return { ok: false, reason: observed.reason };
	}

	for (const [at, declared] of expected.outputs.entries()) {
		const built = observed.txOuts[at];

		if (!built) {
			return {
				ok: false,
				reason:
					`The signed transaction carries ${observed.txOuts.length} outputs and this action ` +
					`built ${expected.outputs.length}. Nothing is returned.`,
			};
		}

		const wrong = disagreementOn(declared, built);

		if (wrong !== undefined) {
			return { ok: false, reason: wrong };
		}
	}

	return guardTail(observed.txOuts.slice(expected.outputs.length), expected);
}

function shapeOf(built: ParsedTxOut): "blinded" | "open" | undefined {
	if (forms(built, "commitment", "commitment", "commitment")) {
		return "blinded";
	}

	return forms(built, "explicit", "explicit", "null") ? "open" : undefined;
}

function forms(built: ParsedTxOut, asset: FieldForm, value: FieldForm, nonce: FieldForm): boolean {
	return built.assetForm === asset && built.valueForm === value && built.nonceForm === nonce;
}

function disagreementOn(declared: ExpectedOutput, built: ParsedTxOut): string | undefined {
	if (!sameHex(built.scriptPubKeyHex, declared.scriptPubKeyHex)) {
		return (
			`The signed transaction pays ${named(declared.id)} to a script this action did not build ` +
			"it for. Nothing is returned."
		);
	}

	const shape = shapeOf(built);

	if (shape === undefined) {
		return (
			`The signed transaction writes ${named(declared.id)} as neither a hidden output nor an ` +
			"open one. Nothing is returned."
		);
	}

	const hidden = shape === "blinded";

	if (hidden !== declared.blinded) {
		return disagreement(named(declared.id), declared.blinded);
	}

	if (hidden) {
		return undefined;
	}

	if (built.amountSats !== String(declared.sats)) {
		return (
			`The signed transaction pays ${built.amountSats} to ${named(declared.id)}, and this ` +
			`action pays ${declared.sats} there. Nothing is returned.`
		);
	}

	return sameHex(built.rawAssetId ?? "", declared.asset)
		? undefined
		: `The signed transaction pays ${named(declared.id)} in an asset this action did not plan for it. Nothing is returned.`;
}

function guardTail(tail: ParsedTxOut[], expected: ExpectedOutputs): GuardResult {
	if (tail.length === 0) {
		return {
			ok: false,
			reason:
				"The signed transaction pays no fee, which no network will accept. Nothing is returned.",
		};
	}

	if (tail.length > 2) {
		return {
			ok: false,
			reason:
				`The signed transaction carries ${tail.length} outputs after this action's own, and ` +
				"the builder adds only change and a fee. Nothing is returned.",
		};
	}

	const fee = tail.at(-1);

	if (!fee || fee.scriptPubKeyHex !== "") {
		return {
			ok: false,
			reason:
				"The signed transaction does not end in a fee, which is the one output the network " +
				"reads in order to charge it. Nothing is returned.",
		};
	}

	if (shapeOf(fee) !== "open") {
		return {
			ok: false,
			reason:
				"The signed transaction hides part of the fee it pays, which no network can read. " +
				"Nothing is returned.",
		};
	}

	if (!sameHex(fee.rawAssetId ?? "", expected.policyAsset)) {
		return {
			ok: false,
			reason:
				"The signed transaction pays its fee in something other than the asset this network " +
				"charges fees in. Nothing is returned.",
		};
	}

	if (fee.amountSats !== String(expected.feeSats)) {
		return {
			ok: false,
			reason:
				`The signed transaction pays a fee of ${fee.amountSats} and the signing module reports ` +
				`${expected.feeSats}. Nothing is returned.`,
		};
	}

	const change = tail.length === 2 ? tail[0] : undefined;

	if (!change) {
		return { ok: true };
	}

	if (change.scriptPubKeyHex === "") {
		return { ok: false, reason: "The signed transaction pays two fees. Nothing is returned." };
	}

	if (!sameHex(change.scriptPubKeyHex, expected.changeScriptPubKeyHex)) {
		return {
			ok: false,
			reason:
				"The signed transaction returns change somewhere other than the script this wallet " +
				"named. Nothing is returned.",
		};
	}

	const shape = shapeOf(change);

	if (shape === undefined) {
		return {
			ok: false,
			reason:
				"The signed transaction writes its change as neither a hidden output nor an open one. " +
				"Nothing is returned.",
		};
	}

	if ((shape === "blinded") !== expected.changeBlinded) {
		return { ok: false, reason: disagreement("the change", expected.changeBlinded) };
	}

	if (shape === "open" && !sameHex(change.rawAssetId ?? "", expected.policyAsset)) {
		return {
			ok: false,
			reason:
				"The signed transaction returns change in an asset other than the one this network " +
				"charges fees in, and the builder appends change only in that one. Nothing is returned.",
		};
	}

	return { ok: true };
}

function disagreement(what: string, wasToBeHidden: boolean): string {
	return wasToBeHidden
		? `The signed transaction publishes the amount on ${what}, which this action hides. ` +
				"Nothing is returned."
		: `The signed transaction hides the amount on ${what}, which this action leaves in the ` +
				"open. Nothing is returned.";
}

function named(id: string): string {
	return id || "(unnamed)";
}

function sameHex(one: string, other: string): boolean {
	return one.trim().toLowerCase() === other.trim().toLowerCase();
}
