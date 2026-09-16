import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";

import { MockHomeProvider } from "../../HomeContext/mock";
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
		history: createMemoryHistory({ initialEntries: ["/app/asset/lbtc"] }),
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
};
