export type Origin = "verified" | "chain" | "computed" | "dapp";

const STRENGTH: Origin[] = ["verified", "chain", "computed", "dapp"];

declare const PROVENANCE: unique symbol;

export type Provenanced<T> = {
	readonly [PROVENANCE]: true;
	readonly origin: Origin;
	readonly value: T;
};

export function verified<T>(value: T): Provenanced<T> {
	return brand(value, "verified");
}

export function fromChain<T>(value: T): Provenanced<T> {
	return brand(value, "chain");
}

export function computed<T>(value: T): Provenanced<T> {
	return brand(value, "computed");
}

export function fromDapp<T>(value: T): Provenanced<T> {
	return brand(value, "dapp");
}

export function combine<A, B, T>(
	left: Provenanced<A>,
	right: Provenanced<B>,
	derive: (left: A, right: B) => T,
): Provenanced<T> {
	return brand(derive(left.value, right.value), weaker(left.origin, right.origin));
}

export function map<A, T>(source: Provenanced<A>, derive: (value: A) => T): Provenanced<T> {
	return brand(derive(source.value), source.origin);
}

export function weaker(left: Origin, right: Origin): Origin {
	return STRENGTH.indexOf(left) >= STRENGTH.indexOf(right) ? left : right;
}

export function isEstablished<T>(value: Provenanced<T>): boolean {
	return value.origin !== "dapp";
}

function brand<T>(value: T, origin: Origin): Provenanced<T> {
	return { origin, value } as Provenanced<T>;
}
