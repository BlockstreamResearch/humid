import { Outlet } from "@tanstack/react-router";
import { createContext, useContext, useMemo, useState } from "react";

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

export function AuthCreateLayout() {
	const [secret, setSecret] = useState("");
	const value = useMemo<AuthCreateContextValue>(() => ({ secret, setSecret }), [secret]);

	return (
		<AuthCreateContext.Provider value={value}>
			<Outlet />
		</AuthCreateContext.Provider>
	);
}
