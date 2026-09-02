/**
 * Reads the request a site sends to perform one action of a txManifest protocol, and
 * establishes what the wallet knows about that action before anyone approves it.
 *
 * What is here holds no keys, opens no network connection of its own and remembers nothing
 * between calls: a wallet supplies the chain reads and the compiler, and the same request
 * twice is answered the same way. That is what makes it a package rather than part of one
 * wallet.
 *
 * This surface is what a wallet needs and nothing else, listed in the order a wallet uses it
 * rather than alphabetically, because the order is the point: read the request, then review
 * the action against what the chain says. A module absent from here is private even though
 * its directory is not hidden — the way to make one public is to add it, deliberately, when
 * something outside actually needs it.
 */

// 1. What the site sent, checked into a shape the rest can rely on. What a particular action
// then needs from that request is worked out inside the package rather than answered here:
// a caller holding the answer has nothing to do with it until there is something to build.
export type { ParsedLiquidProcessCtParams } from "./request/request";
export { parseLiquidProcessCtParams } from "./request/validation";

// 2. What the chain says, which only a wallet can ask for. A port rather than an
// implementation: this package states the question and holds no endpoint of its own.
export type { ReadFeeRate, ReadTxOut } from "./chain/chainRead";

// 3. The action, resolved into an exact plan of what the wallet would do — or a refusal.
// This runs before the permission gate, where a standing permission cannot skip it, which is
// why everything it cannot establish refuses rather than warns. What comes back is the plan a
// builder is driven from rather than a description written up afterwards, so what a person is
// shown and what gets signed are worked out once.
//
// The compiler and the shapes this plan is written in are reachable through this function
// rather than named again beside it. A wallet supplying a compiler already holds its shape,
// and a second public name for one is a second thing to keep in step.
export { type ManifestReview, isRefusal, reviewManifestAction } from "./review";
// Every refusal carries one of these beside its sentence, so a caller can tell "this wallet
// will never build that" from "your state file is out of date" — the same wire code and
// opposite advice. The vocabulary is published; the table that produces it is not.
export type { RejectToken } from "./document/refuse";

// 3a. What a person is shown before they decide, and where each value on that screen came
// from. It is a reading of the plan above rather than a second establishment of anything, and
// it is reachable through the review as well — named here because the surface that renders it
// holds nothing else of this package, and because a value's origin is a type rather than a
// convention: what cannot be assigned to a `Provenanced` cannot reach that surface at all.
export { type ShownConfirmation, describeOrigin, toShownConfirmation } from "./confirmation";
// Three constructors rather than four: `fromChain` has no caller outside this package, and a
// public name for it would be a fourth thing to keep in step for nobody. `Origin` is not named
// either — what crosses is a `Provenanced` value, and a caller taking origins apart by name
// rather than reading `describeOrigin` is building a second vocabulary beside this one.
export { type Provenanced, computed, fromSite, verified } from "./confirmation/provenance";

// 4. What came back, checked against what was agreed to — before it is called a transaction.
// Both read the finished transaction's own bytes rather than asking the module that built it,
// because a module's account of itself cannot answer whether it did something it was not
// asked to. They are here rather than inside the review because only whoever holds the signing
// module has bytes to check.
export {
	type ExpectedInputs,
	type ExpectedOutput,
	type ExpectedOutputs,
	type GuardResult,
	guardBuiltOutputs,
	guardSpentInputs,
} from "./chain/guards";

// 5. What this package makes of a document, for a reader who is not a wallet.
//    The four steps above are one flow and this is not part of it: it builds nothing, signs
//    nothing and reaches nothing, and is here so that a developer can find out what a document
//    means to this runtime without connecting a wallet to ask. One function rather than the
//    readers behind it, so the answer stays a thing this package says rather than several
//    internals a caller assembles into an answer of its own.
export {
	type InspectManifestOptions,
	type InspectManifestResult,
	type ManifestFault,
	type ManifestInspection,
	DOCUMENT_ONLY_REFUSALS,
	inspectManifestDocument,
} from "./document/inspect";
export type { PartialCheck } from "./document/refuse";
export type { NormalisationNote } from "./document/normalise";
// The construct table itself, which no document can show: a construct nobody has published is
// invisible in every document there is, so what this runtime does not implement is only
// answerable from the table. Read-only, and the same table every refusal above is decided by.
export {
	type ConstructRegistryEntry,
	type ConstructReport,
	type ConstructSiteKind,
	type ConstructState,
	describeRegistry,
} from "./document/registry";
