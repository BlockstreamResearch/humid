import { Refusal } from "../refusal";
import type { ActionRequest } from "../request/request";
import { ActionReview } from "./actionReview";
import type { ReviewDependencies, ReviewManifestActionResult, ReviewRefusal } from "./types";

export type {
	AssetMovement,
	EstimateFee,
	ManifestReview,
	PlannedInput,
	ProgramFinding,
	ReadAddress,
	ReviewDependencies,
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
	request: ActionRequest,
	dependencies: ReviewDependencies,
): Promise<ReviewManifestActionResult> {
	const { chain } = dependencies;

	try {
		return await ActionReview.run(request, {
			...dependencies,
			chain: { ...chain, policyAsset: chain.policyAsset.trim().toLowerCase() },
		});
	} catch (error) {
		if (error instanceof Refusal) {
			return { reason: error.reason, refused: true, reject: error.reject };
		}

		throw error;
	}
}
