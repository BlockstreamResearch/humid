import type { ChainId, ChainRecord } from "../../ChainRecord";

export type ChainsState = {
	chains: ChainRecord[];
	selectedChainId: ChainId;
};

export type SetSelectedChainInput = {
	chainId: ChainId;
};

export type UpdateChainInput = {
	chain: ChainRecord;
};

export type AddChainInput = {
	chain: ChainRecord;
};

export type RemoveChainInput = {
	chainId: ChainId;
};
