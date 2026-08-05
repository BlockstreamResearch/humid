/**
 * Turns whatever the background sent back into an error a person can read.
 *
 * The background serialises a thrown error structurally — `{message, code?, data?}` — so a dapp
 * can branch on the code instead of parsing a sentence. Passing that object through `String()`
 * produced `[object Object]`, which is what every failure in the wallet's own screens said: the
 * one place the message was written for a person is the one place it did not arrive.
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
		const structured = raw as { code?: unknown; data?: unknown; message?: unknown };

		if (typeof structured.message === "string") {
			return Object.assign(new Error(structured.message), {
				...(structured.code === undefined ? {} : { code: structured.code }),
				...(structured.data === undefined ? {} : { data: structured.data }),
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
