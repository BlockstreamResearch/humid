/**
 * Where a value came from, ordered by how much the requesting site could have influenced it.
 *
 * The order is the point. A person deciding whether to approve an action is really deciding
 * how much of what they are shown is the site's word, and that question has an answer per
 * value rather than per screen.
 */
export type Origin =
	/** The wallet derived it and matched it against what the chain reports. Two sources agreed. */
	| "verified"
	/** Read from the network. The site cannot influence what sits at an outpoint. */
	| "chain"
	/** The wallet worked it out, from inputs that may have come from the site. */
	| "computed"
	/** Asserted by the site and checked by nobody. */
	| "site";

/** Weakest last. Combining values takes the weakest, so this is the order that decides. */
const STRENGTH: Origin[] = ["verified", "chain", "computed", "site"];

declare const PROVENANCE: unique symbol;

/**
 * A value that knows where it came from, and cannot be separated from it by accident.
 *
 * The brand is what makes the rule a type rather than a habit: a plain string cannot be
 * passed where a provenanced one is wanted, so a surface that renders only provenanced
 * values cannot render an unprovenanced one — not "does not", cannot. That is the whole
 * mechanism. Everything else here is bookkeeping around it.
 */
export type Provenanced<T> = {
	readonly [PROVENANCE]: true;
	readonly origin: Origin;
	readonly value: T;
};

/** The wallet derived this and matched it against the chain. */
export function verified<T>(value: T): Provenanced<T> {
	return brand(value, "verified");
}

/** Read from the network. */
export function fromChain<T>(value: T): Provenanced<T> {
	return brand(value, "chain");
}

/** The wallet worked this out. */
export function computed<T>(value: T): Provenanced<T> {
	return brand(value, "computed");
}

/** The site said so. */
export function fromSite<T>(value: T): Provenanced<T> {
	return brand(value, "site");
}

/**
 * Derives a value from two others, at the weaker of their origins.
 *
 * A number computed from something the site asserted is something the site asserted, however
 * much arithmetic happened in between. Taking the weakest is what stops provenance being
 * laundered by a calculation.
 */
export function combine<A, B, T>(
	left: Provenanced<A>,
	right: Provenanced<B>,
	derive: (left: A, right: B) => T,
): Provenanced<T> {
	return brand(derive(left.value, right.value), weaker(left.origin, right.origin));
}

/**
 * Derives a value from one other, keeping its origin.
 *
 * Formatting, rounding and renaming do not make a value more trustworthy than what it was
 * derived from, so nothing here can raise an origin — the only way to a stronger one is to
 * establish the value again from a stronger source.
 */
export function map<A, T>(source: Provenanced<A>, derive: (value: A) => T): Provenanced<T> {
	return brand(derive(source.value), source.origin);
}

/** The weaker of two origins. */
export function weaker(left: Origin, right: Origin): Origin {
	return STRENGTH.indexOf(left) >= STRENGTH.indexOf(right) ? left : right;
}

/** Whether this value is the wallet's own finding rather than the site's word. */
export function isEstablished<T>(value: Provenanced<T>): boolean {
	return value.origin !== "site";
}

function brand<T>(value: T, origin: Origin): Provenanced<T> {
	return { origin, value } as Provenanced<T>;
}
