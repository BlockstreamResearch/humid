export type Origin = "verified" | "computed" | "dapp";

declare const PROVENANCE: unique symbol;

export type Provenanced<T> = {
	readonly [PROVENANCE]: true;
	readonly origin: Origin;
	readonly value: T;
};

export function verified<T>(value: T): Provenanced<T> {
	return brand(value, "verified");
}

export function computed<T>(value: T): Provenanced<T> {
	return brand(value, "computed");
}

export function fromDapp<T>(value: T): Provenanced<T> {
	return brand(value, "dapp");
}

export function map<A, T>(source: Provenanced<A>, derive: (value: A) => T): Provenanced<T> {
	return brand(derive(source.value), source.origin);
}

function brand<T>(value: T, origin: Origin): Provenanced<T> {
	return { origin, value } as Provenanced<T>;
}
