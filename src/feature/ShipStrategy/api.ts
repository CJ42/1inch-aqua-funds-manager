import {
	type Address,
	createWalletClient,
	custom,
	fallback,
	type Hex,
	http,
	publicActions,
} from "viem";
import { LOCAL_FORK_RPC_URL, robinhoodFork } from "@/config";
import {
	buildPortfolioAllocations,
	FIXED_TOKEN_PRICES_USD,
	PROFILE_WEIGHTS,
	type RiskProfile,
	SLEEVE_LABELS,
} from "@/lib/portfolio";
import {
	decodeAquaShipEvents,
	type ShipPortfolioResult,
	type ShippedSleeveResult,
	strategyHashFromEvents,
} from "@/lib/ship";
import { shipAquaStrategy } from "@/lib/strategy";
import {
	ensureRobinhoodNetwork,
	getEthereumProvider,
} from "@/lib/wallet";

export async function shipPortfolio(
	profile: RiskProfile,
	address: Address,
	totalUsd: number,
	onStep?: (message: string) => void,
): Promise<ShipPortfolioResult> {
	const provider = getEthereumProvider();
	onStep?.("Switching wallet to the Robinhood fork…");
	await ensureRobinhoodNetwork(provider);

	const walletClient = createWalletClient({
		account: address,
		chain: robinhoodFork,
		transport: fallback([custom(provider), http(LOCAL_FORK_RPC_URL)]),
	}).extend(publicActions);

	const { allocations } = buildPortfolioAllocations({
		totalUsd,
		weights: PROFILE_WEIGHTS[profile],
		prices: FIXED_TOKEN_PRICES_USD,
	});

	const approvalHashes: Hex[] = [];
	const sleeves: ShippedSleeveResult[] = [];

	for (const allocation of allocations) {
		const label = SLEEVE_LABELS[allocation.sleeve];
		const result = await shipAquaStrategy({
			walletClient,
			allocation,
			onStep: (message) => onStep?.(`${label}: ${message}`),
		});
		approvalHashes.push(...result.approvalHashes);
		const events = decodeAquaShipEvents(result.shipped.receipt);
		sleeves.push({
			sleeve: result.shipped.sleeve,
			txHash: result.shipped.hash,
			strategyHash: strategyHashFromEvents(events),
			strategy: result.shipped.strategy,
			events,
		});
	}

	return {
		maker: address,
		profile,
		totalUsd,
		approvalHashes,
		sleeves,
	};
}
