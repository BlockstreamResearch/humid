import { MAX_BASE_UNITS } from "../chain/baseUnits";
import { type DerivedIssuance, deriveNewIssuance, type Outpoint } from "../chain/issuance";
import { asRecord } from "../document/json";
import type { NormalisationNote } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { evaluateExpression } from "./evaluate";

export type IssuanceRequest = {
	assetAmountSats: bigint;
	inflationAmountSats: bigint;
	kind: "new";
};

export type PlannedIssuance = DerivedIssuance &
	IssuanceRequest & {
		inputId: string;
		outpoint: Outpoint;
	};

export type IssuanceResult =
	| { issuance: PlannedIssuance; ok: true }
	| { ok: false; reason: string; reject: IssuanceReject };

export type IssuanceReject = "document-fault" | "unimplemented-construct";

export function declaredIssuance(
	input: Record<string, unknown>,
): Record<string, unknown> | undefined {
	return asRecord(input.issuance);
}

export function resolveIssuance(
	input: {
		declared: Record<string, unknown>;
		id: string;
		outpoint: Outpoint;
	},
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): IssuanceResult {
	const kind = input.declared.kind;

	if (kind === "reissue") {
		return {
			ok: false,
			reason:
				`Input ${input.id} reissues an asset, and this wallet has nothing to derive it from: ` +
				"the entropy of the original issuance is not part of what a site sends it.",
			reject: "unimplemented-construct",
		};
	}

	if (kind !== "new") {
		return {
			ok: false,
			reason:
				`Input ${input.id} declares an issuance of kind ${JSON.stringify(kind)}, and the ` +
				'format defines "new" and "reissue".',
			reject: "document-fault",
		};
	}

	const assetAmount = amountOf(input.declared.asset_amount_sat, scope, notes);

	if (!assetAmount.ok) {
		return {
			ok: false,
			reason: `Input ${input.id} does not say how much it issues: ${assetAmount.reason}`,
			reject: "document-fault",
		};
	}

	if (assetAmount.value <= 0n) {
		return {
			ok: false,
			reason: `Input ${input.id} issues ${assetAmount.value} units, which creates no asset.`,
			reject: "document-fault",
		};
	}

	const inflation =
		input.declared.inflation_amount_sat === undefined
			? { ok: true as const, value: 0n }
			: amountOf(input.declared.inflation_amount_sat, scope, notes);

	if (!inflation.ok) {
		return {
			ok: false,
			reason: `Input ${input.id} does not say how many reissuance tokens it mints: ${inflation.reason}`,
			reject: "document-fault",
		};
	}

	if (inflation.value !== 0n) {
		return {
			ok: false,
			reason:
				`Input ${input.id} mints ${inflation.value} reissuance tokens, which have to be held ` +
				"confidentially, and this wallet builds transactions whose values are all explicit.",
			reject: "unimplemented-construct",
		};
	}

	const derived = deriveNewIssuance(input.outpoint);

	if (!derived) {
		return {
			ok: false,
			reason:
				`Input ${input.id} issues an asset from ${input.outpoint.txid}:${input.outpoint.vout}, ` +
				"which is not an output this wallet can read.",
			reject: "document-fault",
		};
	}

	return {
		issuance: {
			...derived,
			assetAmountSats: assetAmount.value,
			inflationAmountSats: 0n,
			inputId: input.id,
			kind: "new",
			outpoint: input.outpoint,
		},
		ok: true,
	};
}

export function issuanceAttributes(issuance: PlannedIssuance): Record<string, unknown> {
	return { asset: issuance.asset, reissuance_token: issuance.reissuanceToken };
}

function amountOf(
	declared: unknown,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): { ok: false; reason: string } | { ok: true; value: bigint } {
	const literal = asCount(declared);

	if (literal !== undefined) {
		return { ok: true, value: literal };
	}

	if (typeof declared !== "string") {
		return { ok: false, reason: "it is neither a number nor a name." };
	}

	const evaluated = evaluateExpression(declared, "issuedAmount", scope, notes);

	return evaluated.ok ? { ok: true, value: evaluated.value } : evaluated;
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
