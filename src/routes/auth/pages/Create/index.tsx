import { Outlet } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

type AuthCreateContextValue = {
	secret: string;
	setSecret: (secret: string) => void;
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
	initialSecret = "",
}: {
	children: ReactNode;
	initialSecret?: string;
}) {
	const [secret, setSecret] = useState(initialSecret);
	const value = useMemo<AuthCreateContextValue>(() => ({ secret, setSecret }), [secret]);

	return <AuthCreateContext.Provider value={value}>{children}</AuthCreateContext.Provider>;
}

export function AuthCreateLayout() {
	return (
		<AuthCreateProvider>
			<Outlet />
		</AuthCreateProvider>
	);
}
