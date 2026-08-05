/**
 * Turns whatever the background sent back into an error a person can read.
 *
 * The background serialises a thrown error structurally — `{message, code?, data?, cause?}` — so
 * a dapp can branch on the code instead of parsing a sentence. Passing that object through
 * `String()` produced `[object Object]`, which is what every failure in the wallet's own screens
 * said: the one place the message was written for a person is the one place it did not arrive.
 *
 * The structured fields are kept on the error, since a caller that wants to branch has as much
 * right to them here as a dapp does. Anything that is neither a string nor message-shaped is
 * rendered as JSON rather than as its type name, because an unreadable error is worse than an
 * ugly one.
 */
export function toError(raw: unknown): Error {
	if (typeof raw === "string") {
		return new Error(raw);
	}

	if (typeof raw === "object" && raw !== null) {
		const structured = raw as {
			cause?: unknown;
			code?: unknown;
			data?: unknown;
			message?: unknown;
		};

		if (typeof structured.message === "string") {
			return Object.assign(new Error(describe(structured)), {
				...(structured.code === undefined ? {} : { code: structured.code }),
				...(structured.data === undefined ? {} : { data: structured.data }),
				...(structured.cause === undefined ? {} : { cause: toError(structured.cause) }),
			});
		}

		try {
			return new Error(JSON.stringify(raw));
		} catch {
			return new Error("The extension failed and did not say why.");
		}
	}

	return new Error(String(raw));
}

/**
 * One sentence carrying the whole chain, because only the message reaches a screen.
 *
 * A handler wraps a failure in a stable wallet error and attaches what actually went wrong
 * underneath. The wrapper alone says "could not build, sign and broadcast the transfer", which
 * is true and tells a person nothing they can act on; the cause says which of those it was. The
 * `cause` field is kept on the error as well, for a caller that wants the parts rather than a
 * sentence.
 */
function describe(error: { cause?: unknown; message?: unknown }): string {
	const parts: string[] = [];
	let current: { cause?: unknown; message?: unknown } | undefined = error;

	while (current && typeof current.message === "string") {
		const message = current.message.trim();

		// A wrapper that merely restates its cause adds nothing but length.
		if (message && !parts.includes(message)) {
			parts.push(message);
		}

		current =
			typeof current.cause === "object" && current.cause !== null
				? (current.cause as { cause?: unknown; message?: unknown })
				: undefined;
	}

	return parts.join(" — caused by: ");
}
