import "@/theme/global.css";
import type { Decorator, Preview } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { type ComponentType, useEffect, useState } from "react";

import { configureVaultMock, resetVaultMock, type VaultMockConfig } from "./mocks/vault";

// Routes referenced by the pages. Registering them as stubs lets <Link> build
// hrefs and <Navigate> resolve without crashing in isolation.
const KNOWN_PATHS = [
	"/app",
	"/app/settings",
	"/app/settings/account/$accountGroupId",
	"/app/settings/account/$accountGroupId/recovery-phrase",
	"/app/settings/add-account",
	"/app/asset/$assetId",
	"/app/receive",
	"/auth/intro",
	"/auth/create",
	"/auth/create/password",
	"/local-auth",
];

function createStoryRouter(Story: ComponentType) {
	const rootRoute = createRootRoute();
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <Story />,
	});
	const stubRoutes = KNOWN_PATHS.map((stubPath) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path: stubPath,
			component: () => null,
		}),
	);

	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute, ...stubRoutes]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
}

const withRouter: Decorator = (Story) => {
	const [router] = useState(() => createStoryRouter(Story as ComponentType));

	return <RouterProvider router={router} />;
};

const withQueryClient: Decorator = (Story) => {
	const [client] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: { retry: false },
					mutations: { retry: false },
				},
			}),
	);

	return (
		<QueryClientProvider client={client}>
			<Story />
		</QueryClientProvider>
	);
};

// Reproduces the real browser-extension popup viewport (375 x 620).
const withPopupFrame: Decorator = (Story) => (
	<div className="bg-background text-foreground flex h-[620px] w-[375px] flex-col overflow-hidden rounded-xl border shadow-xl">
		<Story />
	</div>
);

const withTheme: Decorator = (Story, context) => {
	const theme = context.globals.theme === "dark" ? "dark" : "light";

	useEffect(() => {
		const root = document.documentElement;

		root.classList.remove("light", "dark");
		root.classList.add(theme);
		root.style.colorScheme = theme;
	}, [theme]);

	return <Story />;
};

const withVault: Decorator = (Story, context) => {
	resetVaultMock();

	const vaultParams = context.parameters.vault as Partial<VaultMockConfig> | undefined;

	if (vaultParams) {
		configureVaultMock(vaultParams);
	}

	return <Story />;
};

const preview: Preview = {
	parameters: {
		layout: "centered",
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i,
			},
		},
	},
	globalTypes: {
		theme: {
			description: "Color theme",
			defaultValue: "light",
			toolbar: {
				title: "Theme",
				icon: "circlehollow",
				items: [
					{ value: "light", title: "Light", icon: "sun" },
					{ value: "dark", title: "Dark", icon: "moon" },
				],
				dynamicTitle: true,
			},
		},
	},
	// Outermost first. The story renders inside the router (innermost).
	decorators: [withVault, withTheme, withPopupFrame, withQueryClient, withRouter],
};

export default preview;
