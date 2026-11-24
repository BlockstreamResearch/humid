import { fileURLToPath } from "node:url";

const RPC_URL = "http://127.0.0.1:18443";
const RPC_AUTH = `Basic ${btoa("humid:humid")}`;
const POLL_MS = 2_000;
// Anyone can spend (OP_TRUE), so mining never depends on the node's own wallet.
const MINER_ADDRESS = "ert1qft5p2uhsdcdc3l2ua4ap5qqfg4pjaqlp250x7us7a8qqhrxrxfsqp24xws";

// Bun lifts the open-file limit to unlimited, which elementsd reads as too few.
const node = Bun.spawn(["sh", "-c", "ulimit -n 4096 && exec simplex regtest"], {
	cwd: fileURLToPath(new URL("../regtest/", import.meta.url)),
	stdio: ["inherit", "inherit", "inherit"],
});

process.on("SIGINT", () => node.kill("SIGINT"));

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
	const response = await fetch(RPC_URL, {
		body: JSON.stringify({ id: method, jsonrpc: "1.0", method, params }),
		headers: { Authorization: RPC_AUTH },
		method: "POST",
	});
	const { error, result } = (await response.json()) as { error: unknown; result: T };

	if (error) throw new Error(`${method}: ${JSON.stringify(error)}`);

	return result;
}

async function mineWaitingTransactions(): Promise<void> {
	const { size } = await rpc<{ size: number }>("getmempoolinfo");

	if (size === 0) return;

	await rpc("generatetoaddress", [1, MINER_ADDRESS]);
	process.stdout.write(`Mined a block with ${size} waiting transaction${size === 1 ? "" : "s"}.\n`);
}

let lastFailure = "";

const miner = setInterval(async () => {
	try {
		await mineWaitingTransactions();
		lastFailure = "";
	} catch (error) {
		const failure = error instanceof Error ? error.message : String(error);

		// Each new reason once: refused connections while the node starts, then anything real.
		if (failure !== lastFailure) process.stderr.write(`Not mining yet: ${failure}\n`);
		lastFailure = failure;
	}
}, POLL_MS);

const code = await node.exited;

clearInterval(miner);
process.exit(code);
