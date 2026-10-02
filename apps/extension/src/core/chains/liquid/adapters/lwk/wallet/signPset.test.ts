import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

test("real coin-control PSET review preserves the signed transaction and discloses effective sighashes", async () => {
	// A separate Bun process isolates the bundler-loader override from all other
	// test modules. The child exercises real LWK WASM, the web builder and review UI.
	const child = Bun.spawn(
		[process.execPath, fileURLToPath(new URL("./signPsetRegression.tsx", import.meta.url))],
		{
			cwd: fileURLToPath(new URL("../../../../../../../../../", import.meta.url)),
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
	expect(JSON.parse(stdout)).toEqual({
		fee: "1000",
		signatures: 1,
		effectiveSighash: 130,
		requestedAllowances: [1],
		transactionUnchanged: true,
	});
}, 30_000);
