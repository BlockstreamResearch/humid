import { sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "../chain/hex";
import type { Outpoint } from "../chain/outpoint";
import { type Action, Manifest } from "../document/manifest";
import { refuseUnsupported } from "../document/refuse";
import type { ProgramReference } from "../document/schema";
import { resolveStatedFields } from "../programs/instance";
import { deriveProgramAddress, type ProgramDerivation } from "../programs/program";
import { Refusal } from "../refusal";
import type { ActionRequest } from "../request/request";
import { missingParts } from "../request/requirements";
import type { SelectableUtxo } from "../transaction/coinSelection";
import { resolveParameters } from "../transaction/parameters";
import { Scope } from "../values/scope";
import type { ReviewDependencies, TransactionDraft } from "./types";

const FEE_TARGET_BLOCKS = 1;

export class ReviewContext {
	readonly action: Action;
	readonly dependencies: ReviewDependencies;
	readonly declaredTypes: Record<string, string>;
	readonly manifest: Manifest;
	readonly request: ActionRequest;
	readonly #pools = new Map<string, SelectableUtxo[]>();

	private constructor(
		request: ActionRequest,
		dependencies: ReviewDependencies,
		manifest: Manifest,
		action: Action,
	) {
		this.request = request;
		this.dependencies = dependencies;
		this.manifest = manifest;
		this.action = action;
		this.declaredTypes = manifest.paramTypes(action);
	}

	static prepare(
		request: ActionRequest,
		dependencies: ReviewDependencies,
	): { context: ReviewContext; scope: Scope } {
		const manifest = Manifest.parse(request.manifest);
		const unsupported = refuseUnsupported(manifest, {
			...(dependencies.compiler.version === undefined
				? {}
				: { compilerVersion: dependencies.compiler.version }),
			contractSources: request.contractSources,
		});

		if (unsupported) {
			throw unsupported;
		}

		const action = manifest.action(request.action);

		if (!action) {
			throw new Refusal(
				`The manifest declares no action named "${request.action}".`,
				"no-such-action",
			);
		}

		const fields = request.instance?.instance?.fields ?? {};
		const supplied = Object.fromEntries(
			Object.entries(request.params).filter(([name]) => name in action.params || !(name in fields)),
		);
		const params = resolveParameters(
			action,
			supplied,
			new Scope({ instance: fields, params: supplied }),
			{
				address: dependencies.wallet.address,
				key: dependencies.wallet.key,
				script_hash: encodeHex(sha256(walletScript(dependencies.wallet.scriptPubKeyHex))),
			},
		);
		const missing = missingParts({ ...request, params }, manifest, action);

		if (missing.length > 0) {
			const named = missing
				.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
				.join(" ");

			throw new Refusal(`This request cannot be built. ${named}`, "incomplete-request");
		}

		const stated = resolveStatedFields(action, new Scope({ instance: fields, params }));

		return {
			context: new ReviewContext(request, dependencies, manifest, action),
			scope: new Scope({ instance: { ...fields, ...stated }, params }),
		};
	}

	get policyAsset(): string {
		return this.dependencies.chain.policyAsset;
	}

	mayReturn(asset: string): boolean {
		const allowed = this.action.allow_change;

		return allowed === "any" || (allowed === "lbtc_only" && asset === this.policyAsset);
	}

	holdings(asset: string): SelectableUtxo[] {
		const existing = this.#pools.get(asset);

		if (existing) {
			return existing;
		}

		const pool = this.dependencies.wallet.holdingsOf(asset);

		this.#pools.set(asset, pool);

		return pool;
	}

	derive(reference: ProgramReference, scope: Scope): Promise<ProgramDerivation> {
		return deriveProgramAddress(this.manifest, {
			compile: this.dependencies.compiler.compile,
			contractSources: this.request.contractSources,
			declaredTypes: this.declaredTypes,
			includeDebugSymbols: this.manifest.includeDebugSymbols,
			network: this.dependencies.chain.network,
			programAbi: this.dependencies.compiler.abi,
			reference,
			scope,
		});
	}

	readAddress(address: string): ReturnType<ReviewDependencies["chain"]["readAddress"]> {
		try {
			return this.dependencies.chain.readAddress(address);
		} catch (error) {
			throw new Refusal(
				`${address} is not an address this wallet can pay on ${this.dependencies.chain.network}: ${String(error)}`,
			);
		}
	}

	async readTxOut(outpoint: Outpoint) {
		try {
			return await this.dependencies.chain.readTxOut(outpoint);
		} catch (error) {
			throw new Refusal(
				`Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				"chain-read-failed",
			);
		}
	}

	async chainTip(): Promise<number | undefined> {
		if (!this.dependencies.chain.readChainTip) {
			return undefined;
		}

		try {
			return await this.dependencies.chain.readChainTip();
		} catch (error) {
			throw new Refusal(
				"Could not read the chain's height, which a transaction spending a program is " +
					`locked to: ${String(error)}`,
				"chain-read-failed",
			);
		}
	}

	async feeRate(): Promise<number> {
		let rate: number;

		try {
			rate = await this.dependencies.chain.readFeeRate(FEE_TARGET_BLOCKS);
		} catch (error) {
			throw new Refusal(
				`The wallet could not establish a fee rate, so it will not build this: ${String(error)}`,
				"no-fee-rate",
			);
		}

		if (!Number.isFinite(rate) || rate < 0) {
			throw new Refusal(
				`The wallet was given ${rate} as a fee rate, which is not a rate anything ` +
					"can be charged at. It will not build a transaction it cannot price.",
				"no-fee-rate",
			);
		}

		return rate;
	}

	async estimate(draft: TransactionDraft, feeRateSatsPerKvb: number): Promise<bigint> {
		try {
			return await this.dependencies.estimateFee(draft, feeRateSatsPerKvb);
		} catch (error) {
			if (error instanceof Refusal) {
				throw error;
			}

			throw new Refusal(
				`This wallet could not price "${draft.action}": ${String(error)}`,
				"built-something-else",
			);
		}
	}
}

function walletScript(hex: string): Uint8Array {
	const script = decodeHex(hex);

	if (!script) {
		throw new TypeError(`The wallet's script ${hex} is not hex.`);
	}

	return script;
}
