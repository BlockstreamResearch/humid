import { STATIC_WITNESS } from "../evaluation/witness";
import { identifiedForeignAsset, statedAsset } from "./asset";
import { asArray, asRecord } from "./json";
import type { NormalisedManifest } from "./normalise";
import { loadBearing, inspectConstructs } from "./registry";
import { contractSourcePaths } from "./sites";

/**
 * What a refusal is called, so that a program can tell two of them apart.
 *
 * The sentence is for a person and is unchanged by this. The token is for the site that asked:
 * without one, every refusal arrives as a single wire code and a paragraph of English, so "this
 * wallet does not implement `sequence`" and "your state file names no output to spend" are
 * indistinguishable to anything but a reader — and the first is permanent while the second is
 * the site's to fix.
 *
 * Short, stable, lower-case and hyphenated, after BIP-22's reject reasons. The vocabulary is
 * ours rather than the format's: txManifest defines error codes for the validation rules a
 * manifest itself declares, and none of these are that. They are the wallet's own statements
 * about what it will not do.
 */
export type RejectToken =
	/** The protocol is for a chain this wallet does not build on. */
	| "foreign-chain"
	/** A construct the format defines, in a load-bearing position, that this wallet does not implement. */
	| "unimplemented-construct"
	/** A construct in a load-bearing position that no specification this wallet knows describes. */
	| "unrecognised-construct"
	/** The manifest or a contract source asks for a compiler this wallet does not ship. */
	| "foreign-compiler"
	/** A declared build mode that is neither on nor off. */
	| "unreadable-build-mode"
	/** A witness this wallet cannot produce: not a signature, not its key, or not its sighash. */
	| "unproducible-witness"
	/** An input or output in an asset this wallet does not move. */
	| "foreign-asset"
	/** A covenant this wallet cannot build or spend. */
	| "unbuildable-utxo-type"
	/** An input or output that cannot land at the transaction position it states. */
	| "unbuildable-position"
	/** The request is missing something the chosen action actually references. */
	| "incomplete-request"
	/** The manifest declares no action by that name. */
	| "no-such-action"
	/** The state file names no output for a covenant the action spends. */
	| "no-utxo-to-spend"
	/** The chain could not be read, so what sits at an outpoint is unknown. */
	| "chain-read-failed"
	/** A covenant the wallet rebuilt does not match what the chain says holds the money. */
	| "covenant-mismatch"
	/** The wallet could not establish a fee rate, and will not build without one. */
	| "no-fee-rate"
	/** Nothing spendable sits at the one address this path can sign from. */
	| "no-funds-at-signing-address"
	/** The wallet holds less than the action needs, in the form the action can spend. */
	| "shortfall"
	/** An expression, encoding or protocol rule the manifest states could not be satisfied. */
	| "document-fault"
	/**
	 * The signing module's account of what it built is not what the wallet agreed to.
	 *
	 * Nothing a site can correct and never worth retrying: the document was read, the action
	 * resolved, and the person may already have approved. What failed is the agreement between
	 * the wallet and the module underneath it, and the wallet returns nothing rather than a
	 * transaction it cannot vouch for.
	 */
	| "built-something-else";

export type Refusal = {
	reason: string;
	reject: RejectToken;
};

/**
 * Every reason this runtime will not build an action, checked before anything is built.
 *
 * The rule is the format's own rather than house style: a tool that does not implement an
 * extension must reject a manifest using its fields rather than ignore them. What is added
 * here is that a refusal is a refusal — none of these returns a warning, and there is no
 * shape of this function that a person could click through.
 */
export function refuseUnsupported(
	manifest: NormalisedManifest,
	input: {
		compilerVersion: string;
		contractSources: Record<string, string>;
		/** The asset this wallet pays fees in and is the only one it moves today. */
		policyAsset: string;
	},
): Refusal | undefined {
	return (
		refuseForeignChain(manifest) ??
		refuseUnrecognisedConstruct(manifest) ??
		refuseForeignCompiler(manifest, input) ??
		refuseUnreadableBuildMode(manifest) ??
		refuseUnproducibleWitness(manifest) ??
		refuseForeignAsset(manifest, input.policyAsset) ??
		refuseUnbuildableUtxoType(manifest, input.policyAsset)
	);
}

/**
 * The refusals a document can be checked for on its own, and the ones it cannot.
 *
 * The split is a fact about which inputs each check needs, not a judgement about which
 * matter. Everything in the second list is decided against money, a chain, a fee rate or a
 * filled request, so a reader who has only the document has not been told those are fine —
 * they have been told nothing about them, and any surface reporting the first list has to
 * say so or it reads as a verdict it did not reach.
 */
export const DOCUMENT_ONLY_REJECTS = [
	"foreign-chain",
	"unimplemented-construct",
	"unrecognised-construct",
	"foreign-compiler",
	"unreadable-build-mode",
	"unproducible-witness",
	"foreign-asset",
	"unbuildable-utxo-type",
] as const satisfies readonly RejectToken[];

export const NEEDS_MORE_THAN_THE_DOCUMENT_REJECTS = [
	"incomplete-request",
	"no-such-action",
	"no-utxo-to-spend",
	"chain-read-failed",
	"covenant-mismatch",
	"no-fee-rate",
	"no-funds-at-signing-address",
	"shortfall",
	"unbuildable-position",
	"document-fault",
	"built-something-else",
] as const satisfies readonly RejectToken[];

/**
 * A check that ran against less than declares it, and what went unread.
 *
 * Between "not checked" and "checked" there is a third answer, and leaving it out is how a
 * surface comes to report a check as done when half of it never happened. Only the compiler
 * check can be in this state today, because it is the only one declared in two places.
 */
export type PartialCheck = {
	reject: RejectToken;
	/** What the caller did not supply, named the way the document names it. */
	unread: string[];
};

/**
 * The same refusals as {@link refuseUnsupported}, for a reader who is not a wallet.
 *
 * Four of the eight need nothing but the document. The compiler check needs the version a
 * wallet ships and the two asset checks need the network's own asset, and a caller holding
 * neither gets those checks skipped rather than answered — passing a stand-in would turn
 * "not checked" into "checked and fine", which is the one thing this must not do.
 *
 * The compiler check has a third outcome, because it reads two places: the document's own
 * declared version, and a `simc` directive inside each contract source. Given the version and
 * not the sources it answers for the first and cannot answer for the second, so it reports
 * which sources went unread rather than letting a half-answer stand as a whole one. A document
 * referencing no contracts has nothing unread and is answered in full.
 *
 * Deliberately not a parameter of `refuseUnsupported`: a wallet always holds both, and an
 * optional field on the wallet's own path is an invitation to omit one there.
 */
export function refuseFromDocumentAlone(
	manifest: NormalisedManifest,
	input: {
		compilerVersion?: string;
		contractSources?: Record<string, string>;
		policyAsset?: string;
	},
): { partial: PartialCheck[]; refusal: Refusal | undefined; skipped: RejectToken[] } {
	const skipped: RejectToken[] = [];
	const partial: PartialCheck[] = [];

	const compiler =
		input.compilerVersion === undefined
			? undefined
			: refuseForeignCompiler(manifest, {
					compilerVersion: input.compilerVersion,
					contractSources: input.contractSources ?? {},
				});

	if (input.compilerVersion === undefined) {
		skipped.push("foreign-compiler");
	} else {
		const supplied = input.contractSources ?? {};
		const unread = contractSourcePaths(manifest).filter((path) => !(path in supplied));

		if (unread.length > 0) {
			partial.push({ reject: "foreign-compiler", unread });
		}
	}

	const asset =
		input.policyAsset === undefined
			? undefined
			: (refuseForeignAsset(manifest, input.policyAsset) ??
				refuseUnbuildableUtxoType(manifest, input.policyAsset));

	if (input.policyAsset === undefined) {
		skipped.push("foreign-asset", "unbuildable-utxo-type");
	}

	return {
		partial,
		refusal:
			refuseForeignChain(manifest) ??
			refuseUnrecognisedConstruct(manifest) ??
			compiler ??
			refuseUnreadableBuildMode(manifest) ??
			refuseUnproducibleWitness(manifest) ??
			asset,
		skipped,
	};
}

/**
 * Whether this protocol's contracts are built with debug symbols.
 *
 * The flag changes the CMR and therefore the covenant address, so the wallet follows the
 * mode the protocol states and builds plainly when it states nothing. That is not a hole in
 * the address check: whatever a site declares, the wallet rebuilds the contract and refuses
 * unless the result matches where the funds actually sit, so a misdeclared mode produces a
 * refusal rather than an exploit. It decides what the wallet computes, never what it
 * compares against — which is why no user-facing setting governs it and none exists.
 */
export function buildMode(manifest: NormalisedManifest): boolean {
	return manifest.node.compile_debug_symbols === true;
}

/**
 * A protocol for a chain this wallet does not build on.
 *
 * `chain` names the network family rather than one of its networks — every published
 * manifest says `liquid`, and a protocol is not written twice for testnet and mainnet — so
 * this checks the family and leaves which Liquid network to the wallet's own configuration.
 * A manifest naming anything else describes a transaction this wallet cannot make.
 */
function refuseForeignChain(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.chain;

	if (declared === undefined || (typeof declared === "string" && LIQUID_CHAINS.has(declared))) {
		return undefined;
	}

	return {
		reason:
			`This protocol is for ${JSON.stringify(declared)}, and this wallet builds Liquid ` +
			"transactions.",
		reject: "foreign-chain",
	};
}

/** The names a Liquid protocol's `chain` can carry. */
const LIQUID_CHAINS = new Set(["elements", "elements-regtest", "liquid", "liquid-testnet"]);

/**
 * The first construct the runtime does not act on in a position where being wrong could
 * change what gets signed.
 *
 * One at a time rather than all of them: the reader of this message is deciding whether to
 * trust a site, and a list of eleven field names is not more useful than the first.
 */
function refuseUnrecognisedConstruct(manifest: NormalisedManifest): Refusal | undefined {
	const found = loadBearing(inspectConstructs(manifest))[0];

	if (!found) {
		return undefined;
	}

	return {
		reason: found.declared
			? `This protocol uses "${found.key}" at ${found.at}, which this wallet does not implement. ` +
				"It will not sign a transaction built from a document it has only partly read."
			: `This protocol uses "${found.key}" at ${found.at}, which this wallet does not recognise. ` +
				"It will not sign a transaction built from a document it has only partly read.",
		reject: found.declared ? "unimplemented-construct" : "unrecognised-construct",
	};
}

/**
 * A compiler version other than the one compiled into this wallet.
 *
 * Exactly one version ships, as a crate inside the signing module rather than as anything
 * fetched, so there is no allowlist and nothing to revoke — and a manifest asking for
 * another version cannot be honoured at all, because a different compiler derives a
 * different address for the same contract.
 *
 * Two channels declare it and both are checked against the same version, so there is no
 * precedence to define. Silence in both proceeds: four of the seven published manifests
 * declare nothing, and refusing them would be refusing for a reason unrelated to trust.
 */
function refuseForeignCompiler(
	manifest: NormalisedManifest,
	input: { compilerVersion: string; contractSources: Record<string, string> },
): Refusal | undefined {
	const declared = manifest.node.simplicity_hl_version;

	if (typeof declared === "string" && declared !== input.compilerVersion) {
		return {
			reason:
				`This protocol asks for SimplicityHL ${declared} and this wallet has ` +
				`${input.compilerVersion}. A different compiler derives a different address for the ` +
				"same contract, so there is nothing safe to build.",
			reject: "foreign-compiler",
		};
	}

	for (const [path, source] of Object.entries(input.contractSources)) {
		const range = simcDirective(source);

		if (range !== undefined && !satisfies(input.compilerVersion, range)) {
			return {
				reason:
					`The contract at ${path} asks for SimplicityHL ${range} and this wallet has ` +
					`${input.compilerVersion}.`,
				reject: "foreign-compiler",
			};
		}
	}

	return undefined;
}

/** A declared build mode that is neither on nor off says nothing this wallet can follow. */
function refuseUnreadableBuildMode(manifest: NormalisedManifest): Refusal | undefined {
	const declared = manifest.node.compile_debug_symbols;

	if (declared === undefined || typeof declared === "boolean") {
		return undefined;
	}

	return {
		reason:
			`This protocol declares compile_debug_symbols as ${JSON.stringify(declared)}, which is ` +
			"neither on nor off. The wallet builds each contract the way its protocol states, and " +
			"cannot follow a statement it cannot read.",
		reject: "unreadable-build-mode",
	};
}

/**
 * A witness this runtime cannot produce.
 *
 * The registry says the three keys are read; reading them is not the same as honouring every
 * value they can hold. A `simplicityhl` witness is a value the site computes and we do not,
 * a source other than the wallet is a key we do not hold, and a sighash type other than the
 * one we sign is a signature over something else. Each of those, signed as if it had said
 * what we can do, is a signature over a transaction nobody agreed to.
 */
function refuseUnproducibleWitness(manifest: NormalisedManifest): Refusal | undefined {
	for (const action of manifest.actions) {
		for (const declared of asArray(action.node.inputs)) {
			const input = asRecord(declared);
			const id = typeof input?.id === "string" ? input.id : "(unnamed)";

			for (const [name, entry] of Object.entries(asRecord(input?.witnesses) ?? {})) {
				const witness = asRecord(entry);
				const at = `${action.name} / input ${id} / witness ${name}`;

				// A value the document states outright is produced rather than signed: the type
				// and the literal travel to the compiler as text, which is the component that
				// parses SimplicityHL. Both have to be there — a stated value missing its type
				// is a witness nothing can check.
				if (witness?.type === STATIC_WITNESS) {
					if (typeof witness.simplicity_type === "string" && typeof witness.value === "string") {
						continue;
					}

					return {
						reason:
							`The witness ${name} at ${at} states a value and ` +
							(typeof witness.simplicity_type === "string"
								? "no value to give it."
								: "no type to give it.") +
							" This wallet will not hand a contract a value nothing can type-check.",
						reject: "unproducible-witness",
					};
				}

				if (witness?.type !== "Signature") {
					return {
						reason:
							`The witness ${name} at ${at} is a ${String(witness?.type)}, and this wallet ` +
							"can only produce a signature.",
						reject: "unproducible-witness",
					};
				}

				const source = asRecord(witness.source)?.type;

				if (source !== "wallet") {
					return {
						reason:
							`The witness ${name} at ${at} is sourced from ${String(source)}, and this ` +
							"wallet can only sign with a key it holds.",
						reject: "unproducible-witness",
					};
				}

				const sigType = witness.sig_type;

				if (sigType !== undefined && sigType !== "sig_hash_all") {
					return {
						reason:
							`The witness ${name} at ${at} asks for ${String(sigType)}, and this wallet ` +
							"signs over the whole transaction.",
						reject: "unproducible-witness",
					};
				}
			}
		}
	}

	return undefined;
}

/**
 * An input or output in an asset this document names and this wallet does not move.
 *
 * Only what the document itself settles. The format lets an asset be written as an id or as a
 * lookup into this deployment's fields, and a lookup is not an asset yet — the document has
 * said where the answer will come from and nothing about what it is. Refusing one says the
 * action moves an asset this wallet cannot, which is a statement about money that reading the
 * document has not established.
 *
 * That distinction is not academic here. Across every published manifest this project has on
 * file, not one asset is written as an id: they are `lbtc` or they are lookups. So a rule that
 * refuses any text which is not literally the network's asset refuses on the spelling every
 * time it fires, and has never once refused an asset.
 *
 * What the wallet can and cannot fund is decided against resolved ids by
 * `refuseUnfundableAsset`, once the deployment's fields have been read.
 */
function refuseForeignAsset(
	manifest: NormalisedManifest,
	policyAsset: string,
): Refusal | undefined {
	for (const action of manifest.actions) {
		const found = identifiedForeignAsset(action, policyAsset);

		if (found) {
			return {
				reason:
					`${action.name} moves ${found.asset} at ${found.at}, and this wallet moves only ` +
					"the network's own asset.",
				reject: "foreign-asset",
			};
		}
	}

	return undefined;
}

/**
 * A utxo type this wallet cannot build or spend.
 *
 * Three things about one, and each is a value the wallet would otherwise act on as if it had
 * said something else: a script that is not a Simplicity program, a covenant declared
 * confidential — which Simplicity cannot read, so the program could never introspect its own
 * value — and an asset the wallet does not move.
 */
function refuseUnbuildableUtxoType(
	manifest: NormalisedManifest,
	policyAsset: string,
): Refusal | undefined {
	for (const [name, declared] of Object.entries(manifest.utxoTypes)) {
		const utxoType = asRecord(declared);
		const scriptType = asRecord(utxoType?.script)?.type;

		if (scriptType !== undefined && scriptType !== "simplicity") {
			return {
				reason:
					`The ${name} contract is a ${String(scriptType)} script, and this wallet builds ` +
					"Simplicity covenants.",
				reject: "unbuildable-utxo-type",
			};
		}

		if (utxoType?.confidential === true) {
			return {
				reason:
					`The ${name} covenant is declared confidential. A Simplicity program cannot read a ` +
					"confidential commitment, so it could never check its own value.",
				reject: "unbuildable-utxo-type",
			};
		}

		const asset = utxoType?.asset;
		const stated = typeof asset === "string" ? statedAsset(asset, policyAsset) : undefined;

		// The same distinction the asset refusal draws, for the same reason: a covenant whose
		// asset is a lookup has not yet said what it holds, and every covenant in the published
		// corpus states its asset that way.
		if (stated?.kind === "identified") {
			return {
				reason:
					`The ${name} covenant holds ${stated.id}, and this wallet moves only the network's ` +
					"own asset.",
				reject: "unbuildable-utxo-type",
			};
		}
	}

	return undefined;
}

/** The `simc "<range>"` directive a contract source may open with. */
function simcDirective(source: string): string | undefined {
	return /(?:^|\n)\s*simc\s+"(?<range>[^"]+)"/.exec(source)?.groups?.range;
}

/**
 * Whether the shipped version satisfies what a source asks for.
 *
 * Deliberately narrow: an exact version, or a `>=` lower bound, which is what the corpus
 * and upstream's own documentation use. Any other syntax is not interpreted generously —
 * an unparsed range is treated as unsatisfied, because guessing at a constraint that
 * decides whether an address can be derived is the failure this refusal exists to prevent.
 */
function satisfies(shipped: string, range: string): boolean {
	const trimmed = range.trim();
	const lowerBound = /^>=\s*(?<version>[0-9]+(?:\.[0-9]+){0,2})$/.exec(trimmed)?.groups?.version;

	if (lowerBound !== undefined) {
		return compare(shipped, lowerBound) >= 0;
	}

	return trimmed === shipped;
}

function compare(left: string, right: string): number {
	const one = left.split(".").map(Number);
	const other = right.split(".").map(Number);

	for (let at = 0; at < Math.max(one.length, other.length); at += 1) {
		const difference = (one[at] ?? 0) - (other[at] ?? 0);

		if (difference !== 0) {
			return difference;
		}
	}

	return 0;
}
