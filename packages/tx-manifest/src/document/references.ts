import { asArray, asRecord } from "./json";
import {
	declaredFields,
	type NormalisationNote,
	type NormalisedAction,
	type NormalisedManifest,
} from "./normalise";
import { namedUtxoTypes } from "./sites";

/**
 * The shapes a reference can take.
 *
 * These are not variations on a syntax; they are different lookups that happen to be written as
 * strings. `instance` is this deployment's field values, `params` and `args` are the request's,
 * `bare` is whichever of the last two has the name, and `input-attribute` is something about a
 * transaction input the wallet would have had to read the chain to know.
 *
 * `input-attribute` is parsed and accepted nowhere in this slice. It is here so that a dotted
 * name in an unknown namespace is recognised as the lookup it is and refused for what it is,
 * rather than falling through to something that happens to resolve.
 */
export type ReferenceForm = "args" | "bare" | "input-attribute" | "instance" | "params";

export type ParsedReference = {
	/** The attribute being read, for the input-attribute form. */
	attribute?: string;
	/** Whether the document used a spelling the format has deprecated. */
	deprecated?: boolean;
	form: ReferenceForm;
	/** The name being looked up. */
	name: string;
};

/**
 * What a reference can be resolved against.
 *
 * Everything is optional except the request's parameters, because a reference resolves against
 * whatever exists at the moment it is asked, and saying "there is no deployment to read that
 * from" is more useful than resolving it to zero.
 */
export type ReferenceScope = {
	args?: Record<string, unknown>;
	/** This deployment's field values. */
	instance?: Record<string, unknown>;
	params: Record<string, unknown>;
};

/**
 * The value and how it was found — and deliberately nothing about how it was spelled.
 *
 * Two documents writing one lookup in two accepted spellings must be indistinguishable to
 * everything downstream, so a deprecation marker cannot ride on the result. That a deprecated
 * spelling was used is recorded on the notes channel instead, where it informs a reader without
 * changing a value.
 */
export type ReferenceResolution =
	| { form: ReferenceForm; ok: true; value: unknown }
	| { ok: false; reason: string };

/**
 * A position in a manifest where a reference may appear, and the forms it accepts there.
 *
 * This is the cornerstone: a reference means what its position says it may mean, not what its
 * text looks like. The same string is a legitimate compile parameter in one place and nonsense
 * in another, and the difference is not detectable from the string. Listing the accepted forms
 * per site makes the wrong ones unrepresentable rather than a mistake to be caught downstream.
 */
export type ReferenceSiteKind = "amount" | "compileParam" | "destination";

const SITES: Record<ReferenceSiteKind, { accepts: ReferenceForm[]; describes: string }> = {
	/** An output's amount, or an input's minimum. */
	amount: { accepts: ["instance", "params", "args", "bare"], describes: "an amount" },
	/** A value compiled into a contract, which therefore decides its address. */
	compileParam: {
		accepts: ["instance", "params", "args", "bare"],
		describes: "a compile parameter",
	},
	/** Where an output pays, when it names a parameter rather than a keyword. */
	destination: { accepts: ["params"], describes: "a destination" },
};

/** The namespaces a prefixed reference can name, and what each canonically resolves as. */
const NAMESPACES: Record<string, { deprecated: boolean; form: ReferenceForm }> = {
	args: { deprecated: false, form: "args" },
	// The format is mid-rename from compile_params. to instance.; both are live in the corpus,
	// and one manifest generation writes each. They are the same lookup.
	compile_params: { deprecated: true, form: "instance" },
	instance: { deprecated: false, form: "instance" },
	params: { deprecated: false, form: "params" },
};

const NAME = "[A-Za-z_][A-Za-z0-9_]*";
const REFERENCE = new RegExp(`^\\$?(?<head>${NAME})(?:\\.(?<tail>${NAME}))?$`);

/**
 * Reads one reference, or reports that the text is not one.
 *
 * Deliberately not an expression parser: `params.a + 1` is an expression whose terms happen to
 * include a reference, and evaluating it belongs to the slice that owns arithmetic. This returns
 * nothing for it rather than resolving the first term and losing the rest.
 */
export function parseReference(text: string): ParsedReference | undefined {
	const match = REFERENCE.exec(text.trim());
	const head = match?.groups?.head;

	if (!head) {
		return undefined;
	}

	const tail = match.groups?.tail;

	if (tail === undefined) {
		return { form: "bare", name: head };
	}

	const namespace = NAMESPACES[head];

	if (namespace) {
		return {
			...(namespace.deprecated ? { deprecated: true } : {}),
			form: namespace.form,
			name: tail,
		};
	}

	// Anything else with one dot names an input and an attribute of it — `amount_sat`, `asset`,
	// or something the wallet derived by reading the chain at that input's outpoint.
	return { attribute: tail, form: "input-attribute", name: head };
}

/**
 * Resolves one reference at one site.
 *
 * A refusal names both the text and what was wrong with it, because the reader of that message
 * is a person deciding whether to trust a site, not the author of the manifest.
 *
 * `notes` collects the deprecated spellings encountered. It is optional because most callers
 * only want the value; a caller building something a person will read passes one so the
 * document's generation can be reported.
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
		return { ok: false, reason: `"${text}" cannot be used as ${accepted.describes}.` };
	}

	if (reference.deprecated) {
		notes?.push({ at: accepted.describes, canonical: "instance.", found: "compile_params." });
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

		// Tried as a parameter first and then as an argument, which is the order the format's own
		// reference implementation uses. An unqualified word is ambiguous by design: the format
		// offers no way to say which of the two was meant.
		case "bare": {
			if (reference.name in scope.params) {
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

		case "input-attribute": {
			return {
				ok: false,
				reason:
					`"${reference.name}.${reference.attribute ?? ""}" reads an attribute of a ` +
					"transaction input, which this runtime does not resolve yet.",
			};
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
 * reference-shaped text. The difference is not tidiness: a search finds `params.pubkey` inside a
 * description and treats it as a reference, and misses one at a position it did not think to
 * look. Positions are declared here once.
 *
 * The positions listed are the ones this slice resolves — a covenant's compile wiring at both
 * places it can be written, an output's amount, and an output's destination — together with the
 * fields of a deployment an action creates, which are read at the compile-parameter position
 * because that is what they are compiled into. A position this runtime does not yet read is
 * absent rather than guessed at, and anything reading one is refused where it is reached.
 */
export function actionReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
): ReferenceOccurrence[] {
	const found: ReferenceOccurrence[] = [];
	const where = `action ${action.name}`;

	const add = (site: ReferenceSiteKind, at: string, value: unknown): void => {
		if (typeof value === "string") {
			found.push({ at, site, text: value });
		}
	};

	const addWiring = (at: string, wiring: unknown): void => {
		for (const [name, value] of Object.entries(asRecord(wiring) ?? {})) {
			add("compileParam", `${at} / ${name}`, value);
		}
	};

	for (const declared of asArray(action.node.inputs)) {
		const input = asRecord(declared);

		addWiring(
			`${where} / input ${identifierOf(input)}`,
			asRecord(input?.utxo_source)?.compile_params,
		);
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

	// The fields of the deployment this action creates, which are values it compiles covenants
	// from — including a tapleaf's own wiring, written as an object carrying the reference.
	for (const [name, value] of Object.entries(
		asRecord(asRecord(action.node.create_instance)?.fields) ?? {},
	)) {
		const at = `${where} / new deployment / ${name}`;

		add("compileParam", at, value);

		for (const [param, spec] of Object.entries(asRecord(asRecord(value)?.params) ?? {})) {
			add(
				"compileParam",
				`${at} / ${param}`,
				typeof spec === "string" ? spec : asRecord(spec)?.value,
			);
		}
	}

	// A covenant's parameters can also be wired on the utxo type itself rather than at the site
	// that names it, so the types this action reaches are part of its reference surface.
	for (const name of namedUtxoTypes(action.node)) {
		addWiring(
			`utxo type ${name} / script`,
			asRecord(asRecord(manifest.utxoTypes[name])?.script)?.compile_params,
		);
	}

	return found;
}

/**
 * Every place the action reads the field values of a deployment it did not create.
 *
 * Two kinds of reading, and leaving out either would ask a site for the wrong thing. The first is
 * a reference that names the deployment outright — `instance.X`, or the deprecated
 * `compile_params.X` spelling of it. The second is the one the corpus actually writes most:
 * `{"ASSET_B": "ASSET_B"}`, a bare name at a compile-parameter position, which means the
 * request's own parameter where the request supplied one and the deployment's field where it did
 * not.
 *
 * **A bare name counts only where the class declares a field of that name.** The compile-parameter
 * position is also where a document writes a bare *value* — `{"WITH_BURN": "false"}`, `{"SLOT_COUNT":
 * "2"}` — and `false` is a perfectly well-formed name. Nothing about the text tells the two apart;
 * only the compiler can, and it is not asked until much later. What the document itself says is
 * enough: a name the class declares as a field is a field, and a name it declares nowhere is a
 * value. Reading it the other way asks a site for a deployment file to answer the word `false`.
 *
 * What the request already filled is subtracted for the same reason — a name it supplied is not a
 * reading of anything else. So is a field the constructor's own new deployment declares, and that
 * subtraction applies to **both** spellings rather than only to the bare one: a constructor that
 * works out a covenant hash and then wires `instance.HASH` into the covenant it creates is naming
 * the deployment it is in the middle of writing, and there is no earlier file that could hold it.
 *
 * Returned rather than reduced to a flag because a free action reaching for a deployment is a
 * document that cannot be satisfied rather than a request that is short a file: fields belong to a
 * class, and an action declared outside one has no deployment to read. Naming the positions is
 * what lets that be said rather than merely detected.
 */
export function instanceReferences(
	manifest: NormalisedManifest,
	action: NormalisedAction,
	supplied: Record<string, unknown>,
): ReferenceOccurrence[] {
	const fields = declaredFields(manifest, action);
	const created = new Set(
		Object.keys(asRecord(asRecord(action.node.create_instance)?.fields) ?? {}),
	);

	return actionReferences(manifest, action).filter((occurrence) => {
		const reference = parseReference(occurrence.text);

		// A field this very action creates is answered by the deployment it is creating, whichever
		// way the document spells the reading. A constructor works out a covenant hash and then
		// wires the covenant it creates to `instance.HASH` — naming the deployment it is in the
		// middle of writing, not one that came before it — so counting that as a read would demand
		// a file for a value nothing else could have held.
		if (reference === undefined || created.has(reference.name)) {
			return false;
		}

		if (reference.form === "instance") {
			return true;
		}

		return (
			reference.form === "bare" &&
			occurrence.site === "compileParam" &&
			reference.name in fields &&
			!(reference.name in supplied)
		);
	});
}

function identifierOf(node: Record<string, unknown> | undefined): string {
	return typeof node?.id === "string" ? node.id : "(unnamed)";
}
