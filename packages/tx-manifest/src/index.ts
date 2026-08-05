/**
 * Reads a txManifest protocol document and resolves one of its actions into the exact
 * transaction a wallet must sign.
 *
 * What is here holds no keys, opens no network connection of its own and remembers
 * nothing between calls: a wallet supplies the chain reads and the signing, and the same
 * request twice produces the same plan. That is what makes it a package rather than part
 * of one wallet — and it is enforced rather than intended, by `stateless.test.ts`.
 */

export {
	type ReadFeeRate,
	type ReadTxOut,
	type TxOutAtOutPoint,
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
} from "./chainRead";
export { type ParsedTxOut, txOutAt } from "./txOut";
export {
	type ConfirmationModel,
	type ShownConfirmation,
	confirmationModel,
	describeOrigin,
	toShownConfirmation,
} from "./confirmation";
export { estimateFeeSats, estimateVsize } from "./fee";
export { guardSpentInputs } from "./inputGuard";
export { findAction, normaliseManifest } from "./normalise";
export { type Origin, type Provenanced, computed, fromSite, verified } from "./provenance";
export { refuseUnsupported } from "./refuse";
export { ignored, inspectConstructs, loadBearing } from "./registry";
export { type ManifestReview, isRefusal, reviewManifestAction } from "./review";
export { spentInputs } from "./spentInputs";
export type { ParsedLiquidProcessCtParams, RequestPart } from "./types";
export {
	type MalformedRequest,
	type ParseRequestResult,
	parseLiquidProcessCtParams,
} from "./validation";
