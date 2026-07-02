import type { LiquidFiatRate } from "../../../application/backends/LiquidWalletBackend";
import type { LwkWasmModule } from "../loadLwkWasm";

/** The fiat currency the portfolio prices the native asset in. */
const FIAT_CURRENCY = "USD";

/**
 * Fetch the median price of the native asset (BTC / L-BTC) in the display currency via LWK's
 * standalone `PricesFetcher` (no blockchain client needed). Best-effort: any failure resolves to
 * null so the scan still returns balances. Only the native asset gets a fiat value — issued
 * assets have no direct rate.
 */
export async function fetchNativeFiatRate(lwk: LwkWasmModule): Promise<LiquidFiatRate | null> {
	try {
		const fetcher = new lwk.PricesFetcher();
		const exchangeRates = await fetcher.rates(new lwk.CurrencyCode(FIAT_CURRENCY));
		const median = exchangeRates.median();

		exchangeRates.free();

		if (!Number.isFinite(median) || median <= 0) return null;

		return { currency: FIAT_CURRENCY, nativeUnitPrice: median.toString() };
	} catch (error) {
		console.warn("[liquid-sync] price rate lookup failed", error);

		return null;
	}
}
