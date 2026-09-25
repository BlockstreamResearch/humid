import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import browser from "webextension-polyfill";

import {
	createSessionPendingTransfersStore,
	type PendingTransfer,
	pendingTransfersStorageKey,
} from "./pendingTransfersStore";

const store = createSessionPendingTransfersStore();

const EMPTY: PendingTransfer[] = [];

export function pendingTransfersQueryKey(accountGroupId: string, chainId: string) {
	return ["pending-transfers", accountGroupId, chainId] as const;
}

export type PendingTransfers = {
	add: (entry: PendingTransfer) => void;
	entries: PendingTransfer[];
	remove: (txid: string) => void;
};

export function usePendingTransfers(accountGroupId: string, chainId: string): PendingTransfers {
	const queryClient = useQueryClient();
	const storageKey = pendingTransfersStorageKey(accountGroupId, chainId);

	const query = useQuery({
		queryFn: () => store.load(storageKey),
		queryKey: pendingTransfersQueryKey(accountGroupId, chainId),
	});

	useEffect(() => {
		const listener = (changes: Record<string, unknown>, areaName: string) => {
			if (areaName !== "session" || !(storageKey in changes)) return;

			void queryClient.invalidateQueries({
				queryKey: pendingTransfersQueryKey(accountGroupId, chainId),
			});
		};

		browser.storage.onChanged.addListener(listener);

		return () => browser.storage.onChanged.removeListener(listener);
	}, [accountGroupId, chainId, queryClient, storageKey]);

	const add = useMutation({
		mutationFn: (entry: PendingTransfer) => store.add(storageKey, entry),
		onSuccess: (_, entry) => {
			void queryClient.invalidateQueries({
				queryKey: ["activity", accountGroupId, chainId, entry.rawAssetId],
			});
		},
	});

	const remove = useMutation({
		mutationFn: (txid: string) => store.remove(storageKey, txid),
	});

	return {
		add: add.mutate,
		entries: query.data ?? EMPTY,
		remove: remove.mutate,
	};
}
