import { asArray, asRecord } from "../document/json";
import { parseReference } from "../document/references";
import type { EncodedBytes } from "./encode";

/**
 * An output's object-form `data`: the bytes an action publishes about itself.
 *
 * A protocol writes this so that its own reader can find the action again afterwards. That is
 * the whole of what the position is for, and it is why the failure here is worse than an
 * error. Bytes in the wrong order still make a well-formed output, in a transaction that
 * confirms and pays what it said it would; what is lost is only that the record cannot be
 * matched. The action happened, the money moved, and nothing can find it.
 *
 * So the vocabulary is closed and stays closed. A type or a modifier nobody has measured is
 * refused by name rather than encoded on a resemblance to one that has been.
 *
 * **The integers are little-endian, and that was measured rather than reasoned.** A deployed
 * reader of these bytes decodes every integer width in this table with the platform's
 * little-endian conversion and writes them back the same way; the published document agrees,
 * declaring `endian: "le"` on one of them and leaving the rest to the default. Reading the
 * document alone could not have settled it: a layout written by hand reads big-endian on the
 * page, and the runtime previously encoded one of these widths that way on exactly that
 * reasoning.
 *
 * **An asset id is turned round.** The same reader writes an id straight out of its internal
 * thirty-two-byte array, and that array is the reverse of the form an id is written in
 * everywhere a person or a document states one — the reversal is in the hashing library, which
 * displays this hash backwards, and this wallet's own chain reader performs the same turn in
 * the other direction when it reads an output's asset. So the id a request supplies is
 * reversed here, at the one place a stated id becomes published bytes.
 *
 * **What is deliberately absent.** The sibling vocabulary on a covenant's `extra_leaves` also
 * has `bytes32`, `pubkey`, `pad_to` and `align`. No document writes any of them at this
 * position and no reader has been observed consuming them here, so they are refused by name.
 * Sharing a spelling with the other vocabulary is not evidence of sharing a meaning, and the
 * two are implemented apart for that reason.
 */

/** How a declared part type turns its value into bytes. */
type PartEncoding = "bytes" | "integer" | "reversedBytes";

type PartType = {
	/** The exact width a value of this type occupies, for the types that fix one. */
	bytes?: number;
	encoding: PartEncoding;
	/** What a value of this type should look like, for a refusal that can be acted on. */
	shape: string;
};

/**
 * The part types this vocabulary encodes.
 *
 * Every type the published documents declare at this position is here, and nothing else is.
 * An integer's range is derived from its width rather than written beside it, because at this
 * position the two are one fact and two copies of one fact eventually disagree.
 */
const PART_TYPES: Record<string, PartType> = {
	/**
	 * A run of bytes of whatever length the value carries.
	 *
	 * No width is declared and none is checked: the documents use this for a short fixed tag
	 * that prefixes the record, and the reader takes its length from its own layout rather than
	 * from anything the part says.
	 */
	bytes: { encoding: "bytes", shape: "bytes, as an even number of hexadecimal characters" },
	/**
	 * An asset id, written in reverse of how it is stated.
	 *
	 * This is the entry where passing the value through would produce a perfectly valid output
	 * carrying an id no reader will match, and nothing downstream would notice.
	 */
	"liquid.asset_id": {
		bytes: 32,
		encoding: "reversedBytes",
		shape: "an asset id: 32 bytes as 64 hexadecimal characters",
	},
	u8: { bytes: 1, encoding: "integer", shape: "a whole number that fits in 1 byte" },
	u16: { bytes: 2, encoding: "integer", shape: "a whole number that fits in 2 bytes" },
	u32: { bytes: 4, encoding: "integer", shape: "a whole number that fits in 4 bytes" },
	u64: { bytes: 8, encoding: "integer", shape: "a whole number that fits in 8 bytes" },
};

/**
 * The two byte orders this vocabulary can state, and what each one does.
 *
 * `le` is what the documents write and what the deployed reader consumes, and it is the default
 * when the key is absent. `be` is the reverse, which is the meaning the same word carries in
 * the format's other byte vocabulary; no document writes it at this position, so it is carried
 * across rather than measured. Any other spelling is refused rather than treated as one of
 * these two: a value quietly read as the default is a different number in the record.
 */
const BYTE_ORDERS: Record<string, "be" | "le"> = { be: "be", le: "le" };

/** Keys the sibling vocabulary has and this one has no measured meaning for. */
const UNSUPPORTED_MODIFIERS = ["align", "pad_to"];

/**
 * How a part's value is resolved when it names something rather than being something.
 *
 * The caller supplies this because what a name may refer to is decided by the position the
 * name sits at, and this encoder does not know its own position.
 */
export type PartResolver = (
	reference: string,
) => { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * Encodes an output's object-form `data`.
 *
 * `{parts: [{type, value}, …]}`, concatenated in the order they are written. Every refusal
 * names the part it is about, because a person holding a request needs to know which of the
 * values the wallet could not write, and its position in the layout is the only name a part
 * has — the format gives them no ids.
 */
export function encodeMetadataParts(
	data: unknown,
	resolve: PartResolver = (reference) => ({ ok: true, value: reference }),
): EncodedBytes {
	const declared = asRecord(data)?.parts;

	if (!Array.isArray(declared)) {
		return { ok: false, reason: "Object-form data carries no parts list." };
	}

	let hex = "";
	let position = 0;

	for (const entry of asArray(declared)) {
		position += 1;

		const part = asRecord(entry);

		if (!part) {
			return { ok: false, reason: `Data part ${position} is not a typed value.` };
		}

		const encoded = encodePart(part, position, resolve);

		if (!encoded.ok) {
			return encoded;
		}

		hex += encoded.hex;
	}

	return { hex, ok: true };
}

function encodePart(
	part: Record<string, unknown>,
	position: number,
	resolve: PartResolver,
): EncodedBytes {
	for (const key of UNSUPPORTED_MODIFIERS) {
		if (key in part) {
			return {
				ok: false,
				reason: `Data part ${position} carries ${key}, which this vocabulary does not have.`,
			};
		}
	}

	const type = part.type;
	const declared = typeof type === "string" ? PART_TYPES[type] : undefined;

	if (!declared) {
		return {
			ok: false,
			reason: `Data part ${position} is declared ${String(type)}, which object-form data does not have.`,
		};
	}

	if (!("value" in part)) {
		return { ok: false, reason: `Data part ${position}, declared ${type}, carries no value.` };
	}

	const order = byteOrder(part, position, declared);

	if (!order.ok) {
		return order;
	}

	const named = referencedName(part.value);
	const resolved = named === undefined ? { ok: true as const, value: part.value } : resolve(named);

	if (!resolved.ok) {
		return {
			ok: false,
			reason: `Data part ${position} is wired to "${named}", which did not resolve: ${resolved.reason}`,
		};
	}

	const wrong = (found: string): EncodedBytes => ({
		ok: false,
		reason: `Data part ${position} is declared ${String(type)}, which is ${declared.shape}. Got ${found}.`,
	});

	return declared.encoding === "integer"
		? encodeInteger(declared, resolved.value, order.order, wrong)
		: encodeBytes(declared, resolved.value, wrong);
}

/**
 * Which way round a part's integer is written.
 *
 * The key is read only where it has a measured meaning. On a run of bytes there is no number
 * whose order it could be describing, and on an asset id the turn is already part of what the
 * type means — a second one stated beside it would be two instructions about the same bytes,
 * and no document says which wins.
 */
function byteOrder(
	part: Record<string, unknown>,
	position: number,
	declared: PartType,
): { ok: false; reason: string } | { ok: true; order: "be" | "le" } {
	if (!("endian" in part)) {
		return { ok: true, order: "le" };
	}

	if (declared.encoding !== "integer") {
		return {
			ok: false,
			reason: `Data part ${position} carries endian, which this vocabulary states only about an integer.`,
		};
	}

	const order = typeof part.endian === "string" ? BYTE_ORDERS[part.endian] : undefined;

	return order === undefined
		? {
				ok: false,
				reason: `Data part ${position} declares endian ${String(part.endian)}, and this vocabulary's byte orders are le and be.`,
			}
		: { ok: true, order };
}

/** Little-endian unless the part said otherwise; a value too wide is refused, never truncated. */
function encodeInteger(
	declared: PartType,
	value: unknown,
	order: "be" | "le",
	wrong: (found: string) => EncodedBytes,
): EncodedBytes {
	const width = declared.bytes ?? 0;
	const count = asCount(value);

	if (count === undefined || count < 0n) {
		return wrong(quoted(value));
	}

	if (count > 2n ** BigInt(width * 8) - 1n) {
		return wrong(`${count}`);
	}

	const big = count.toString(16).padStart(width * 2, "0");

	return { hex: order === "be" ? big : reverseBytes(big), ok: true };
}

/** Hex as it is, or turned round for the types stated in one order and published in the other. */
function encodeBytes(
	declared: PartType,
	value: unknown,
	wrong: (found: string) => EncodedBytes,
): EncodedBytes {
	if (typeof value !== "string") {
		return wrong(quoted(value));
	}

	const digits = withoutHexPrefix(value.trim());

	if (digits.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(digits)) {
		return wrong(quoted(value));
	}

	if (declared.bytes !== undefined && digits.length !== declared.bytes * 2) {
		return wrong(`${digits.length} hexadecimal characters`);
	}

	const lower = digits.toLowerCase();

	return { hex: declared.encoding === "reversedBytes" ? reverseBytes(lower) : lower, ok: true };
}

/**
 * Whether a part's value names something or is something.
 *
 * The rule is the format's own reference grammar and nothing else. `parseReference` accepts a
 * name — optionally namespaced with a dot — whose first character is a letter or an underscore;
 * everything it rejects is a literal. It is the same parser every other reference position in
 * this runtime asks, so a reference means one thing across the format rather than one thing per
 * site, and it is a decision about the grammar rather than about how the text looks.
 *
 * The two mistakes it can make are not the same size, and this is which way round it errs.
 *
 * It never reads a reference as bytes. Anything the grammar accepts is looked up, and a name
 * the request does not carry refuses by name — it can never become a payload that looks like
 * one and is not.
 *
 * It can read a literal as a reference, and the format leaves no way to tell them apart: a
 * four-byte tag written `a9b4ade7` is a perfect reference to a parameter of that name, and one
 * written `6275726e` is not a reference at all, because it opens with a digit. So a bare
 * literal opening with a letter is looked up, does not resolve, and is refused naming the text
 * — which a person can act on, and which `0x` in front of it settles for good. That direction
 * costs a refusal; the other one costs bytes nobody checks.
 */
function referencedName(value: unknown): string | undefined {
	return typeof value === "string" && parseReference(value) !== undefined ? value : undefined;
}

function withoutHexPrefix(value: string): string {
	return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

function reverseBytes(hex: string): string {
	return (hex.match(/../g) ?? []).toReversed().join("");
}

function quoted(value: unknown): string {
	const text = typeof value === "string" ? value : String(value);

	return `"${text.length > 24 ? `${text.slice(0, 24)}…` : text}"`;
}

function asCount(value: unknown): bigint | undefined {
	if (typeof value === "bigint") {
		return value;
	}

	if (typeof value === "number") {
		return Number.isSafeInteger(value) ? BigInt(value) : undefined;
	}

	return typeof value === "string" && /^-?\d+$/.test(value.trim())
		? BigInt(value.trim())
		: undefined;
}
