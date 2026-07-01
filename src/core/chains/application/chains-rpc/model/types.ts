import type { ChainId, ChainRecord } from "../../ChainRecord";

/** The popup's view of the chain axis: the available chains and the selected one. */
export type ChainsState = {
	chains: ChainRecord[];
	selectedChainId: ChainId;
};

export type SetSelectedChainInput = {
	chainId: ChainId;
};

/** Persist an updated chain record (e.g. its settings). */
export type UpdateChainInput = {
	chain: ChainRecord;
};
