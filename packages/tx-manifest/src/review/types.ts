import type { ReadChainTip, ReadFeeRate, ReadTxOut } from "../chain/chainRead";
import type { ConfirmationModel } from "../confirmation";
import type { CreatedInstance } from "../programs/instance";
import type { CompileProgram, ProgramAbiOf, ProgramDerivation } from "../programs/program";
import type { ScriptHashOf } from "../programs/programHash";
import type { RejectToken } from "../refusal";
import type { AssetHoldings } from "../transaction/assetFunding";
import type { BlindingWord } from "../transaction/blinding";
import type { BlindingFactors } from "../transaction/blindingFactors";
import type { SelectableUtxo } from "../transaction/coinSelection";
import type { PlannedIssuance } from "../transaction/issuance";
import type { StaticWitness } from "../transaction/witness";

export type ProgramFinding = ProgramDerivation & {
	/** The input that spends the program, or the output that creates one. */
	id: string;
	role: "created" | "spent";
	verified: "matches-chain" | "not-yet-onchain";
};

export type ReviewedProgramInput = {
	argumentsJson: string;
	asset: string;
	blindingSecretsJson?: string;
	extraLeavesJson: string;
	id: string;
	includeDebugSymbols: boolean;
	sats: bigint;
	signatureWitness?: string;
	source: string;
	txOutHex: string;
	txid: string;
	unusedWitnesses?: string[];
	utxoType: string;
	vout: number;
	witnessValues?: TypedWitness[];
};

export type TypedWitness = StaticWitness & { type: string };

export type PlannedInput =
	| { program: ReviewedProgramInput; sequence?: number; source: "program" }
	| { asset: string; sequence?: number; source: "wallet"; utxo: SelectableUtxo };

export type ReviewedOutput = BlindingFactors & {
	address?: string;
	asset: string;
	pays: "address" | "change" | "data" | "program" | "taproot" | "wallet";
	blinded: boolean;
	blindingPublicKeyHex?: string;
	decidedBy: BlindingWord;
	id: string;
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
};

export type Unblinded = {
	asset: string;
	assetBlindingFactor: string;
	sats: bigint;
	valueBlindingFactor: string;
};

export type Unblind = (
	transactionHex: string,
	vout: number,
) => Unblinded | undefined | Promise<Unblinded | undefined>;

export type ReadAddress = (address: string) => {
	blindingPublicKeyHex?: string;
	scriptPubKeyHex: string;
};

export type EstimateFee = (
	draft: TransactionDraft,
	feeRateSatsPerKvb: number,
) => bigint | Promise<bigint>;

export type ManifestReview = TransactionDraft & {
	template?: string;
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

export type ReviewDependencies = {
	accountLabel: string;
	chain: {
		network: string;
		policyAsset: string;
		readAddress: ReadAddress;
		readChainTip?: ReadChainTip;
		readFeeRate: ReadFeeRate;
		readTxOut: ReadTxOut;
	};
	compiler: {
		abi: ProgramAbiOf;
		compile: CompileProgram;
		scriptHashOf: ScriptHashOf;
		version?: string;
	};
	estimateFee: EstimateFee;
	wallet: {
		address: string;
		holdingsOf: AssetHoldings;
		key: string;
		scriptPubKeyHex: string;
		unblind?: Unblind;
	};
};
