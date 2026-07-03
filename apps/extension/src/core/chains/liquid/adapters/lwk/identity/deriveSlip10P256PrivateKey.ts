import { p256 } from "@noble/curves/nist.js";
import { bytesToNumberBE, numberToBytesBE } from "@noble/curves/utils.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

type Slip10PrivateNode = {
	chainCode: Uint8Array;
	privateKey: Uint8Array;
};

const HARDENED_OFFSET = 0x80000000;
const P256_ORDER = p256.Point.CURVE().n;
const P256_SEED_KEY = utf8ToBytes("Nist256p1 seed");

export function deriveSlip10P256PrivateKey(seed: Uint8Array, path: number[]): Uint8Array {
	let node = deriveMasterNode(seed);

	for (const childIndex of path) {
		node = deriveHardenedChildNode(node, childIndex);
	}

	return node.privateKey;
}

function deriveMasterNode(seed: Uint8Array): Slip10PrivateNode {
	let seedMaterial = seed;

	while (true) {
		const digest = hmac(sha512, P256_SEED_KEY, seedMaterial);
		const node = createNodeFromDigest(digest);

		if (p256.utils.isValidSecretKey(node.privateKey)) {
			return node;
		}

		seedMaterial = digest;
	}
}

function deriveHardenedChildNode(
	parentNode: Slip10PrivateNode,
	childIndex: number,
): Slip10PrivateNode {
	if (childIndex < HARDENED_OFFSET) {
		throw new Error("SLIP-0010 identity derivation only accepts hardened child indices.");
	}

	let digest = hmac(
		sha512,
		parentNode.chainCode,
		concatBytes(Uint8Array.of(0), parentNode.privateKey, serializeUint32BigEndian(childIndex)),
	);

	while (true) {
		const candidate = createChildNodeCandidate(parentNode, digest);

		if (candidate) {
			return candidate;
		}

		digest = hmac(
			sha512,
			parentNode.chainCode,
			concatBytes(Uint8Array.of(1), digest.slice(32), serializeUint32BigEndian(childIndex)),
		);
	}
}

function createChildNodeCandidate(
	parentNode: Slip10PrivateNode,
	digest: Uint8Array,
): Slip10PrivateNode | null {
	const left = digest.slice(0, 32);
	const leftScalar = bytesToNumberBE(left);

	if (leftScalar >= P256_ORDER) {
		return null;
	}

	const parentScalar = bytesToNumberBE(parentNode.privateKey);
	const childScalar = (leftScalar + parentScalar) % P256_ORDER;

	if (childScalar === 0n) {
		return null;
	}

	return {
		chainCode: digest.slice(32),
		privateKey: numberToBytesBE(childScalar, 32),
	};
}

function createNodeFromDigest(digest: Uint8Array): Slip10PrivateNode {
	return {
		chainCode: digest.slice(32),
		privateKey: digest.slice(0, 32),
	};
}

function serializeUint32BigEndian(value: number): Uint8Array {
	const bytes = new Uint8Array(4);
	const view = new DataView(bytes.buffer);

	view.setUint32(0, value, false);

	return bytes;
}
