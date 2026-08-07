/**
 * Reads a txManifest protocol document and resolves one of its actions into the exact
 * transaction a wallet must sign.
 *
 * What is here holds no keys, opens no network connection of its own and remembers
 * nothing between calls: a wallet supplies the chain reads and the signing, and the same
 * request twice produces the same plan. That is what makes it a package rather than part
 * of one wallet — and it is enforced rather than intended, by `stateless.test.ts`.
 *
 * This surface is what a wallet needs and nothing else. Everything a wallet does with
 * this package falls into four steps, and they are listed here in that order rather than
 * alphabetically, because the order is the point: read the request, read the chain,
 * review the action, show a person what it does. A module absent from here is private
 * even though its directory is not hidden — the way to make one public is to add it,
 * deliberately, when something outside actually needs it.
 */

// 1. What the site sent, checked into a shape the rest can rely on.
export type { ParsedLiquidProcessCtParams } from "./request/request";
export { parseLiquidProcessCtParams } from "./request/validation";

// 2. What the chain says, which only a wallet can ask for.
export {
	type ReadFeeRate,
	type ReadTxOut,
	createEsploraFeeRateReader,
	createEsploraTxOutReader,
} from "./chain/chainRead";
export { txOutAt } from "./chain/txOut";
export { estimateFeeSats } from "./fee";

// 3. The action, resolved into a reviewed plan or a refusal — and afterwards, the check
//    that what came back spends only what was asked for.
export { type ManifestReview, isRefusal, reviewManifestAction } from "./review";
export { guardSpentInputs } from "./chain/inputGuard";
export { spentInputs } from "./chain/spentInputs";

// 4. What a person is shown, and where each value on that screen came from.
export { type ShownConfirmation, describeOrigin, toShownConfirmation } from "./confirmation";
export { type Provenanced, computed, fromSite, verified } from "./confirmation/provenance";
