import { describe, expect, test } from "bun:test";

import { renderToStaticMarkup } from "react-dom/server";

import { LiquidSigningConfirmation } from "./LiquidSigningConfirmation";

const account = { accountIdentifier: "liquid:testnet account 0", chainId: "liquid:testnet" };
const markup = (data: unknown, method = "signMessage") =>
	renderToStaticMarkup(
		<LiquidSigningConfirmation
			request={{
				title: "Review signing request",
				data,
				method,
				requester: { origin: "https://requesting.example" },
			}}
			onConfirm={() => {}}
			onDecline={() => {}}
		/>,
	);

describe("signing review safety", () => {
	test("shows the exact multiline message without treating app-controlled text as markup", () => {
		const message = "Authorize account access\n<script>doNotExecute()</script>\nNonce: 123";
		const rendered = markup({
			...account,
			address: "tex1qsigner",
			kind: "liquid.signMessage",
			message,
			protocol: "ecdsa",
		});

		expect(rendered).toContain("https://requesting.example");
		expect(rendered).toContain("signMessage");
		expect(rendered).toContain("tex1qsigner");
		expect(rendered).toContain(
			"Authorize account access\n&lt;script&gt;doNotExecute()&lt;/script&gt;\nNonce: 123",
		);
		expect(rendered).not.toContain("<script>");
	});

	test("shows the full challenge and identity, not only a fingerprint", () => {
		const rendered = markup(
			{
				chainId: account.chainId,
				challenge: "abcdef012345",
				challengeFingerprint: "123456",
				curve: "nist256p1",
				identity: "https://identity.example/login",
				index: 2,
				kind: "liquid.signIdentity",
			},
			"signIdentity",
		);

		expect(rendered).toContain("https://identity.example/login");
		expect(rendered).toContain("abcdef012345");
	});

	test("distinguishes hidden PSET amounts from zero and discloses actual sighash disagreements", () => {
		const data = {
			...account,
			broadcast: false,
			kind: "liquid.signPset",
			requestedInputs: [{ address: "tex1qsigner", index: 1, sighashTypes: [1, 129] }],
			transaction: {
				pset: "cHNldA==",
				inputs: [
					{ index: 0, sighashType: 1 },
					{ index: 1, sighashType: 130 },
				],
				fees: [{ asset: "fee-asset", amount: "344" }],
				netEffect: [{ asset: "fee-asset", amount: "-50344" }],
				outputs: [
					{ index: 0, script: "0014abcd", address: "tex1qrecipient", amount: "0", asset: "token" },
					{ index: 1, script: "0014efab" },
				],
			},
		};
		const rendered = markup(data, "signPset");

		expect(rendered).toContain("tex1qrecipient");
		expect(rendered).toContain("0 · token");
		expect(rendered).toContain("Confidential amount unavailable");
		expect(rendered).toContain("-50344 · fee-asset");
		expect(rendered).toContain("344 · fee-asset");
		expect(rendered).toContain("0x1, 0x81");
		expect(rendered).toContain("0x82 (130)");
		expect(rendered).toContain('role="alert"');
		expect(
			markup(
				{
					...data,
					requestedInputs: [{ address: "tex1qsigner", index: 1, sighashTypes: [130] }],
				},
				"signPset",
			),
		).not.toContain('role="alert"');
	});

	test("shows transfer recipient, amount, memo and public disclosure before sending", () => {
		const rendered = markup(
			{
				...account,
				kind: "liquid.sendTransfer",
				amount: "50000",
				assetId: "liquid:testnet/elip144:token",
				memo: "Order 123",
				recipientAddress: "tex1qrecipient",
				recipientConfidential: false,
			},
			"sendTransfer",
		);

		expect(rendered).toContain("tex1qrecipient");
		expect(rendered).toContain("50000");
		expect(rendered).toContain("Order 123");
		expect(rendered).toContain("publicly visible");
	});

	test("cannot approve a request whose substantive contents are missing or malformed", () => {
		for (const data of [
			{ kind: "liquid.signMessage", ...account },
			{ kind: "liquid.signIdentity", challenge: "not hex" },
			{ kind: "liquid.signPset", transaction: { outputs: "unreadable" } },
			{ kind: "liquid.sendTransfer" },
		]) {
			const rendered = markup(data);
			expect(rendered).toContain("could not be read");
			expect(rendered).toContain(">Decline</button>");
			expect(rendered).not.toContain(">Sign</button>");
			expect(rendered).not.toContain(">Sign and send</button>");
		}
	});
});
