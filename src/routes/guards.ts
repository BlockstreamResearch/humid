import { redirect } from "@tanstack/react-router";

import { authStore } from "@/store/auth";

export function getDefaultRoute() {
	const authState = authStore.useAuthStore.getState();

	if (!authState.hasVault) return "/auth/intro";
	if (!authState.isUnlocked) return "/local-auth";

	return "/app";
}

export function requireUnlocked() {
	const authState = authStore.useAuthStore.getState();

	if (!authState.hasVault) {
		throw redirect({ to: "/auth/intro" });
	}

	if (!authState.isUnlocked) {
		throw redirect({ to: "/local-auth" });
	}
}

export function requireNoVault() {
	const authState = authStore.useAuthStore.getState();

	if (authState.hasVault) {
		throw redirect({ to: authState.isUnlocked ? "/app" : "/local-auth" });
	}
}

export function requireLockedVault() {
	const authState = authStore.useAuthStore.getState();

	if (!authState.hasVault) {
		throw redirect({ to: "/auth/intro" });
	}

	if (authState.isUnlocked) {
		throw redirect({ to: "/app" });
	}
}
