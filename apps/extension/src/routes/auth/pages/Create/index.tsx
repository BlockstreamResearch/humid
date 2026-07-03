import { Outlet } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type AuthCreateContextValue = {
	seedMaterial: string;
	setSeedMaterial: (seedMaterial: string) => void;
};

const AuthCreateContext = createContext<AuthCreateContextValue | null>(null);

export function useAuthCreateContext() {
	const context = useContext(AuthCreateContext);

	if (!context) {
		throw new Error("useAuthCreateContext must be used within AuthCreateLayout.");
	}

	return context;
}

export function AuthCreateProvider({
	children,
	initialSeedMaterial = "",
}: {
	children: ReactNode;
	initialSeedMaterial?: string;
}) {
	const [seedMaterial, setSeedMaterial] = useState(initialSeedMaterial);
	const value = useMemo<AuthCreateContextValue>(
		() => ({ seedMaterial, setSeedMaterial }),
		[seedMaterial],
	);

	return <AuthCreateContext.Provider value={value}>{children}</AuthCreateContext.Provider>;
}

export function AuthCreateLayout() {
	return (
		<AuthCreateProvider>
			<Outlet />
		</AuthCreateProvider>
	);
}
