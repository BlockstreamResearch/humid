import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import browser from "webextension-polyfill";

import {
	createSessionPendingTransfersStore,
	type PendingTransfer,
	pendingTransfersStorageKey,
} from "./pendingTransfersStore";

/** A single session-backed store instance shared by every mount (it holds no per-caller state). */
const store = createSessionPendingTransfersStore();

/** Stable empty list so `entries` keeps a constant reference before the first read resolves. */
const EMPTY: PendingTransfer[] = [];

/** React Query key for one (account, chain)'s optimistic pending list. */
export function pendingTransfersQueryKey(accountGroupId: string, chainId: string) {
	return ["pending-transfers", accountGroupId, chainId] as const;
}

/** The optimistic pending-transfer axis: the current entries plus fire-and-forget add/remove. */
export type PendingTransfers = {
	add: (entry: PendingTransfer) => void;
	entries: PendingTransfer[];
	remove: (txid: string) => void;
};

/**
 * The optimistic pending-transfer axis for one (account, chain): a React Query read over
 * `chrome.storage.session`, kept live by a `storage.onChanged` listener so a broadcast recorded on the
 * Send screen — or a reconcile GC fired from the activity list — reflects everywhere the hook is
 * mounted. Because it's persisted, a just-sent "Pending" row also survives closing and reopening the
 * popup before the first post-send scan. `add` records a freshly broadcast tx (and nudges that asset's
 * activity feed so the row merges in at once); `remove` drops one once a scan has caught it.
 */
export function usePendingTransfers(accountGroupId: string, chainId: string): PendingTransfers {
	const queryClient = useQueryClient();
	const storageKey = pendingTransfersStorageKey(accountGroupId, chainId);

	const query = useQuery({
		queryFn: () => store.load(storageKey),
		queryKey: pendingTransfersQueryKey(accountGroupId, chainId),
	});

	// Session storage is the source of truth, so re-read whenever this account+chain's entry changes.
	// The write may originate on another screen (Send records a broadcast) or on this one (the
	// activity list GCs a reconciled tx), so a change listener is the one mechanism that covers both.
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
			// The new optimistic row belongs to this asset's feed — mark it stale so the merge runs.
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
