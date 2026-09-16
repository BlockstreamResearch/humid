import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ReactNode, useCallback, useState } from "react";

import type { PortfolioViewActivityFeed } from "@/core/chains/application/PortfolioView";
import { QuickActions } from "@/routes/App/pages/Home/components/QuickActions";
import { UiScrollArea } from "@/ui/UiScrollArea";

import { LiquidAssetView } from "./LiquidAssetView";
import {
	confirmedReceived,
	confirmedSent,
	feed,
	issuedVerifiedToken,
	makeLongItems,
	mockLiquidChain,
	nativeToken,
	pendingSent,
} from "./liquidStoryFixtures";

function AssetViewFrame({ children }: { children: ReactNode }) {
	return (
		<div className="flex size-full min-h-0 flex-col">
			<UiScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col gap-6 px-5 py-4">{children}</div>
			</UiScrollArea>
		</div>
	);
}

const meta = {
	title: "Chains/Liquid/LiquidAssetView",
	component: LiquidAssetView,
	render: (args) => (
		<AssetViewFrame>
			<LiquidAssetView {...args} />
		</AssetViewFrame>
	),
	args: {
		actions: <QuickActions assetId={nativeToken.id} />,
		activity: feed([confirmedSent, confirmedReceived]),
		chain: mockLiquidChain,
		token: nativeToken,
	},
} satisfies Meta<typeof LiquidAssetView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Native: Story = {
	args: {
		activity: feed([confirmedSent, confirmedReceived]),
		token: nativeToken,
	},
};

export const IssuedAsset: Story = {
	args: {
		activity: feed([confirmedReceived, confirmedSent]),
		token: issuedVerifiedToken,
	},
};

export const WithPendingTx: Story = {
	args: {
		activity: feed([pendingSent, confirmedSent, confirmedReceived]),
		token: nativeToken,
	},
};

export const EmptyActivity: Story = {
	args: {
		activity: feed([]),
		token: nativeToken,
	},
};

export const LoadingActivity: Story = {
	args: {
		activity: feed([], { isLoading: true }),
		token: nativeToken,
	},
};

export const ActivityError: Story = {
	args: {
		activity: feed([], { error: true }),
		token: nativeToken,
	},
};

const LONG_LIST_MAX = 100;
const LONG_LIST_PAGE = 25;

function LongHistoryHarness() {
	const [items, setItems] = useState(() => makeLongItems(50));
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const hasMore = items.length < LONG_LIST_MAX;

	const onLoadMore = useCallback(() => {
		setIsLoadingMore(true);
		window.setTimeout(() => {
			setItems((prev) => [...prev, ...makeLongItems(LONG_LIST_PAGE, prev.length)]);
			setIsLoadingMore(false);
		}, 500);
	}, []);

	const activity: PortfolioViewActivityFeed = {
		error: false,
		hasMore,
		isLoading: false,
		isLoadingMore,
		items,
		onLoadMore,
	};

	return (
		<AssetViewFrame>
			<LiquidAssetView
				actions={<QuickActions assetId={nativeToken.id} />}
				activity={activity}
				chain={mockLiquidChain}
				token={nativeToken}
			/>
		</AssetViewFrame>
	);
}

export const LongHistory: Story = {
	render: () => <LongHistoryHarness />,
};
