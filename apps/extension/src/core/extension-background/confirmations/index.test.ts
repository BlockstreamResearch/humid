import { expect, test } from "bun:test";

const helperUrl = new URL("../../../helpers/background.ts", import.meta.url).href;
const responderUrl = new URL("./index.ts", import.meta.url).href;

// Isolate the browser mock and clock so other vault/WASM tests keep their real modules.
const scenario = String.raw`
import assert from "node:assert/strict";
import { mock } from "bun:test";

const [helperUrl, responderUrl, scenario] = process.argv.slice(1);
const openingStarted = Promise.withResolvers();
const releaseOpening = Promise.withResolvers();
const requestSent = Promise.withResolvers();
let timerScheduled = Promise.withResolvers();
const responses = new Set();
const timers = new Map();
const requests = [];
const normal = { id: 1, type: "normal", focused: true, left: 0, top: 0, width: 1000, height: 800 };
let popup;
let onRemoved;
let created = 0;
let removed = 0;
let nextTimer = 0;
let now = 0;
let failOpening = scenario === "open-failure";
const deferOpening = scenario.endsWith("opening");

globalThis.setTimeout = (run, delay) => {
 const id = ++nextTimer;
 timers.set(id, { run, due: now + delay });
 timerScheduled.resolve();
 return id;
};
globalThis.clearTimeout = id => timers.delete(id);

const windows = {
 getAll: async options => options ? [normal] : [normal, ...(popup ? [popup] : [])],
 getLastFocused: async () => normal,
 create: async () => {
  openingStarted.resolve();
  if (deferOpening) await releaseOpening.promise;
  if (failOpening) throw new Error("Could not open notification");
  popup = { id: ++created + 1, type: "popup" };
  return popup;
 },
 update: async () => popup,
 remove: async id => {
  assert.equal(id, popup.id);
  popup = undefined;
  removed++;
  onRemoved(id);
 },
 onRemoved: { addListener: callback => { onRemoved = callback; } },
};
mock.module("webextension-polyfill", () => ({ default: { windows } }));
const helpers = await import(helperUrl);
const { createConfirmationResponder } = await import(responderUrl);

function reply(request, approved) {
 for (const response of [...responses]) response({ data: { id: request.id, data: { approved } } });
}
const bus = {
 onMessage: (_method, response) => {
  responses.add(response);
  return () => responses.delete(response);
 },
 sendMessage: async (_method, request) => {
  requests.push(request);
  requestSent.resolve();
  if (scenario === "send-failure") throw new Error("Notification transport unavailable");
  if (scenario === "approve") reply(request, true);
 },
};
const responder = createConfirmationResponder(bus);
helpers.initNotificationManagement(() => responder.cancelActive());

async function advanceTimer() {
 if (timers.size === 0) await timerScheduled.promise;
 const [id, timer] = [...timers.entries()].sort((left, right) => left[1].due - right[1].due)[0];
 timers.delete(id);
 if (timers.size === 0) timerScheduled = Promise.withResolvers();
 now = timer.due;
 timer.run();
}
function clean() {
 assert.equal(timers.size, 0, "completed requests must not retain deadlines");
 assert.equal(responses.size, 0, "completed requests must not retain response handlers");
}

if (scenario === "cancel-opening") {
 const pending = responder.confirm({ title: "Unlock" });
 await openingStarted.promise;
 responder.cancelActive();
 assert.deepEqual(await pending, { approved: false, reason: "closed" });
 releaseOpening.resolve();
 await helpers.openNotification();
 assert.equal(requests.length, 0, "cancelled opening must never send an approval request");
 clean();
} else if (scenario === "supersede-opening") {
 const first = responder.confirm({ title: "First request" });
 await openingStarted.promise;
 const second = responder.confirm({ title: "Second request" });
 releaseOpening.resolve();
 assert.deepEqual(await first, { approved: false, reason: "superseded" });
 await advanceTimer();
 await requestSent.promise;
 assert.equal(created, 1, "concurrent requests must share one notification window");
 assert.deepEqual(requests.map(request => request.data.title), ["Second request"]);
 reply(requests[0], true);
 assert.deepEqual(await second, { approved: true });
 clean();
} else if (scenario === "open-failure") {
 await assert.rejects(responder.confirm({ title: "Unlock" }), /Could not open notification/);
 clean();
 failOpening = false;
 const recovered = responder.confirm({ title: "Try again" });
 await advanceTimer();
 await requestSent.promise;
 reply(requests[0], true);
 assert.deepEqual(await recovered, { approved: true });
 clean();
} else {
 const pending = responder.confirm({ title: "Unlock" });
 const observed = pending.catch(error => error);
 await advanceTimer();
 await requestSent.promise;
 if (scenario === "closed") {
  await windows.remove(popup.id);
  assert.deepEqual(await observed, { approved: false, reason: "closed" });
 } else if (scenario === "timeout") {
  await advanceTimer();
  assert.deepEqual(await observed, { approved: false, reason: "timeout" });
  assert.equal(removed, 1);
 } else if (scenario === "send-failure") {
  assert.match((await observed).message, /Notification transport unavailable/);
  assert.equal(removed, 1);
 } else {
  assert.deepEqual(await observed, { approved: true });
  assert.equal(removed, 1);
 }
 clean();
}
console.log("notification lifecycle:", scenario);
`;

test.each([
	"cancel-opening",
	"supersede-opening",
	"closed",
	"timeout",
	"approve",
	"open-failure",
	"send-failure",
])("notification lifecycle: %s", async (name) => {
	const child = Bun.spawn(["bun", "--eval", scenario, helperUrl, responderUrl, name], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	expect(exitCode, `${stdout}\n${stderr}`).toBe(0);
});
