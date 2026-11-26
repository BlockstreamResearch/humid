import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { expect, within } from "storybook/test";

import { MockHomeProvider } from "../../HomeContext/mock";
import { MOCK_LBTC_ID } from "../../HomeContext/mockAssets";
import { AssetPage } from "./index";

function createAssetStoryRouter() {
	const rootRoute = createRootRoute();
	const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app" });
	const homeRoute = createRoute({ getParentRoute: () => appRoute, id: "home" });
	const assetRoute = createRoute({
		getParentRoute: () => homeRoute,
		path: "asset/$assetId",
		component: AssetPage,
	});

	return createRouter({
		routeTree: rootRoute.addChildren([appRoute.addChildren([homeRoute.addChildren([assetRoute])])]),
		history: createMemoryHistory({ initialEntries: [`/app/asset/${MOCK_LBTC_ID}`] }),
	});
}

function AssetStory() {
	const [router] = useState(createAssetStoryRouter);

	return (
		<MockHomeProvider>
			<RouterProvider router={router} />
		</MockHomeProvider>
	);
}

const meta = {
	title: "Pages/App/Home/Asset",
	component: AssetPage,
} satisfies Meta<typeof AssetPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: () => <AssetStory />,
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);

		await expect(await canvas.findByText("+0.2413 L-BTC")).toBeVisible();
		await expect(canvas.getByText("−0.03 L-BTC")).toBeVisible();
	},
};
