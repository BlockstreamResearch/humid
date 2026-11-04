import { MAX_BASE_UNITS } from "../chain/baseUnits";
import { type DerivedIssuance, deriveNewIssuance, type Outpoint } from "../chain/issuance";
import { asRecord } from "../document/json";
import type { ReferenceScope } from "../document/references";
import { Refusal } from "../refusal";
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
): PlannedIssuance {
	const kind = input.declared.kind;

	if (kind === "reissue") {
		throw new Refusal(
			`Input ${input.id} reissues an asset, and this wallet has nothing to derive it from: ` +
				"the entropy of the original issuance is not part of what a site sends this wallet.",
			"unimplemented-construct",
		);
	}

	if (kind !== "new") {
		throw new Refusal(
			`Input ${input.id} declares an issuance of kind ${JSON.stringify(kind)}, and the ` +
				'format defines "new" and "reissue".',
		);
	}

	const assetAmountSats = Refusal.amend(
		() => amountOf(input.declared.asset_amount_sat, scope),
		(reason) => `Input ${input.id} does not say how much it issues: ${reason}`,
	);

	if (assetAmountSats <= 0n) {
		throw new Refusal(`Input ${input.id} issues ${assetAmountSats} units, which creates no asset.`);
	}

	const inflation =
		input.declared.inflation_amount_sat === undefined
			? 0n
			: Refusal.amend(
					() => amountOf(input.declared.inflation_amount_sat, scope),
					(reason) =>
						`Input ${input.id} does not say how many reissuance tokens it mints: ${reason}`,
				);

	if (inflation !== 0n) {
		throw new Refusal(
			`Input ${input.id} mints ${inflation} reissuance tokens, which have to be held ` +
				"confidentially, and this wallet builds transactions whose values are all explicit.",
			"unimplemented-construct",
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
		inflationAmountSats: 0n,
		inputId: input.id,
		kind: "new",
		outpoint: input.outpoint,
	};
}

export function issuanceAttributes(issuance: PlannedIssuance): Record<string, unknown> {
	return { asset: issuance.asset, reissuance_token: issuance.reissuanceToken };
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
