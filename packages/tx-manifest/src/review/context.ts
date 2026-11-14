import { sha256 } from "@noble/hashes/sha2.js";

import { decodeHex, encodeHex } from "../chain/hex";
import type { Outpoint } from "../chain/outpoint";
import { type Action, Manifest } from "../document/manifest";
import { refuseUnsupported } from "../document/refuse";
import type { ProgramReference } from "../document/schema";
import { fillParameters } from "../evaluation/parameters";
import { statedCreatedFields } from "../programs/instance";
import { deriveProgramAddress, type ProgramDerivation } from "../programs/program";
import { Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { missingParts } from "../request/requirements";
import { Scope } from "../values/scope";
import type { SelectableUtxo } from "./coinSelection";
import type { ReviewInput, TransactionDraft } from "./index";

const FEE_TARGET_BLOCKS = 1;

export class ReviewContext {
	readonly action: Action;
	readonly dependencies: ReviewInput;
	readonly declaredTypes: Record<string, string>;
	readonly manifest: Manifest;
	readonly request: ParsedLiquidProcessCtParams;
	readonly #pools = new Map<string, SelectableUtxo[]>();

	private constructor(
		request: ParsedLiquidProcessCtParams,
		dependencies: ReviewInput,
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
		request: ParsedLiquidProcessCtParams,
		dependencies: ReviewInput,
	): { context: ReviewContext; scope: Scope } {
		const manifest = Manifest.parse(request.manifest);
		const unsupported = refuseUnsupported(manifest, {
			...(dependencies.compilerVersion === undefined
				? {}
				: { compilerVersion: dependencies.compilerVersion }),
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
		const params = fillParameters(
			action,
			supplied,
			new Scope({ instance: fields, params: supplied }),
			{
				address: dependencies.walletAddress,
				key: dependencies.walletKey,
				script_hash: encodeHex(sha256(walletScript(dependencies.walletScriptPubKeyHex))),
			},
		);
		const missing = missingParts({ ...request, params }, manifest, action);

		if (missing.length > 0) {
			const named = missing
				.map((entry) => (entry.keys ? `${entry.reason} (${entry.keys.join(", ")})` : entry.reason))
				.join(" ");

			throw new Refusal(`This request cannot be built. ${named}`, "incomplete-request");
		}

		const stated = statedCreatedFields(action, new Scope({ instance: fields, params }));

		return {
			context: new ReviewContext(request, dependencies, manifest, action),
			scope: new Scope({ instance: { ...fields, ...stated }, params }),
		};
	}

	get policyAsset(): string {
		return this.dependencies.policyAsset;
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

		const pool =
			asset === this.policyAsset
				? this.dependencies.fundingUtxos
				: (this.dependencies.holdingsOf?.(asset) ?? []);

		this.#pools.set(asset, pool);

		return pool;
	}

	derive(reference: ProgramReference, scope: Scope): Promise<ProgramDerivation> {
		return deriveProgramAddress(this.manifest, {
			compile: this.dependencies.compile,
			contractSources: this.request.contractSources,
			declaredTypes: this.declaredTypes,
			includeDebugSymbols: this.manifest.includeDebugSymbols,
			network: this.dependencies.network,
			programAbi: this.dependencies.programAbi,
			reference,
			scope,
		});
	}

	readAddress(address: string): ReturnType<ReviewInput["readAddress"]> {
		try {
			return this.dependencies.readAddress(address);
		} catch (error) {
			throw new Refusal(
				`${address} is not an address this wallet can pay on ${this.dependencies.network}: ${String(error)}`,
			);
		}
	}

	async readTxOut(outpoint: Outpoint) {
		try {
			return await this.dependencies.readTxOut(outpoint);
		} catch (error) {
			throw new Refusal(
				`Could not read what is at ${outpoint.txid}:${outpoint.vout}: ${String(error)}`,
				"chain-read-failed",
			);
		}
	}

	async chainTip(): Promise<number | undefined> {
		if (!this.dependencies.readChainTip) {
			return undefined;
		}

		try {
			return await this.dependencies.readChainTip();
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
			rate = await this.dependencies.readFeeRate(FEE_TARGET_BLOCKS);
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
