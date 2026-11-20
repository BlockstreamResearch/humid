export const P2PK_SOURCE =
	"fn main() {\n    let sig: Signature = witness::SIGNATURE;\n    jet::bip_0340_verify((param::PUB_KEY, jet::sig_all_hash()), sig);\n}";
