import {
	initPegasusZustandStoreBackend,
	pegasusZustandStoreReady,
} from "@webext-pegasus/store-zustand";
import { create } from "zustand";
import { combine } from "zustand/middleware";

type AuthState = {
	hasVault: boolean;
	isUnlocked: boolean;
};

const STORE_NAME = "auth";

const useAuthStore = create(
	combine({ hasVault: false, isUnlocked: false } as AuthState, (set) => ({
		createVault: () => {
			set({ hasVault: true, isUnlocked: true });
		},
		unlock: () => {
			set({ isUnlocked: true });
		},
		lock: () => {
			set({ isUnlocked: false });
		},
		reset: () => {
			set({ hasVault: false, isUnlocked: false });
		},
		setVaultStatus: (status: AuthState) => {
			set(status);
		},
	})),
);

const backendReady = async () => {
	const store = await initPegasusZustandStoreBackend(STORE_NAME, useAuthStore, {
		storageStrategy: "local",
	});

	store.setState({ isUnlocked: false });

	return store;
};

const ready = () => pegasusZustandStoreReady(STORE_NAME, useAuthStore);

export const authStore = {
	useAuthStore,
	backendReady,
	ready,
};
