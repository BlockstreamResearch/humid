import { MAX_BASE_UNITS } from "../chain/baseUnits";
import { type DerivedIssuance, deriveNewIssuance, type Outpoint } from "../chain/issuance";
import { asRecord } from "../document/json";
import type { NormalisationNote } from "../document/normalise";
import type { ReferenceScope } from "../document/references";
import { evaluateExpression } from "./evaluate";

/**
 * What one input's issuance block asks for, once its amounts are worked out.
 *
 * The kind is narrowed to the one this wallet can carry out. A reissuance is refused rather
 * than represented, because a value that stands for something the runtime will not do is a
 * value some later branch treats as a case to handle.
 */
export type IssuanceRequest = {
	/** Units of the asset to create. */
	assetAmountSats: bigint;
	/** Units of the token that would authorise reissuing it. Always zero here; see below. */
	inflationAmountSats: bigint;
	kind: "new";
};

/** One input's issuance, worked out and derived against the output that input spends. */
export type PlannedIssuance = DerivedIssuance &
	IssuanceRequest & {
		/** The manifest's id for the input carrying it. */
		inputId: string;
		/** The output the asset is derived from, which is what makes the id what it is. */
		outpoint: Outpoint;
	};

export type IssuanceResult =
	| { issuance: PlannedIssuance; ok: true }
	| { ok: false; reason: string; reject: IssuanceReject };

/**
 * Why an issuance was refused: the document is wrong, or the wallet will not mint that.
 *
 * Two words rather than one because they are answers to different questions. A document
 * fault is something whoever wrote the manifest can fix. An unimplemented construct is the
 * format asking for something this wallet has deliberately not built, and no edit to the
 * document makes it buildable here.
 */
export type IssuanceReject = "document-fault" | "unimplemented-construct";

/** The issuance an input declares, if it declares one. */
export function declaredIssuance(
	input: Record<string, unknown>,
): Record<string, unknown> | undefined {
	return asRecord(input.issuance);
}

/**
 * Works out what an input's issuance creates, and from which of the wallet's outputs.
 *
 * Every refusal here is about what this wallet will not mint rather than about a malformed
 * document, which is why they name the construct: a protocol whose asset can only exist as a
 * blinded one is not a protocol this wallet builds badly, it is one it does not build.
 */
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

	// The format defines two kinds and this wallet carries out one. A reissuance mints an
	// asset that already exists, so it is derived from the entropy the first issuance left
	// behind rather than from anything in this transaction — and that entropy reaches a
	// request only on a supplied input, which this wallet does not read. Deriving it from
	// this input's outpoint instead would mint a different asset under the protocol's name.
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

	// Liquid requires a reissuance token to be held confidentially, and this wallet builds
	// explicit transactions — a covenant cannot introspect a blinded value, which is why the
	// whole path is explicit. Minting one anyway would produce a token nobody can spend.
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

/**
 * What an issuance says about its own values, for a later expression to read.
 *
 * Two bare names mean the input being resolved, and this is what they resolve to. The asset
 * is the issued one rather than the one the spent output held: an issuing input's `asset` is
 * what it creates, which is the whole reason a protocol writes the hook.
 */
export function issuanceAttributes(issuance: PlannedIssuance): Record<string, unknown> {
	return { asset: issuance.asset, reissuance_token: issuance.reissuanceToken };
}

/**
 * A literal count, a lookup the issued-amount site accepts, or arithmetic over either.
 *
 * The site accepts what a compile parameter accepts and no more: this deployment's fields, the
 * request's parameters and arguments, and a bare name. An attribute of a resolved input is not
 * among them, because this issuance is what makes that input's asset what it is — reading one
 * here would be reading the answer out of the question.
 */
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

/**
 * A whole number of base units, however the document or the request spelled it.
 *
 * Bounded by what a value in this encoding can hold, and bounded here rather than downstream.
 * A literal is not evaluated — that is what keeps a hash from being read as arithmetic — so
 * nothing else on this path would notice a supply of a hundred digits, and a bigint carries one
 * happily all the way to the wasm boundary, where it becomes somebody else's exception rather
 * than this wallet's refusal.
 */
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
