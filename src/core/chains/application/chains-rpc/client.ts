import { requestBackground } from "@/core/extension-rpc";

import { chainsRpc } from "./model/rpc";
import type {
	AddChainInput,
	ChainsState,
	RemoveChainInput,
	SetSelectedChainInput,
	UpdateChainInput,
} from "./model/types";

function getState(): Promise<ChainsState> {
	return requestBackground<ChainsState>(chainsRpc.methods.getState);
}

function setSelected(input: SetSelectedChainInput): Promise<ChainsState> {
	return requestBackground<ChainsState>(chainsRpc.methods.setSelected, input);
}

function updateChain(input: UpdateChainInput): Promise<ChainsState> {
	return requestBackground<ChainsState>(chainsRpc.methods.updateChain, input);
}

function addChain(input: AddChainInput): Promise<ChainsState> {
	return requestBackground<ChainsState>(chainsRpc.methods.addChain, input);
}

function removeChain(input: RemoveChainInput): Promise<ChainsState> {
	return requestBackground<ChainsState>(chainsRpc.methods.removeChain, input);
}

export const chainsClient = {
	getState,
	setSelected,
	updateChain,
	addChain,
	removeChain,
};
