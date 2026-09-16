import { LIQUID_WALLET_RPC_METHODS } from "@/core/chains/liquid/domain/LiquidRpc";

export type WalletMethodPresentation = {
	description: string;
	id: string;
	label: string;
	preApprovable: boolean;
};

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

export const PRE_APPROVABLE_METHODS: WalletMethodPresentation[] = WALLET_METHOD_PRESENTATION.filter(
	(method) => method.preApprovable,
);
