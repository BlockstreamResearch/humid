import { MAX_BASE_UNITS } from "../chain/baseUnits";
import {
	type DerivedIssuance,
	deriveFromEntropy,
	deriveNewIssuance,
	type Outpoint,
} from "../chain/issuance";
import { asRecord } from "../document/json";
import { type ReferenceScope, parseReference, resolveReference } from "../document/references";
import { Refusal } from "../refusal";
import { evaluateExpression } from "./evaluate";

export type IssuanceRequest = {
	assetAmountSats: bigint;
	inflationAmountSats: bigint;
	kind: "new" | "reissue";
};

export type PlannedIssuance = DerivedIssuance &
	IssuanceRequest & {
		inputId: string;
		outpoint: Outpoint;
	};

export function declaredIssuance(
	input: Record<string, unknown>,
): Record<string, unknown> | undefined {
	return asRecord(input.issuance);
}

export function reissuanceOf(
	declared: Record<string, unknown>,
	id: string,
	scope: ReferenceScope,
): DerivedIssuance {
	const entropy = Refusal.amend(
		() => hexOf(declared.entropy, scope),
		(reason) => `Input ${id} reissues an asset and does not say which: ${reason}`,
	);
	const derived = deriveFromEntropy(entropy);

	if (!derived) {
		throw new Refusal(`Input ${id} reissues from ${entropy}, which is not an issuance entropy.`);
	}

	if (declared.issued_asset !== undefined) {
		const stated = Refusal.amend(
			() => hexOf(declared.issued_asset, scope),
			(reason) => `Input ${id} states an issued_asset this wallet cannot read: ${reason}`,
		);

		if (stated.toLowerCase() !== derived.asset) {
			throw new Refusal(
				`Input ${id} says it reissues ${stated}, and its entropy derives ${derived.asset}. ` +
					"An entropy copied from a block explorer is byte-reversed relative to the one the " +
					"format writes.",
			);
		}
	}

	return derived;
}

export function resolveIssuance(
	input: {
		declared: Record<string, unknown>;
		id: string;
		outpoint: Outpoint;
	},
	scope: ReferenceScope,
): PlannedIssuance {
	const kind = input.declared.kind;

	if (kind !== "new" && kind !== "reissue") {
		throw new Refusal(
			`Input ${input.id} declares an issuance of kind ${JSON.stringify(kind)}, and the ` +
				'format defines "new" and "reissue".',
		);
	}

	const assetAmountSats = Refusal.amend(
		() => amountOf(input.declared.asset_amount_sat, scope),
		(reason) => `Input ${input.id} does not say how much it issues: ${reason}`,
	);

	if (kind === "reissue") {
		if (assetAmountSats <= 0n) {
			throw new Refusal(
				`Input ${input.id} reissues ${assetAmountSats} units, which mints nothing.`,
			);
		}

		return {
			...reissuanceOf(input.declared, input.id, scope),
			assetAmountSats,
			inflationAmountSats: 0n,
			inputId: input.id,
			kind,
			outpoint: input.outpoint,
		};
	}

	const inflationAmountSats =
		input.declared.inflation_amount_sat === undefined
			? 0n
			: Refusal.amend(
					() => amountOf(input.declared.inflation_amount_sat, scope),
					(reason) =>
						`Input ${input.id} does not say how many reissuance tokens it mints: ${reason}`,
				);

	if (
		assetAmountSats < 0n ||
		inflationAmountSats < 0n ||
		assetAmountSats + inflationAmountSats === 0n
	) {
		throw new Refusal(
			`Input ${input.id} issues ${assetAmountSats} units and ${inflationAmountSats} ` +
				"reissuance tokens, which creates nothing.",
		);
	}

	const derived = deriveNewIssuance(input.outpoint);

	if (!derived) {
		throw new Refusal(
			`Input ${input.id} issues an asset from ${input.outpoint.txid}:${input.outpoint.vout}, ` +
				"which is not an output this wallet can read.",
		);
	}

	return {
		...derived,
		assetAmountSats,
		inflationAmountSats,
		inputId: input.id,
		kind,
		outpoint: input.outpoint,
	};
}

export function issuanceAttributes(issuance: PlannedIssuance): Record<string, unknown> {
	return {
		issuance_entropy: issuance.entropy,
		issued_asset: issuance.asset,
		reissuance_token: issuance.reissuanceToken,
	};
}

function hexOf(declared: unknown, scope: ReferenceScope): string {
	if (typeof declared !== "string") {
		throw new Refusal("it is not written as text.");
	}

	const found =
		parseReference(declared) === undefined || /^(0x)?[0-9a-fA-F]{64}$/.test(declared)
			? declared
			: resolveReference(declared, "entropy", scope).value;

	if (typeof found !== "string" || !/^(0x)?[0-9a-fA-F]{64}$/.test(found)) {
		throw new Refusal(`${declared} is not 32 bytes of hex.`);
	}

	return found.replace(/^0x/, "").toLowerCase();
}

function amountOf(declared: unknown, scope: ReferenceScope): bigint {
	const literal = asCount(declared);

	if (literal !== undefined) {
		return literal;
	}

	if (typeof declared !== "string") {
		throw new Refusal("it is neither a number nor a name.");
	}

	return evaluateExpression(declared, "issuedAmount", scope);
}

function asCount(value: unknown): bigint | undefined {
	const counted = toBigInt(value);

	return counted !== undefined && counted >= -MAX_BASE_UNITS && counted <= MAX_BASE_UNITS
		? counted
		: undefined;
}

function toBigInt(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value) ? BigInt(value) : undefined;
}
