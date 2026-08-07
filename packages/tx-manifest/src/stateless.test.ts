import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// AC-14 and D7: a person who wipes the wallet, the browser or the machine must be able to
// perform the same action from the same site with no loss of capability. That is easy to
// satisfy accidentally and easy to break silently — a cache added in a later slice for a
// good reason becomes load-bearing without anyone deciding it should. So the check is
// structural and standing rather than a demonstration run once.

const RUNTIME = dirname(fileURLToPath(import.meta.url));

/**
 * Every source of the runtime, at whatever depth it sits.
 *
 * Recursive deliberately. This walked one directory while the package was one directory,
 * and the day the modules moved into their owners it would have gone on passing while
 * inspecting two files out of thirty — every check below reporting clean because it had
 * stopped looking rather than because there was nothing to find. `name` carries the path
 * from the package root so an offender can be located, and `dir` is what an import
 * specifier resolves against.
 */
function sources(): { dir: string; name: string; text: string }[] {
	const found: { dir: string; name: string; text: string }[] = [];

	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);

			if (entry.isDirectory()) {
				// Fixtures are other people's documents, not this runtime's source.
				if (entry.name !== "__fixtures__") {
					walk(path);
				}

				continue;
			}

			if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
				found.push({ dir, name: relative(RUNTIME, path), text: readFileSync(path, "utf8") });
			}
		}
	};

	walk(RUNTIME);

	return found;
}

describe("the runtime reads nothing it remembered", () => {
	// The checks below all report clean when they find nothing, which is the same answer they
	// give when they are looking at nothing. That is not hypothetical: this file walked one
	// directory, and when the modules moved into their owners it went on passing over two
	// files out of thirty. So the first assertion is that there is something to assert about.
	test("and the checks below are looking at the whole runtime", () => {
		expect(sources().length).toBeGreaterThan(25);
	});

	// Everything the runtime needs arrives in the request or derives from the recovery
	// phrase. Anything that reads what a previous run wrote down would make a second run on
	// a restored wallet behave differently from the first, which is the whole failure.
	const persistence = [
		"localStorage",
		"sessionStorage",
		"indexedDB",
		"chrome.storage",
		"browser.storage",
		"webextension-polyfill",
	];

	for (const api of persistence) {
		test(`no module reaches for ${api}`, () => {
			const offenders = sources()
				.filter(({ text }) => text.includes(api))
				.map(({ name }) => name);

			expect(offenders).toEqual([]);
		});
	}

	test("and none imports anything outside this runtime and its own dependencies", () => {
		const dependencies = /^(?:@noble\/hashes\/[a-z0-9.]+|zod)$/;
		const offenders: string[] = [];

		for (const { dir, name, text } of sources()) {
			for (const match of text.matchAll(/from "(?<specifier>[^"]+)"/g)) {
				const specifier = match.groups?.specifier ?? "";

				if (dependencies.test(specifier)) {
					continue;
				}

				// A relative import is judged by where it lands rather than by how it is
				// written. Once the package has directories, `../` is the ordinary way one
				// module reaches its sibling — and it is also how a module would reach out of
				// the package altogether. Only resolving it tells the two apart.
				if (specifier.startsWith(".")) {
					const escapes = relative(RUNTIME, resolve(dir, specifier)).startsWith("..");

					if (!escapes) {
						continue;
					}
				}

				offenders.push(`${name} → ${specifier}`);
			}
		}

		// Nothing reaches outside the package. This was one import — the wallet RPC error the
		// request validator threw — until the runtime moved out of the extension. Now a malformed
		// request comes back as a value and the caller that has a transport owns the refusal.
		expect(offenders).toEqual([]);
	});
});

// The other half of D7: the runtime is a function of its inputs. Given the same request and
// the same chain answers it produces the same transaction, whatever happened before — which
// is what "restore from the phrase and do it again" means when there is nothing to restore.
describe("the same request twice produces the same result", () => {
	test("nothing outside a function can be reassigned", () => {
		const offenders = sources()
			.filter(({ text }) => /^(?:let|var) /m.test(text))
			.map(({ name }) => name);

		expect(offenders).toEqual([]);
	});

	// A `Set` or `Map` at module level is a lookup table or a cache, and the difference is
	// whether anything writes to it. The tables here are built from literals and only read;
	// a write to one is where a cache would begin.
	test("no module-level collection is ever written to", () => {
		const offenders: string[] = [];

		for (const { name, text } of sources()) {
			for (const match of text.matchAll(/^const (?<held>\w+) = new (?:Map|Set|WeakMap)\(/gm)) {
				const held = match.groups?.held ?? "";
				const written = new RegExp(`\\b${held}\\.(?:add|set|delete|clear)\\(`);

				if (written.test(text)) {
					offenders.push(`${name} → ${held}`);
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
