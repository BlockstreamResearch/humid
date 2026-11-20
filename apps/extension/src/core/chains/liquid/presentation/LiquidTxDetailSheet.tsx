import { ArrowDownLeft01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";

import type { ChainRecord } from "@/core/chains/application/ChainRecord";
import type {
	PortfolioViewActivity,
	PortfolioViewAsset,
} from "@/core/chains/application/PortfolioView";
import { formatUnits } from "@/helpers/formatters";

import type { LiquidAssetMetadata } from "../domain/LiquidAsset";
import { liquidExplorerTxUrl } from "./liquidExplorerTxUrl";
import { LiquidTxStatusBadge } from "./LiquidTxStatus";
import { TransactionSheet } from "./TransactionSheet";

const L_BTC_DECIMALS = 8;

export const UNLISTED_ASSET_NOTE = "Not in the asset registry, the amount is in raw units.";

export function LiquidTxDetailSheet({
	chain,
	item,
	onClose,
	token,
}: {
	chain: ChainRecord;
	item: PortfolioViewActivity | null;
	onClose: () => void;
	token: PortfolioViewAsset;
}) {
	const isSent = item?.direction === "sent";
	const listed = (token.metadata as LiquidAssetMetadata).verified;

	return (
		<TransactionSheet
			content={
				item && {
					copies: [
						...(listed ? [] : [{ label: "Asset ID", note: UNLISTED_ASSET_NOTE, value: token.id }]),
						{ label: "Transaction ID", value: item.id },
					],
					explorerUrl: liquidExplorerTxUrl(chain, item.id),
					headline: `${isSent ? "−" : "+"}${formatUnits(item.amount, token.decimals)} ${token.symbol}`,
					icon: isSent ? ArrowUpRight01Icon : ArrowDownLeft01Icon,
					rows: [
						{ label: "Direction", value: <span className="capitalize">{item.direction}</span> },
						{ label: "Date", value: item.date },
						{
							label: "Network fee",
							value: item.fee === null ? "—" : `${formatUnits(item.fee, L_BTC_DECIMALS)} L-BTC`,
						},
					],
					status: <LiquidTxStatusBadge status={item.status} />,
				}
			}
			onClose={onClose}
		/>
	);
}
