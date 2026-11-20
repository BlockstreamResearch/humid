import type { CreateInternalRpcHandlersInput } from "@/core/extension-background/internal-rpc";
import { createPortfolioSyncEngine } from "@/core/extension-background/portfolio-sync/createPortfolioSyncEngine";
import { createSessionPortfolioSnapshotStore } from "@/core/extension-background/portfolio-sync/portfolioSnapshotStore";
import { createSessionScanTargetStore } from "@/core/extension-background/portfolio-sync/scanTargetStore";

import type { LiquidChainGroup, LiquidScanTarget } from "../contract";
import type { LiquidAccounts } from "./liquidAccounts";

const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 60_000;

const portfolioKey = (accountGroupId: string, chainId: string) => `${accountGroupId}::${chainId}`;

export type LiquidPortfolio = ReturnType<typeof createLiquidPortfolio>;

export function createLiquidPortfolio(chainGroup: LiquidChainGroup, accounts: LiquidAccounts) {
	const { accountRuntime } = chainGroup;
	const snapshotStore = createSessionPortfolioSnapshotStore();
	const scanTargetStore = createSessionScanTargetStore<LiquidScanTarget>();
	const sync = createPortfolioSyncEngine(async () => {
		const { accountGroupId, chainId, input } = await accounts.selected();
		const key = portfolioKey(accountGroupId, chainId);

		return {
			key,
			scan: async () => {
				const target = await accountRuntime.resolveScanTarget(input);
				void scanTargetStore.save(key, target);

				return accountRuntime.scanPortfolio(target);
			},
		};
	}, snapshotStore);
	let backgroundRefreshing = false;

	const handlers: Pick<
		CreateInternalRpcHandlersInput,
		"getPortfolio" | "purgeAccountPortfolio" | "refreshPortfolio"
	> = {
		getPortfolio: () => sync.getSnapshot(),
		async purgeAccountPortfolio(accountGroupId) {
			await snapshotStore.removeForAccountGroup(accountGroupId);
			await scanTargetStore.clear();
		},
		refreshPortfolio: () => sync.refresh(),
	};

	return {
		...handlers,

		readSnapshot: (accountGroupId: string, chainId: string) =>
			snapshotStore.load(portfolioKey(accountGroupId, chainId)),

		async refreshInBackground(): Promise<void> {
			if (backgroundRefreshing) return;

			const active = await scanTargetStore.load();

			if (!active || sync.isSyncing(active.key)) return;

			const persisted = await snapshotStore.load(active.key);

			if (persisted && Date.now() - persisted.syncedAt < BACKGROUND_REFRESH_MIN_INTERVAL_MS) return;

			backgroundRefreshing = true;

			try {
				const portfolio = await accountRuntime.scanPortfolio(active.target);

				await snapshotStore.save(active.key, { data: portfolio, syncedAt: Date.now() });
			} finally {
				backgroundRefreshing = false;
			}
		},
	};
}
