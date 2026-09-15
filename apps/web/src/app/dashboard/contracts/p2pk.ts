/**
 * The pay-to-public-key contract, from `simplicityhl-0.6.0/examples/p2pk.simf`.
 *
 * Two identifiers differ from upstream: the published manifest names its compile parameter
 * `PUB_KEY` and its witness `SIGNATURE`, where upstream says `ALICE_PUBLIC_KEY` and
 * `ALICE_SIGNATURE`. Nothing else about it is ours.
 *
 * It lives beside the page rather than beside the manifest because contract sources are not
 * published with a manifest — in production they arrive with the request, which is exactly
 * what this card demonstrates.
 */
export const P2PK_SOURCE =
	"fn main() { jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), witness::SIGNATURE) }";
