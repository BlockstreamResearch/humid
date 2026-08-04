import { encodeExplicitTxOut, type ReadFeeRate, type ReadTxOut } from "./chainRead";
import { type CoinSelection, type SelectableUtxo, selectCoins } from "./coinSelection";
import { type CompileCovenant, covenantMatchesChain, deriveCovenantAddress } from "./covenant";
import { asArray, asRecord } from "./json";
import {
	findAction,
	type NormalisationNote,
	normaliseInstance,
	normaliseManifest,
} from "./normalise";
import { planAction } from "./plan";
import type { ReferenceScope } from "./references";
import { type ConstructFinding, ignored, inspectConstructs } from "./registry";
import { resolveActionRequirements } from "./requirements";
import { covenantSites } from "./sites";
import type { ParsedLiquidProcessCtParams } from "./types";

/**
 * What the wallet established for itself about one covenant this action touches.
 *
 * `verified` is the wallet's own finding, never the site's claim. A covenant the action
 * creates has nothing to compare against yet — its protection is that the destination is
 * derived rather than supplied — and says so rather than reporting a check it did not do.
 */
export type CovenantFinding = {
	address: string;
	role: "created" | "spent";
	utxoType: string;
	verified: "matches-chain" | "not-yet-on-chain";
};

/**
 * One covenant the transaction spends, with everything needed to spend it.
 *
 * The source and arguments are the ones the wallet verified against the chain, not a
 * second copy read out of the request again.
 */
export type ReviewedCovenantInput = {
	argumentsJson: string;
	source: string;
	txOutHex: string;
	txid: string;
	vout: number;
};

/** One output of the transaction the wallet worked out, ready to be shown and then built. */
export type ReviewedOutput = {
	id: string;
	sats: bigint;
	scriptPubKeyHex: string;
};

/**
 * Everything the wallet established, worked out and decided — before anyone approves it.
 *
 * The transaction is settled here rather than after the confirmation deliberately: what a
 * person is asked to approve should be the transaction that gets signed, not a description
 * of one that will be assembled afterwards from the same inputs and might not match.
 * Signing is the only thing left for `execute`.
 */
export type ManifestReview = {
	action: string;
	covenants: CovenantFinding[];
	/** The covenant outputs this action spends, ready to be added as inputs. */
	covenantInputs: ReviewedCovenantInput[];
	/** What the wallet will pay, established from the chain rather than from the request. */
	feeRateSatsPerKvb: number;
	/**
	 * Constructs the manifest carries that this runtime did not act on and did not need to.
	 *
	 * Recorded rather than dropped: a construct that changes nothing still tells a reader
	 * which parts of a document the wallet did not read, and a wallet that ignores something
	 * silently is indistinguishable from one that missed it.
	 */
	ignoredConstructs: ConstructFinding[];
	/** Legacy spellings the document used, so the generation it came from can be reported. */
	normalisation: NormalisationNote[];
	outputs: ReviewedOutput[];
	protocol: string;
	/** The wallet's own outputs that fund this, chosen by the wallet. */
	selected: SelectableUtxo[];
};

export type ReviewRefusal = { reason: string; refused: true };

export type ReviewManifestActionResult = ManifestReview | ReviewRefusal;

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

/**
 * Establishes what the wallet knows about an action before anyone is asked to approve it.
 *
 * Runs before the permission gate deliberately: a standing permission skips the prompt,
 * so this is the only thing between a request and a signature. Everything it cannot
 * establish is a refusal — there is no return value that means "probably fine".
 *
 * The document is normalised once, here, and everything downstream reads that rather than
 * the request's raw JSON. That is what makes the two declaration shapes and the two
 * reference namespaces indistinguishable to the rest of the wallet instead of a condition
 * each reader has to remember.
 */
export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: {
		compile: CompileCovenant;
		/** The wallet's spendable outputs, and where its own change and payments go. */
		fundingUtxos: SelectableUtxo[];
		network: string;
		readFeeRate: ReadFeeRate;
		readTxOut: ReadTxOut;
		walletScriptPubKeyHex: string;
	},
): Promise<ReviewManifestActionResult> {
	const normalised = normaliseManifest(request.manifest);
	const manifest = normalised.manifest;
	const deployment = normaliseInstance(request.instance);
	const notes: NormalisationNote[] = [...normalised.notes, ...deployment.notes];

	const requirements = resolveActionRequirements(request, manifest);

	if (requirements.missing.length > 0) {
		const named = requirements.missing
			.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
			.join(" ");

		return { reason: `This request cannot be built. ${named}`, refused: true };
	}

	const action = findAction(manifest, request.action);

	if (!action) {
		return { reason: `The manifest declares no action named "${request.action}".`, refused: true };
	}

	const declaredTypes = declaredParamTypes(action.node);
	const covenants: CovenantFinding[] = [];
	const covenantInputs: ReviewedCovenantInput[] = [];
	/** What each covenant input actually holds, read from the chain rather than told. */
	const inputs: Record<string, Record<string, unknown>> = {};

	const scope: ReferenceScope = {
		inputs,
		instance: deployment.instance.fields,
		params: request.params,
	};

	for (const site of covenantSites(action)) {
		const derived = await deriveCovenantAddress(manifest, {
			compile: input.compile,
			contractSources: request.contractSources,
			declaredTypes,
			network: input.network,
			notes,
			scope,
			utxoType: site.utxoType,
			wiring: site.wiring,
		});

		if (!derived.ok) {
			return { reason: derived.reason, refused: true };
		}

		if (site.role === "created") {
			covenants.push({
				address: derived.derivation.address,
				role: "created",
				utxoType: site.utxoType,
				verified: "not-yet-on-chain",
			});

			continue;
		}

		const outpoint = findStateOutpoint(request, site.utxoType);

		if (!outpoint) {
			return {
				reason: `The state file lists no ${site.utxoType} to spend.`,
				refused: true,
			};
		}

		let onChain;

		try {
			onChain = await input.readTxOut(outpoint);
		} catch (error) {
			return {
				reason: `Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				refused: true,
			};
		}

		const matched = covenantMatchesChain(derived.derivation, onChain.scriptPubKeyAddress);

		if (!matched.matched) {
			return { reason: matched.reason, refused: true };
		}

		if (onChain.amountSats !== undefined && site.id) {
			inputs[site.id] = { amount_sat: BigInt(onChain.amountSats) };
		}

		const txOutHex = encodeExplicitTxOut(onChain);

		if (!txOutHex) {
			return {
				reason:
					`The ${site.utxoType} at ${outpoint.txid}:${outpoint.vout} is confidential. ` +
					"A covenant output cannot be, because Simplicity cannot read a confidential commitment.",
				refused: true,
			};
		}

		covenantInputs.push({
			argumentsJson: derived.derivation.argumentsJson,
			source: derived.derivation.source,
			txOutHex,
			txid: outpoint.txid,
			vout: outpoint.vout,
		});

		covenants.push({
			address: derived.derivation.address,
			role: "spent",
			utxoType: site.utxoType,
			verified: "matches-chain",
		});
	}

	const plan = planAction(action, scope, notes);

	if (!plan.ok) {
		return { reason: plan.reason, refused: true };
	}

	const covenantScripts = new Map(covenants.map((found) => [found.utxoType, found.address]));
	const outputs: ReviewedOutput[] = [];

	for (const planned of plan.plan.outputs) {
		if (planned.target.kind === "change" || planned.sats === undefined) {
			continue;
		}

		// A covenant output pays the address the wallet derived, never one the request
		// supplied. There is no path from a site-supplied address to a transaction output.
		const scriptPubKeyHex =
			planned.target.kind === "covenant"
				? covenantScripts.get(planned.target.utxoType)
				: input.walletScriptPubKeyHex;

		if (!scriptPubKeyHex) {
			return {
				reason: `Output ${planned.id} pays a covenant the wallet did not verify.`,
				refused: true,
			};
		}

		outputs.push({ id: planned.id, sats: planned.sats, scriptPubKeyHex });
	}

	let feeRateSatsPerKvb: number;

	try {
		feeRateSatsPerKvb = await input.readFeeRate(FEE_TARGET_BLOCKS);
	} catch (error) {
		return {
			reason: `The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
			refused: true,
		};
	}

	const selection: CoinSelection = selectCoins(
		input.fundingUtxos,
		plan.plan.fundingSats,
		BigInt(Math.ceil(feeRateSatsPerKvb)),
	);

	if (!selection.ok) {
		return { reason: selection.reason, refused: true };
	}

	return {
		action: request.action,
		covenantInputs,
		covenants,
		feeRateSatsPerKvb,
		ignoredConstructs: ignored(inspectConstructs(manifest)),
		normalisation: notes,
		outputs,
		protocol: manifest.protocol ?? "",
		selected: selection.selected,
	};
}

/** Confirmation target for the fee estimate, in blocks. */
const FEE_TARGET_BLOCKS = 6;

function findStateOutpoint(
	request: ParsedLiquidProcessCtParams,
	utxoType: string,
): { txid: string; vout: number } | undefined {
	for (const entry of asArray(request.state?.utxos)) {
		const utxo = asRecord(entry);

		if (utxo?.utxo_type !== utxoType) {
			continue;
		}

		if (typeof utxo.txid === "string" && typeof utxo.vout === "number") {
			return { txid: utxo.txid, vout: utxo.vout };
		}
	}

	return undefined;
}

function declaredParamTypes(action: Record<string, unknown>): Record<string, string> {
	const types: Record<string, string> = {};

	for (const [name, declared] of Object.entries(asRecord(action.params) ?? {})) {
		const type = asRecord(declared)?.type;

		if (typeof type === "string") {
			types[name] = type;
		}
	}

	return types;
}
