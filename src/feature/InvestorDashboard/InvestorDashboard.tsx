"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import {
	type Address,
	createPublicClient,
	erc20Abi,
	formatUnits,
	http,
} from "viem"
import { strategyById } from "@/components/StrategyCard"
import { TokenIcon, TokenPair } from "@/components/TokenIcon"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import { LOCAL_FORK_RPC_URL, robinhoodFork } from "@/config"
import { TOKENIZED_STOCKS, TOKENS } from "@/constants"
import { useShippedPortfolio } from "@/hooks/useShippedPortfolio"
import { useWallet } from "@/hooks/useWallet"
import {
	buildPortfolioAllocations,
	computeSleeveDrift,
	DRIFTED_TOKEN_PRICES_USD,
	FIXED_TOKEN_PRICES_USD,
	PROFILE_WEIGHTS,
	REBALANCE_BAND,
	SLEEVE_LABELS,
	type TokenPricesUsd,
} from "@/lib/portfolio"
import type { ShipPortfolioResult } from "@/lib/ship"
import { getTokenDecimals } from "@/lib/tokens"
import { formatWalletError, getEthereumProvider, shortenAddress } from "@/lib/wallet"
import styles from "./InvestorDashboard.module.css"
import { rebalancePortfolio } from "./rebalance"

const TRACKED_TOKENS = [
	{ symbol: "USDG", name: "Global Dollar", address: TOKENS.USDG, decimals: 6 },
	{ symbol: "WETH", name: "Wrapped Ether", address: TOKENS.WETH, decimals: 18 },
	{ symbol: "1INCH", name: "1inch Token", address: TOKENS.ONEINCH, decimals: 18 },
	{ symbol: "TSLA", name: "Tesla Tokenized Stock", address: TOKENIZED_STOCKS.TSLA, decimals: 18 },
] as const

export function InvestorDashboard() {
	const { address, connect, isConnecting } = useWallet()
	const { result, isReady, setResult } = useShippedPortfolio(address)

	const [isDriftSimulated, setIsDriftSimulated] = useState(false)
	const [isRebalancing, setIsRebalancing] = useState(false)
	const [step, setStep] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [lastRebalanceResult, setLastRebalanceResult] = useState<ShipPortfolioResult | null>(null)
	const [walletBalances, setWalletBalances] = useState<Record<string, bigint>>({
		USDG: BigInt(0),
		WETH: BigInt(0),
		ONEINCH: BigInt(0),
		TSLA: BigInt(0),
	})

	useEffect(() => {
		const stored = localStorage.getItem("aqua-simulate-drift")
		if (stored === "true") setIsDriftSimulated(true)
	}, [])

	const fetchBalances = useCallback(async (targetAddress: Address) => {
		try {
			const client = createPublicClient({
				chain: robinhoodFork,
				transport: http(LOCAL_FORK_RPC_URL),
			})

			const [usdg, weth, oneinch, tsla] = await Promise.all([
				client.readContract({
					address: TOKENS.USDG,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [targetAddress],
				}),
				client.readContract({
					address: TOKENS.WETH,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [targetAddress],
				}),
				client.readContract({
					address: TOKENS.ONEINCH,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [targetAddress],
				}),
				client.readContract({
					address: TOKENIZED_STOCKS.TSLA,
					abi: erc20Abi,
					functionName: "balanceOf",
					args: [targetAddress],
				}),
			])

			setWalletBalances({
				USDG: usdg,
				WETH: weth,
				ONEINCH: oneinch,
				TSLA: tsla,
			})
		} catch {
			// Fork might not be running or address invalid
		}
	}, [])

	useEffect(() => {
		if (address) fetchBalances(address)
	}, [address, fetchBalances])

	function toggleDrift() {
		const next = !isDriftSimulated
		setIsDriftSimulated(next)
		localStorage.setItem("aqua-simulate-drift", String(next))
	}

	async function handleRebalance() {
		if (!result || isRebalancing || isConnecting) return

		setError(null)
		setIsRebalancing(true)
		setStep("Preparing rebalance…")

		try {
			let currentAddress = address
			if (!currentAddress) {
				setStep("Connect your wallet…")
				await connect()
				const provider = getEthereumProvider()
				const accounts = (await provider.request({
					method: "eth_requestAccounts",
				})) as string[]
				const account = accounts[0] as Address | undefined
				if (!account) throw new Error("Connect a wallet first")
				currentAddress = account
			}

			const activePrices = isDriftSimulated
				? DRIFTED_TOKEN_PRICES_USD
				: FIXED_TOKEN_PRICES_USD

			const updated = await rebalancePortfolio({
				currentResult: result,
				address: currentAddress,
				prices: activePrices,
				onStep: setStep,
			})

			setResult(updated)
			setLastRebalanceResult(updated)
			await fetchBalances(currentAddress)
		} catch (rebalanceError) {
			setError(formatWalletError(rebalanceError, "Failed to rebalance portfolio"))
		} finally {
			setIsRebalancing(false)
			setStep(null)
		}
	}

	if (!isReady) return null

	if (!address) {
		return (
			<Card className={styles.empty}>
				<CardHeader>
					<CardTitle>Connect your wallet</CardTitle>
					<CardDescription>
						Positions are shown for the connected maker address only.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						type="button"
						className={styles.cta}
						disabled={isConnecting}
						onClick={() => void connect()}
					>
						{isConnecting ? "Connecting…" : "Connect wallet"}
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!result) {
		return (
			<Card className={styles.empty}>
				<CardHeader>
					<CardTitle>No positions yet</CardTitle>
					<CardDescription>
						Deploy a strategy on Home with this wallet. Your sleeve amounts will
						show up here.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button asChild className={styles.cta}>
						<Link href="/">Choose a strategy</Link>
					</Button>
				</CardContent>
			</Card>
		)
	}

	const strategy = strategyById[result.profile]
	const activePrices: TokenPricesUsd = isDriftSimulated
		? DRIFTED_TOKEN_PRICES_USD
		: FIXED_TOKEN_PRICES_USD

	const shipPrices = result.prices ?? FIXED_TOKEN_PRICES_USD
	const weights = PROFILE_WEIGHTS[result.profile]

	const { allocations: initialAllocations } = buildPortfolioAllocations({
		totalUsd: result.totalUsd,
		weights,
		prices: shipPrices,
	})

	const driftResult = computeSleeveDrift({
		allocations: initialAllocations,
		prices: activePrices,
		weights,
	})

	const { allocations: targetAllocations } = buildPortfolioAllocations({
		totalUsd: driftResult.totalCurrentUsd,
		weights,
		prices: activePrices,
	})

	const neededAmounts: Record<string, bigint> = {
		USDG: BigInt(0),
		WETH: BigInt(0),
		ONEINCH: BigInt(0),
		TSLA: BigInt(0),
	}
	for (const allocation of targetAllocations) {
		for (const leg of allocation.legs) {
			const sym = leg.token.symbol
			if (neededAmounts[sym] !== undefined) neededAmounts[sym] += leg.amount
		}
	}

	return (
		<div className={styles.root}>
			<Card className={styles.summary}>
				<CardHeader>
					<CardTitle>{strategy.name} portfolio</CardTitle>
					<CardDescription>
						${driftResult.totalCurrentUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} current portfolio valuation across three Aqua XYC strategies for {shortenAddress(address)} (deployed with ${result.totalUsd.toLocaleString()} initial USD).
					</CardDescription>
				</CardHeader>
			</Card>

			{/* Prices & Drift Simulation */}
			<Card className={styles.pricesCard}>
				<CardHeader>
					<div className={styles.pricesHeaderRow}>
						<div>
							<CardTitle>Asset Prices</CardTitle>
							<CardDescription>
								Hardcoded reference prices for Robinhood fork assets and TSLA tokenized stock.
							</CardDescription>
						</div>
						<div className={styles.driftToggleWrap}>
							<button
								type="button"
								onClick={toggleDrift}
								className={`${styles.driftToggleButton} ${isDriftSimulated ? styles.driftToggleButtonActive : ""}`}
								aria-pressed={isDriftSimulated}
							>
								<span>{isDriftSimulated ? "Simulating TSLA Pump (+250%)" : "Simulate Price Drift"}</span>
								<span aria-hidden="true">{isDriftSimulated ? "▲" : "▶"}</span>
							</button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className={styles.pricesGrid}>
						{TRACKED_TOKENS.map((token) => {
							const price = activePrices[token.symbol === "1INCH" ? "ONEINCH" : (token.symbol as keyof TokenPricesUsd)]
							const isDrifted = token.symbol === "TSLA" && isDriftSimulated

							return (
								<div
									key={token.symbol}
									className={`${styles.priceItem} ${isDrifted ? styles.priceItemDrifted : ""}`}
								>
									<span className={styles.priceSymbol}>
										<TokenIcon symbol={token.symbol} size={16} />
										{token.symbol}
									</span>
									<span className={styles.priceValue}>${price.toLocaleString()}</span>
									{isDrifted ? (
										<span className={styles.priceTag}>+250% pump ($350 → $1,225)</span>
									) : (
										<span className={styles.pricesNote}>{token.name}</span>
									)}
								</div>
							)
						})}
					</div>
					<p className={styles.pricesNote}>
						Prices are preset for testing. Toggling price drift increases the TSLA price from $350 to $1,225 to illustrate the portfolio drift and the dock → ship rebalancing mechanism.
					</p>
				</CardContent>
			</Card>

			{/* Sleeves Grid */}
			<div className={styles.grid}>
				{initialAllocations.map((allocation) => {
					const sleeve = result.sleeves.find(
						(item) => item.sleeve === allocation.sleeve,
					)
					const targetPercent = Math.round(weights[allocation.sleeve] * 100)
					const driftInfo = driftResult.sleeves[allocation.sleeve]
					const currentPercent = Math.round(driftInfo.currentShare * 100)
					const driftPp = (driftInfo.drift * 100).toFixed(1)

					let badgeClass = styles.badgeBalanced
					let badgeText = `${currentPercent}% · Target on track`

					if (driftInfo.isOutsideBand) {
						if (driftInfo.drift > 0) {
							badgeClass = styles.badgeOver
							badgeText = `${currentPercent}% (+${driftPp}% Overweight)`
						} else {
							badgeClass = styles.badgeUnder
							badgeText = `${currentPercent}% (${driftPp}% Underweight)`
						}
					}

					return (
						<Card key={allocation.sleeve} className={styles.position}>
							<CardHeader>
								<div className={styles.positionHeader}>
									<CardTitle>
										<TokenPair
											pair={SLEEVE_LABELS[allocation.sleeve]}
											size={18}
										/>
									</CardTitle>
									<span className={`${styles.badge} ${badgeClass}`}>
										{badgeText}
									</span>
								</div>
								<CardDescription>
									Target: {targetPercent}% · Current value: ${driftInfo.currentUsd.toFixed(0)}
								</CardDescription>
							</CardHeader>
							<CardContent className={styles.amounts}>
								{allocation.legs.map((leg) => (
									<p key={leg.token.symbol}>
										<span>{formatTokenSymbol(leg.token.symbol)}</span>
										<strong>
											{formatAmount(leg.amount, leg.token.symbol)}
										</strong>
									</p>
								))}
								{sleeve?.strategyHash ? (
									<p className={styles.hash}>
										Strategy Hash{" "}
										<code title={sleeve.strategyHash}>
											{shortenAddress(sleeve.strategyHash)}
										</code>
									</p>
								) : null}
							</CardContent>
						</Card>
					)
				})}
			</div>

			{/* Rebalance Controller Card */}
			<Card className={styles.rebalanceCard}>
				<CardHeader>
					<CardTitle>Rebalance Controller</CardTitle>
					<CardDescription>
						Aqua strategies have immutable virtual balances. Rebalancing docks the live strategies back to the wallet and ships fresh target weights.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className={styles.rebalanceSummaryText}>
						{driftResult.needsRebalance ? (
							<strong>
								Drift is {(driftResult.maxDrift * 100).toFixed(1)}% (threshold band: {(REBALANCE_BAND * 100).toFixed(0)}%). Rebalance required to restore {strategy.name} target proportions of the new ${driftResult.totalCurrentUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} total.
							</strong>
						) : (
							<span>
								Portfolio is balanced within the {(REBALANCE_BAND * 100).toFixed(0)}% band. No rebalancing needed at current prices.
							</span>
						)}
					</p>

					<div className={styles.rebalanceGrid}>
						{targetAllocations.map((target) => (
							<div key={target.sleeve} className={styles.rebalanceTargetItem}>
								<span className={styles.rebalanceTargetLabel}>
									{SLEEVE_LABELS[target.sleeve]} Target
								</span>
								<span className={styles.rebalanceTargetValue}>
									${target.usdValue.toFixed(0)}
								</span>
								<span className={styles.rebalanceTargetShare}>
									Target: {Math.round(weights[target.sleeve] * 100)}% of ${driftResult.totalCurrentUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
								</span>
							</div>
						))}
					</div>

					<div className={styles.rebalanceActions}>
						{step ? <div className={styles.stepBox}>{step}</div> : null}
						{error ? <div className={styles.errorBox}>{error}</div> : null}

						{lastRebalanceResult ? (
							<div className={styles.successBox}>
								<strong>Rebalance executed successfully!</strong>
								{lastRebalanceResult.dockHashes?.length ? (
									<div>
										Dock transactions:
										<ul>
											{lastRebalanceResult.dockHashes.map((hash) => (
												<li key={hash}>
													<code>{hash}</code>
												</li>
											))}
										</ul>
									</div>
								) : null}
								<div>
									New strategies shipped:
									<ul>
										{lastRebalanceResult.sleeves.map((sleeve) => (
											<li key={sleeve.txHash}>
												{SLEEVE_LABELS[sleeve.sleeve]}: Tx <code>{sleeve.txHash}</code>
											</li>
										))}
									</ul>
								</div>
							</div>
						) : null}

						<Button
							type="button"
							onClick={handleRebalance}
							disabled={!driftResult.needsRebalance || isRebalancing}
							className={styles.rebalanceBtn}
						>
							{isRebalancing
								? "Rebalancing portfolio (dock → ship)…"
								: driftResult.needsRebalance
									? "Rebalance portfolio (dock → ship)"
									: "Portfolio is balanced (no rebalance needed)"}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Wallet Token Coverage Card */}
			<Card className={styles.coverageCard}>
				<CardHeader>
					<CardTitle>Maker Wallet Token Coverage</CardTitle>
					<CardDescription>
						Comparison of connected wallet balances vs amounts needed to ship target allocations.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<table className={styles.coverageTable}>
						<thead>
							<tr>
								<th>Token</th>
								<th>Needed for target re-ship</th>
								<th>In wallet ({address ? shortenAddress(address) : "Not connected"})</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{TRACKED_TOKENS.map((token) => {
								const sym = token.symbol === "1INCH" ? "ONEINCH" : token.symbol
								const needed = neededAmounts[sym] ?? BigInt(0)
								const inWallet = walletBalances[sym] ?? BigInt(0)
								const isCovered = inWallet >= needed

								return (
									<tr key={token.symbol}>
										<td>
											<span className={styles.tokenCell}>
												<TokenIcon symbol={token.symbol} size={18} />
												<strong>{token.symbol}</strong> ({token.name})
											</span>
										</td>
										<td>{formatAmount(needed, sym)}</td>
										<td>{address ? formatAmount(inWallet, sym) : "—"}</td>
										<td>
											{isCovered ? (
												<span className={styles.coverageStatusCovered}>Covered</span>
											) : (
												<span className={styles.coverageStatusShortfall}>Shortfall</span>
											)}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
					<p className={styles.coverageNote}>
						This demo demonstrates the Aqua <code>dock</code> → <code>ship</code> rebalance lifecycle. Without an intermediate swap of excess appreciated assets (e.g. TSLA), the maker wallet may have a shortfall in tokens requiring top-ups. Ensure test tokens are claimed on the fork if needed.
					</p>
				</CardContent>
			</Card>
		</div>
	)
}

function formatTokenSymbol(symbol: string) {
	return symbol === "ONEINCH" ? "1INCH" : symbol
}

function formatAmount(amount: bigint, symbol: string) {
	const value = Number(formatUnits(amount, getTokenDecimals(symbol)))
	return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
}
