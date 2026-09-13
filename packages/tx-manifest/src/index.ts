/**
 * Reads the request a site sends to perform one action of a txManifest protocol.
 *
 * What is here holds no keys, opens no network connection of its own and remembers nothing
 * between calls: a wallet supplies the chain reads and the signing, and the same request twice
 * is answered the same way. That is what makes it a package rather than part of one wallet.
 *
 * This surface is what a wallet needs and nothing else. A module absent from here is private
 * even though its directory is not hidden — the way to make one public is to add it,
 * deliberately, when something outside actually needs it.
 */

// What the site sent, checked into a shape the rest can rely on. What a particular action
// then needs from that request is worked out inside the package rather than answered here:
// a caller holding the answer has nothing to do with it until there is something to build.
export type { ParsedLiquidProcessCtParams } from "./request/request";
export { parseLiquidProcessCtParams } from "./request/validation";
