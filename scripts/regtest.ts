import { fileURLToPath } from "node:url";

const RPC_URL = "http://127.0.0.1:18443";
const RPC_AUTH = `Basic ${btoa("humid:humid")}`;
const POLL_MS = 2_000;

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

	await rpc("generatetoaddress", [1, await rpc<string>("getnewaddress")]);
	process.stdout.write(`Mined a block with ${size} waiting transaction${size === 1 ? "" : "s"}.\n`);
}

const miner = setInterval(async () => {
	try {
		await mineWaitingTransactions();
	} catch {
		// The node is still starting.
	}
}, POLL_MS);

const code = await node.exited;

clearInterval(miner);
process.exit(code);
