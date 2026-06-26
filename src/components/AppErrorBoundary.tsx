import { Component, type ErrorInfo, type ReactNode } from "react";

import { reportAppError } from "@/core";

type AppErrorBoundaryProps = {
	children: ReactNode;
};

type AppErrorBoundaryState = {
	hasError: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
	state: AppErrorBoundaryState = {
		hasError: false,
	};

	static getDerivedStateFromError(): AppErrorBoundaryState {
		return { hasError: true };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		reportAppError(error, {
			module: "react",
			message: "Unhandled React error",
			context: {
				componentStack: info.componentStack,
			},
		});
	}

	render() {
		if (this.state.hasError) {
			return <AppCrashFallback />;
		}

		return this.props.children;
	}
}

function AppCrashFallback() {
	return (
		<main className="bg-background text-foreground flex size-full items-center justify-center px-6">
			<section className="max-w-xs text-center">
				<p className="text-destructive text-sm font-semibold tracking-[0.24em] uppercase">Error</p>
				<h1 className="mt-3 text-xl font-semibold">Something went wrong.</h1>
				<p className="text-muted-foreground mt-3 text-sm">Please reload the extension popup.</p>
			</section>
		</main>
	);
}
