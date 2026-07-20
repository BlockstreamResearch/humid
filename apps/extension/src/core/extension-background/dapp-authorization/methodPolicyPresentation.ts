import { LIQUID_WALLET_RPC_METHODS } from "@/core/chains/liquid/domain/LiquidRpc";

/** A dapp RPC method as the permission UIs present it: its id, human copy, and whether it's opt-in. */
export type WalletMethodPresentation = {
	description: string;
	id: string;
	label: string;
	/**
	 * True for a read a user may let a dapp run without a per-call confirmation; false for an act
	 * (signing, sending) that always confirms. The read/write line lives only here, in the UI — the
	 * engine treats every method the same. Drives which methods the connect modal offers as checkboxes
	 * and which the settings page locks to "Always asks".
	 */
	preApprovable: boolean;
};

/**
 * Every dapp RPC method with its presentation, in render order (reads first). Hand-written on purpose:
 * it draws the line between a read a user may let a dapp poll and an act they should weigh each time.
 * Shared by the connect modal and the connected-dapp settings page so both label a method the same.
 */
export const WALLET_METHOD_PRESENTATION: WalletMethodPresentation[] = [
	{
		description: "See this account's asset balances.",
		id: LIQUID_WALLET_RPC_METHODS.GET_BALANCE,
		label: "View balance",
		preApprovable: true,
	},
	{
		description: "See this account's individual coins (unspent outputs).",
		id: LIQUID_WALLET_RPC_METHODS.GET_UTXOS,
		label: "View coins",
		preApprovable: true,
	},
	{
		description: "See this account's public addresses (its wallet descriptor).",
		id: LIQUID_WALLET_RPC_METHODS.GET_WALLET_DESCRIPTOR,
		label: "View addresses",
		preApprovable: true,
	},
	{
		description: "See a public key derived from your identity.",
		id: LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_PUBLIC_KEY,
		label: "View identity key",
		preApprovable: true,
	},
	{
		description: "Sign Liquid transactions (PSETs) for this account.",
		id: LIQUID_WALLET_RPC_METHODS.SIGN_PSET,
		label: "Sign transactions",
		preApprovable: false,
	},
	{
		description: "Send assets from this account.",
		id: LIQUID_WALLET_RPC_METHODS.SEND_TRANSFER,
		label: "Send funds",
		preApprovable: false,
	},
	{
		description: "Sign arbitrary messages with this account.",
		id: LIQUID_WALLET_RPC_METHODS.SIGN_MESSAGE,
		label: "Sign messages",
		preApprovable: false,
	},
	{
		description: "Sign identity challenges to prove who you are.",
		id: LIQUID_WALLET_RPC_METHODS.SIGN_IDENTITY,
		label: "Prove identity",
		preApprovable: false,
	},
	{
		description: "Derive a shared secret between your identity and another party.",
		id: LIQUID_WALLET_RPC_METHODS.GET_IDENTITY_SHARED_KEY,
		label: "Derive shared secret",
		preApprovable: false,
	},
	{
		description: "Process confidential transactions via the Liquid wallet ABI.",
		id: LIQUID_WALLET_RPC_METHODS.PROCESS_CONFIDENTIAL_TRANSACTION,
		label: "Advanced transactions",
		preApprovable: false,
	},
];

/**
 * The subset a user may pre-approve at connect time (the reads), in render order. Every other method
 * a session carries is absent here — with nothing to opt into it can never run without a prompt, so
 * it confirms on every call. Absence is the design, not an oversight.
 */
export const PRE_APPROVABLE_METHODS: WalletMethodPresentation[] = WALLET_METHOD_PRESENTATION.filter(
	(method) => method.preApprovable,
);
