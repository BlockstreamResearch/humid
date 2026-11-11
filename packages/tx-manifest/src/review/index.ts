import type { ReadChainTip, ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import type { ConfirmationModel } from "../confirmation";
import type { BlindingWord } from "../evaluation/blinding";
import type { PlannedIssuance } from "../evaluation/issuance";
import type { StaticWitness } from "../evaluation/witness";
import type { CreatedInstance } from "../programs/instance";
import type { CompileProgram, ProgramDerivation, ProgramParamTypesOf } from "../programs/program";
import type { CompileScriptPubKey } from "../programs/programHash";
import { type RejectToken, Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { ActionReview } from "./actionReview";
import type { AssetHoldings } from "./assetFunding";
import type { SelectableUtxo } from "./coinSelection";

export type ProgramFinding = ProgramDerivation & {
	role: "created" | "spent";
	verified: "matches-chain" | "not-yet-onchain";
};

export type ReviewedProgramInput = {
	argumentsJson: string;
	extraLeavesJson: string;
	id: string;
	includeDebugSymbols: boolean;
	signatureWitness?: string;
	source: string;
	txOutHex: string;
	txid: string;
	utxoType: string;
	vout: number;
	witnessValues?: StaticWitness[];
};

export type PlannedInput =
	| { program: ReviewedProgramInput; source: "program" }
	| { source: "wallet"; utxo: SelectableUtxo };

export type ReviewedOutput = {
	asset: string;
	blinded: boolean;
	decidedBy: BlindingWord;
	id: string;
	overrode?: BlindingWord;
	sats: bigint;
	scriptPubKeyHex: string;
};

export type AssetMovement = {
	asset: string;
	sats: bigint;
};

export type TransactionDraft = {
	action: string;
	inputOrder: PlannedInput[];
	issuances: PlannedIssuance[];
	locktimeHeight?: number;
	outputs: ReviewedOutput[];
	sequence?: number;
};

export type EstimateFee = (
	draft: TransactionDraft,
	feeRateSatsPerKvb: number,
) => bigint | Promise<bigint>;

export type ManifestReview = TransactionDraft & {
	boundTo?: string;
	confirmation: ConfirmationModel;
	programs: ProgramFinding[];
	programInputs: ReviewedProgramInput[];
	createdInstance?: CreatedInstance;
	estimatedFeeSats: bigint;
	feeRateSatsPerKvb: number;
	movements: AssetMovement[];
	policyAsset: string;
	protocol: string;
	selected: SelectableUtxo[];
};

export type ReviewRefusal = { reason: string; refused: true; reject: RejectToken };

export type ReviewManifestActionResult = ManifestReview | ReviewRefusal;

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

export type ReviewInput = {
	accountLabel: string;
	compile: CompileProgram;
	compilerVersion?: string;
	estimateFee: EstimateFee;
	programParamTypes?: ProgramParamTypesOf;
	fundingUtxos: SelectableUtxo[];
	holdingsOf?: AssetHoldings;
	network: string;
	policyAsset: string;
	readChainTip?: ReadChainTip;
	readFeeRate: ReadFeeRate;
	readTxOut: ReadTxOut;
	scriptPubKeyOf: CompileScriptPubKey;
	walletScriptPubKeyHex: string;
};

export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: ReviewInput,
): Promise<ReviewManifestActionResult> {
	try {
		return await ActionReview.run(request, input);
	} catch (error) {
		if (error instanceof Refusal) {
			return { reason: error.reason, refused: true, reject: error.reject };
		}

		throw error;
	}
}
