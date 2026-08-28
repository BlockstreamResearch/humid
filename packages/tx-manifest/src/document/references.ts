import { asArray, asRecord } from "./json";
import type { NormalisationNote, NormalisedAction, NormalisedManifest } from "./normalise";
import { namedUtxoTypes } from "./sites";

/**
 * The shapes a reference can take.
 *
 * These are not variations on a syntax; they are six different lookups that happen to be
 * written as strings. `fee` is the wallet's own figure, `instance` is this deployment's
 * field values, `params` and `args` are the request's, `bare` is whichever of the last two
 * has the name, and `input-attribute` is something the wallet established about a
 * transaction input by reading the chain.
 */
export type ReferenceForm = "args" | "bare" | "fee" | "input-attribute" | "instance" | "params";

export type ParsedReference = {
	/** The attribute being read, for the input-attribute form. */
	attribute?: string;
	/** Whether the document used a spelling the format has deprecated. */
	deprecated?: boolean;
	form: ReferenceForm;
	/** The name being looked up; empty for `fee`, which names nothing. */
	name: string;
};

/**
 * What a reference can be resolved against.
 *
 * Everything is optional except the request's parameters, because a reference resolves
 * against whatever exists at the moment it is asked — an amount referencing the fee cannot
 * be resolved before the fee is established, and saying so is more useful than resolving
 * it to zero.
 */
export type ReferenceScope = {
	args?: Record<string, unknown>;
	/** The wallet's own fee figure, once it has one. */
	fee?: bigint;
	/** What the wallet established about each named input, keyed by the manifest's id. */
	inputs?: Record<string, Record<string, unknown>>;
	/** This deployment's field values. */
	instance?: Record<string, unknown>;
	params: Record<string, unknown>;
};

/**
 * The value and how it was found — and deliberately nothing about how it was spelled.
 *
 * Two documents writing one lookup in two accepted spellings must be indistinguishable to
 * everything downstream, so a deprecation marker cannot ride on the result. That a
 * deprecated spelling was used is recorded on the notes channel instead, beside the key
 * renames the normalisation layer records, where it informs a reader without changing a
 * value.
 */
export type ReferenceResolution =
	| { form: ReferenceForm; ok: true; value: unknown }
	| { ok: false; reason: string };

/**
 * A position in a manifest where a reference may appear, and the forms it accepts there.
 *
 * This is the cornerstone: a reference means what its position says it may mean, not what
 * its text looks like. The same string is a legitimate compile parameter in one place and
 * nonsense in another, and the difference is not detectable from the string.
 *
 * The clearest case is `fee`. A covenant's address is derived from its compile parameters,
 * and the fee is derived from the transaction that pays to that address — so a compile
 * parameter referencing the fee is circular. Listing the accepted forms per site makes that
 * unrepresentable rather than a mistake to be caught downstream.
 */
export type ReferenceSiteKind =
	| "amount"
	| "asset"
	| "compileParam"
	| "dataPart"
	| "destination"
	| "expression"
	| "extraLeaf"
	| "issuedAmount"
	| "witnessKey"
	| "witnessValue";

const SITES: Record<ReferenceSiteKind, { accepts: ReferenceForm[]; describes: string }> = {
	/** An output's amount, or an input's minimum. */
	amount: {
		accepts: ["fee", "instance", "params", "args", "input-attribute", "bare"],
		describes: "an amount",
	},
	/**
	 * The asset an input or output carries.
	 *
	 * The fee is absent because the fee is a number of the network's own asset, and an asset is
	 * not a quantity of anything. Every other form is here because the corpus writes all of
	 * them: this deployment's fields, the request's parameters and arguments, a bare name, and
	 * an attribute of an input the wallet already resolved — `payout_in.asset`, which says "the
	 * same asset that one arrived in" without naming it.
	 */
	asset: {
		accepts: ["instance", "params", "args", "input-attribute", "bare"],
		describes: "an asset",
	},
	/** A value compiled into a contract, which therefore decides its address. */
	compileParam: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "a compile parameter",
	},
	/**
	 * A value inside the bytes an output publishes about the action.
	 *
	 * The fee is absent, and the reason is not the one that keeps it out of a compile
	 * parameter. Nothing here is circular: the fee a part could carry only ever lands in one
	 * of this vocabulary's fixed-width integers, so the payload's length does not move with
	 * its value, and the wallet's own estimate prices an output by the fact that it exists
	 * rather than by how many bytes it carries. What is wrong is the number itself. The
	 * wallet's figure is a model made before anything is signed, and the module that signs
	 * weighs the finished transaction and charges its own; the two differ by construction. An
	 * amount computed from the model is absorbed, because the difference lands in change — a
	 * published record is absorbed by nothing. It would state on chain, permanently, a fee the
	 * transaction did not pay, and no reader of those bytes could tell.
	 *
	 * Everything the expression site accepts other than the fee is here, because a payload
	 * naming this deployment's fields, the request, or something the wallet read about an
	 * input is naming a figure already settled when the bytes are written.
	 */
	dataPart: {
		accepts: ["instance", "params", "args", "input-attribute", "bare"],
		describes: "a data part",
	},
	/** Where an output pays, when it names a parameter rather than a keyword. */
	destination: { accepts: ["params"], describes: "a destination" },
	/** A validation's expression. Evaluating the expression is a later slice; this resolves one term of it. */
	expression: {
		accepts: ["fee", "instance", "params", "args", "input-attribute", "bare"],
		describes: "an expression",
	},
	/**
	 * A value inside one of a covenant's extra taproot leaves.
	 *
	 * The leaves are part of the tree the covenant's address is derived from, so this position
	 * accepts what a compile parameter accepts and for the same reasons. The fee is absent
	 * because it is worked out from a transaction that pays to the address this decides, which
	 * is circular. An attribute of a resolved input is absent for a sharper version of the same
	 * problem: it is read from the chain at the outpoint this covenant is being derived in order
	 * to check, so a leaf reading one would be checking an address against itself.
	 */
	extraLeaf: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "an extra taproot leaf",
	},
	/**
	 * How many units an issuance creates, which is not an amount anyone pays.
	 *
	 * The fee is absent for the same reason it is absent from a compile parameter: the fee
	 * comes from the shape of the transaction, and how much of an asset exists cannot depend
	 * on what it costs to say so. An attribute of a resolved input is absent because the
	 * issuance is what makes that input's asset what it is.
	 */
	issuedAmount: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "an issued amount",
	},
	/** The key a witness is produced from. */
	witnessKey: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "a witness key",
	},
	/**
	 * A name appearing inside the typed value a witness states.
	 *
	 * The fee is absent because a witness decides which branch of a contract runs, and a
	 * branch chosen by what the transaction costs would change as the transaction's own shape
	 * changed. An attribute of a resolved input is absent because no published protocol reads
	 * one here and admitting a form nothing exercises is admitting one nothing checks.
	 */
	witnessValue: {
		accepts: ["instance", "params", "args"],
		describes: "part of a witness value",
	},
};

/** The namespaces a prefixed reference can name, and what each canonically resolves as. */
const NAMESPACES: Record<string, { deprecated: boolean; form: ReferenceForm }> = {
	args: { deprecated: false, form: "args" },
	// The format is mid-rename from compile_params. to instance.; both are live in the
	// corpus, and one manifest generation writes each. They are the same lookup.
	compile_params: { deprecated: true, form: "instance" },
	instance: { deprecated: false, form: "instance" },
	params: { deprecated: false, form: "params" },
};

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REFERENCE = new RegExp(`^\\$?(?<head>${NAME})(?:\\.(?<tail>${NAME}))?$`);

/**
 * Reads one reference, or reports that the text is not one.
 *
 * Deliberately not an expression parser: `params.a + 1` is an expression whose terms happen
 * to include a reference, and evaluating it is the phased-evaluation slice's subject. This
 * returns nothing for it rather than resolving the first term and losing the rest.
 */
export function parseReference(text: string): ParsedReference | undefined {
	const match = REFERENCE.exec(text.trim());
	const head = match?.groups?.head;

	if (!head) {
		return undefined;
	}

	const tail = match?.groups?.tail;

	if (tail === undefined) {
		return head === "fee" ? { form: "fee", name: "" } : { form: "bare", name: head };
	}

	const namespace = NAMESPACES[head];

	if (namespace) {
		return {
			...(namespace.deprecated ? { deprecated: true } : {}),
			form: namespace.form,
			name: tail,
		};
	}

	// Anything else with one dot names an input and an attribute of it — `amount_sat`,
	// `asset`, or something the wallet derived such as a reissuance token.
	return { attribute: tail, form: "input-attribute", name: head };
}

/**
 * Resolves one reference at one site.
 *
 * A refusal names both the text and what was wrong with it, because the reader of that
 * message is a person deciding whether to trust a site, not the author of the manifest.
 *
 * `notes` collects the deprecated spellings encountered. It is optional because most
 * callers only want the value; a caller building something a person will read passes one
 * so the document's generation can be reported.
 */
export function resolveReference(
	text: string,
	site: ReferenceSiteKind,
	scope: ReferenceScope,
	notes?: NormalisationNote[],
): ReferenceResolution {
	const reference = parseReference(text);
	const accepted = SITES[site];

	if (!reference) {
		return { ok: false, reason: `"${text}" is not a reference.` };
	}

	if (!accepted.accepts.includes(reference.form)) {
		return {
			ok: false,
			reason: `"${text}" cannot be used as ${accepted.describes}.`,
		};
	}

	if (reference.deprecated) {
		notes?.push({ at: `${accepted.describes}`, canonical: "instance.", found: "compile_params." });
	}

	const found = lookUp(reference, scope);

	return found.ok ? { form: reference.form, ok: true, value: found.value } : found;
}

function lookUp(
	reference: ParsedReference,
	scope: ReferenceScope,
): { ok: true; value: unknown } | { ok: false; reason: string } {
	switch (reference.form) {
		case "args": {
			return read(scope.args, reference.name, "args");
		}

		// Tried as a parameter first and then as an argument, which is the order the
		// reference implementation uses. An unqualified word is ambiguous by design: the
		// format offers no way to say which of the two was meant.
		case "bare": {
			if (scope.params && reference.name in scope.params) {
				return { ok: true, value: scope.params[reference.name] };
			}

			if (scope.args && reference.name in scope.args) {
				return { ok: true, value: scope.args[reference.name] };
			}

			return {
				ok: false,
				reason: `"${reference.name}" is neither a parameter nor an argument of this action.`,
			};
		}

		case "fee": {
			return scope.fee === undefined
				? { ok: false, reason: "The fee is referenced before the wallet has established one." }
				: { ok: true, value: scope.fee };
		}

		case "input-attribute": {
			const input = scope.inputs?.[reference.name];

			if (!input) {
				return {
					ok: false,
					reason: `"${reference.name}" is not an input this action resolved.`,
				};
			}

			return read(input, reference.attribute ?? "", `input ${reference.name}`);
		}

		case "instance": {
			return read(scope.instance, reference.name, "instance");
		}

		case "params": {
			return read(scope.params, reference.name, "params");
		}
	}
}

function read(
	source: Record<string, unknown> | undefined,
	name: string,
	label: string,
): { ok: true; value: unknown } | { ok: false; reason: string } {
	if (!source) {
		return { ok: false, reason: `This request carries no ${label} to resolve "${name}" against.` };
	}

	if (!(name in source)) {
		return { ok: false, reason: `${label} carries no "${name}".` };
	}

	return { ok: true, value: source[name] };
}

/** One reference the runtime found, and the position that says what it may mean. */
export type ReferenceOccurrence = {
	/** Where it is, in the document's own terms. */
	at: string;
	site: ReferenceSiteKind;
	text: string;
};

/** Destination words that are keywords rather than references. */
const DESTINATION_KEYWORDS = new Set(["change", "wallet"]);

/**
 * Every reference an action reaches, with the site each one sits at.
 *
 * This is the enumeration the rest of the runtime asks instead of searching a document for
 * reference-shaped text. The difference is not tidiness: a search finds `params.pubkey`
 * inside a description and treats it as a reference, and misses one at a position it did
 * not think to look. Positions are declared here once.
 *
 * Expression sites are tokenised rather than parsed — the occurrences it reports are the
 * terms an expression mentions, which is what a caller asking "does this action read the
 * instance file" needs. Evaluating the expression, and ordering the evaluation, belong to
 * the phased-evaluation slice.
 */
export function actionReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): ReferenceOccurrence[] {
	const found: ReferenceOccurrence[] = [];
	const where = `action ${action.name}`;

	const add = (site: ReferenceSiteKind, at: string, value: unknown): void => {
		if (typeof value !== "string") {
			return;
		}

		if (site === "expression") {
			for (const token of expressionTerms(value)) {
				found.push({ at, site, text: token });
			}

			return;
		}

		found.push({ at, site, text: value });
	};

	const addWiring = (at: string, wiring: unknown): void => {
		for (const [name, value] of Object.entries(asRecord(wiring) ?? {})) {
			add("compileParam", `${at} / ${name}`, value);
		}
	};

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);
		const at = `${where} / input ${identifierOf(input)}`;

		addWiring(at, asRecord(input?.utxo_source)?.compile_params);
		add("amount", `${at} / amount_sat`, input?.amount_sat);
		add("amount", `${at} / amount_sat`, asRecord(input?.amount_sat)?.min_amount);

		for (const [name, witness] of Object.entries(asRecord(input?.witnesses) ?? {})) {
			add("witnessKey", `${at} / witness ${name}`, asRecord(asRecord(witness)?.source)?.key);
		}
	}

	for (const declared of asArray(action.node.outputs)) {
		const output = asRecord(declared);
		const at = `${where} / output ${identifierOf(output)}`;
		const destination = output?.destination;

		addWiring(at, asRecord(destination)?.compile_params);
		add("amount", `${at} / amount_sat`, output?.amount_sat);

		if (typeof destination === "string" && !DESTINATION_KEYWORDS.has(destination)) {
			add("destination", `${at} / destination`, destination);
		}
	}

	for (const declared of asArray(action.node.validations)) {
		const validation = asRecord(declared);
		const at = `${where} / validation ${identifierOf(validation)}`;

		add("expression", at, asRecord(validation?.rule)?.expr);
	}

	// A covenant's parameters can also be wired on the utxo type itself rather than at the
	// site that names it, so the types this action reaches are part of its reference surface.
	for (const name of namedUtxoTypes(action)) {
		const script = asRecord(asRecord(manifest.utxoTypes[name])?.script);

		addWiring(`utxo type ${name} / script`, script?.compile_params);
	}

	return found;
}

/** Whether the action reads this deployment's field values, under either spelling. */
export function readsInstance(manifest: NormalisedManifest, action: NormalisedAction): boolean {
	return instanceReferences(manifest, action).length > 0;
}

/**
 * Every place the action reads this deployment's field values.
 *
 * Returned rather than reduced to a flag because a free action reaching for them is a
 * document that cannot be satisfied — a deployment's fields belong to a class, and an
 * action declared outside one has no deployment to read. Naming the positions is what lets
 * that be said rather than merely detected.
 */
export function instanceReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): ReferenceOccurrence[] {
	return actionReferences(manifest, action).filter(
		(occurrence) => parseReference(occurrence.text)?.form === "instance",
	);
}

/**
 * The reference-shaped terms of an expression, without evaluating it.
 *
 * Splitting on everything a name cannot contain is enough to find the terms and is not
 * enough to evaluate anything, which is the intent: this answers "what does this mention",
 * and the phased-evaluation slice answers "what does this come to".
 */
function expressionTerms(text: string): string[] {
	return text
		.split(/[^A-Za-z0-9_.$]+/)
		.filter((term) => term.length > 0 && parseReference(term) !== undefined);
}

function identifierOf(node: Record<string, unknown> | undefined): string {
	return typeof node?.id === "string" ? node.id : "(unnamed)";
}
