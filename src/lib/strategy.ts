import {
	Address,
	AquaProtocolContract,
	type CallInfo,
	HexString,
} from "@1inch/aqua-sdk";
import { AquaXYCAmmStrategy, MakerTraits, Order, instructions } from "@1inch/swap-vm-sdk";
import {
	type Address as EvmAddress,
	encodeAbiParameters,
	type Hex,
	hexToBigInt,
	keccak256,
	type TransactionReceipt,
	type WalletClient,
} from "viem";
import { getTransactionCount, waitForTransactionReceipt } from "viem/actions";
import { AQUA_CONTRACT, SWAP_VM_ROUTER } from "@/config";
import type { PairAllocation } from "./portfolio";
import { approveAquaToSpendTokens } from "./tokens";
import { TOKENIZED_STOCKS, TOKENS } from "@/constants";

export type LiquidityProvision = [
	{
		token: Address;
		amount: bigint;
	},
	{
		token: Address;
		amount: bigint;
	},
];

export type AquaStrategyInput = {
	maker: `0x${string}`;
	walletClient: WalletClient;
	liquidityProvision: LiquidityProvision;
};

export type BuiltAquaStrategy = {
	shipTx: CallInfo;
	strategy: Hex;
};

export type ShippedStrategy = {
	sleeve: PairAllocation["sleeve"];
	hash: Hex;
	receipt: TransactionReceipt;
	strategy: Hex;
};

export async function buildAquaStrategy({
	maker,
	walletClient,
	liquidityProvision,
}: AquaStrategyInput): Promise<BuiltAquaStrategy> {
	const aquaRegistry = new AquaProtocolContract(AQUA_CONTRACT);
	const makerNonce = await getTransactionCount(walletClient, {
		address: maker,
		blockTag: "latest",
	});
	const salt = generateAquaStrategySalt({ liquidityProvision, makerNonce });

	let program;

	const { ONE_E18 } = instructions.concentrate

	const token0 = liquidityProvision[0].token.toString();
	const token1 = liquidityProvision[1].token.toString();

	// For the USDG / WETH pair, for a price of 2,500$ / ETH 
	// The price range `-5 % < ETH price < +5 %` corresponds to:
	// 2,375$ < 2,500$ < 2,625$
	if (token0 == TOKENS.USDG && token1 == TOKENS.WETH) {
		program = AquaXYCAmmStrategy.newConcentrate({
			rawPriceMin: ONE_E18 / 2375n,
			rawPriceMax: ONE_E18 / 2625n,
		})
			.withFeeTokenIn(30)
			.withSalt(salt)
			.build();

		// For the USDG / TSLA pair, for a stock price of 350$ / TSLA stock
		// The price range `-5 % < TSLA stock price < +5 %` corresponds to:
		// 332$ < 350$ < 367$
	} else if (token0 == TOKENS.USDG && token1 == TOKENIZED_STOCKS.TSLA) {
		program = AquaXYCAmmStrategy.newConcentrate({
			rawPriceMin: ONE_E18 / 332n,
			rawPriceMax: ONE_E18 / 367n,
		})
			.withFeeTokenIn(30)
			.withSalt(salt)
			.build();

	// For the WETH / 1INCH pair,
	// the price P = WETH per 1INCH. 
	// 
	// Considering a fixed price of 2,500$ per ETH
	// 1 WETH = 2500 / 0.1 = 25,000 1INCH.
	//
	// If we apply ±5% to each token independently, ratios are:
	// max: 2625 / 0.095 ≈ 27,632 1INCH per WETH
	// min: 2375 / 0.105 ≈ 22,619 1INCH per WETH
	} else {
		program = AquaXYCAmmStrategy.newConcentrate({
			rawPriceMin: ONE_E18 / 27632n,
			rawPriceMax: ONE_E18 / 22619n
		})
			.withFeeTokenIn(30)
			.withSalt(salt)
			.build();
	}

	const order = Order.new({
		maker: new Address(maker),
		program,
		traits: MakerTraits.default(),
	});

	const strategy = order.encode().toString() as Hex;

	return {
		shipTx: aquaRegistry.ship({
			app: SWAP_VM_ROUTER,
			strategy: order.encode(),
			amountsAndTokens: liquidityProvision,
		}),
		strategy,
	};
}

/**
 * Approve both legs of an allocation, then ship that strategy to Aqua.
 */
export async function shipAquaStrategy({
	walletClient,
	allocation,
	onStep,
}: {
	walletClient: WalletClient;
	allocation: PairAllocation;
	onStep?: (message: string) => void;
}): Promise<{ approvalHashes: Hex[]; shipped: ShippedStrategy }> {
	const account = walletClient.account;
	if (!account) throw new Error("walletClient account is required");

	const liquidityProvision = toLiquidityProvision(allocation);

	// Explicit for hackathon judges: each pair has exactly two tokens.
	const addressToken0 = liquidityProvision[0].token.toString() as EvmAddress;
	const amountToken0 = liquidityProvision[0].amount;
	const addressToken1 = liquidityProvision[1].token.toString() as EvmAddress;
	const amountToken1 = liquidityProvision[1].amount;

	onStep?.(`Approve ${allocation.legs[0].token.symbol} in your wallet…`);
	const approvalTxHashToken0 = await approveAquaToSpendTokens({
		walletClient,
		token: addressToken0,
		amount: amountToken0,
	});
	await waitForTransactionReceipt(walletClient, { hash: approvalTxHashToken0 });

	onStep?.(`Approve ${allocation.legs[1].token.symbol} in your wallet…`);
	const approvalTxHashToken1 = await approveAquaToSpendTokens({
		walletClient,
		token: addressToken1,
		amount: amountToken1,
	});
	await waitForTransactionReceipt(walletClient, { hash: approvalTxHashToken1 });

	const { shipTx, strategy } = await buildAquaStrategy({
		maker: account.address,
		walletClient,
		liquidityProvision,
	});

	onStep?.("Confirm shipping this strategy in your wallet…");
	const hash = await walletClient.sendTransaction({
		account,
		chain: walletClient.chain,
		to: shipTx.to as `0x${string}`,
		data: shipTx.data as Hex,
		value: shipTx.value,
	});

	const receipt = await waitForTransactionReceipt(walletClient, { hash });

	return {
		approvalHashes: [approvalTxHashToken0, approvalTxHashToken1],
		shipped: {
			sleeve: allocation.sleeve,
			hash,
			receipt,
			strategy,
		},
	};
}

export function generateAquaStrategySalt({
	liquidityProvision,
	makerNonce,
}: {
	liquidityProvision: LiquidityProvision;
	makerNonce: number;
}): bigint {
	const encoded = encodeAbiParameters(
		[
			{
				name: "liquidityProvision",
				type: "tuple[]",
				components: [
					{ name: "token", type: "address" },
					{ name: "amount", type: "uint256" },
				],
			},
			{ name: "makerNonce", type: "uint256" },
		],
		[
			liquidityProvision.map(({ token, amount }) => ({
				token: token.toString() as `0x${string}`,
				amount,
			})),
			BigInt(makerNonce),
		],
	);

	return BigInt.asUintN(64, hexToBigInt(keccak256(encoded)));
}

export function toLiquidityProvision(
	allocation: PairAllocation,
): LiquidityProvision {
	return [
		{
			token: new Address(allocation.legs[0].token.address),
			amount: allocation.legs[0].amount,
		},
		{
			token: new Address(allocation.legs[1].token.address),
			amount: allocation.legs[1].amount,
		},
	];
}

export type ShipAquaPortfolioInput = {
	walletClient: WalletClient;
	allocations: PairAllocation[];
};

export type ShipAquaPortfolioResult = {
	approvalHashes: Hex[];
	shipped: ShippedStrategy[];
};

export async function shipAquaPortfolio({
	walletClient,
	allocations,
}: ShipAquaPortfolioInput): Promise<ShipAquaPortfolioResult> {
	const approvalHashes: Hex[] = [];
	const shipped: ShippedStrategy[] = [];

	for (const allocation of allocations) {
		const result = await shipAquaStrategy({
			walletClient,
			allocation,
		});
		approvalHashes.push(...result.approvalHashes);
		shipped.push(result.shipped);
	}

	return {
		approvalHashes,
		shipped,
	};
}

export interface DockTarget {
	sleeve: PairAllocation["sleeve"]
	strategyHash: Hex
	tokens: Address[] | string[]
}

export interface DockAquaStrategyInput {
	walletClient: WalletClient
	target: DockTarget
	onStep?: (message: string) => void
}

export async function dockAquaStrategy({
	walletClient,
	target,
	onStep,
}: DockAquaStrategyInput): Promise<Hex> {
	const account = walletClient.account
	if (!account) throw new Error("walletClient account is required")

	const aquaRegistry = new AquaProtocolContract(AQUA_CONTRACT)
	const dockTx = aquaRegistry.dock({
		app: SWAP_VM_ROUTER,
		strategyHash: new HexString(target.strategyHash),
		tokens: target.tokens.map((token) => new Address(token.toString())),
	})

	onStep?.(`Confirm docking ${target.sleeve} strategy in your wallet…`)
	const hash = await walletClient.sendTransaction({
		account,
		chain: walletClient.chain,
		to: dockTx.to as `0x${string}`,
		data: dockTx.data as Hex,
		value: dockTx.value,
	})

	await waitForTransactionReceipt(walletClient, { hash })
	return hash
}

export interface UnshipInput {
	walletClient: WalletClient
	dockTargets: DockTarget[]
	allocations: PairAllocation[]
	onStep?: (message: string) => void
}

export interface UnshipResult {
	dockHashes: Hex[]
	approvalHashes: Hex[]
	shipped: ShippedStrategy[]
}

/**
 * Rebalance by docking existing Aqua strategies and shipping new target allocations.
 */
export async function unship({
	walletClient,
	dockTargets,
	allocations,
	onStep,
}: UnshipInput): Promise<UnshipResult> {
	const dockHashes: Hex[] = []
	for (const target of dockTargets) {
		onStep?.(`Docking ${target.sleeve} strategy…`)
		const hash = await dockAquaStrategy({
			walletClient,
			target,
			onStep,
		})
		dockHashes.push(hash)
	}

	const approvalHashes: Hex[] = []
	const shipped: ShippedStrategy[] = []

	for (const allocation of allocations) {
		const result = await shipAquaStrategy({
			walletClient,
			allocation,
			onStep,
		})
		approvalHashes.push(...result.approvalHashes)
		shipped.push(result.shipped)
	}

	return {
		dockHashes,
		approvalHashes,
		shipped,
	}
}

