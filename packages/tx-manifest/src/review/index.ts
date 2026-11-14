import { Refusal } from "../refusal";
import type { ParsedLiquidProcessCtParams } from "../request/request";
import { ActionReview } from "./actionReview";
import type { ReviewInput, ReviewManifestActionResult, ReviewRefusal } from "./types";

export type {
	AssetMovement,
	EstimateFee,
	ManifestReview,
	PlannedInput,
	ProgramFinding,
	ReadAddress,
	ReviewInput,
	ReviewManifestActionResult,
	ReviewRefusal,
	ReviewedOutput,
	ReviewedProgramInput,
	TransactionDraft,
	TypedWitness,
	Unblind,
	Unblinded,
} from "./types";

export function isRefusal(result: ReviewManifestActionResult): result is ReviewRefusal {
	return "refused" in result;
}

export async function reviewManifestAction(
	request: ParsedLiquidProcessCtParams,
	input: ReviewInput,
): Promise<ReviewManifestActionResult> {
	try {
		return await ActionReview.run(request, {
			...input,
			policyAsset: input.policyAsset.trim().toLowerCase(),
		});
	} catch (error) {
		if (error instanceof Refusal) {
			return { reason: error.reason, refused: true, reject: error.reject };
		}

		throw error;
	}
}
