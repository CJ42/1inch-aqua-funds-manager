"use client";

import { useState } from "react";
import {
	type Address,
	createPublicClient,
	createWalletClient,
	custom,
	erc20Abi,
	fallback,
	formatUnits,
	type Hex,
	http,
	parseUnits,
} from "viem";
import { TokenPair } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { robinhoodFork, SWAP_VM_ROUTER } from "@/config";
import { useWallet } from "@/hooks/useWallet";
import {
	buildTakerQuoteTx,
	buildTakerSwapTx,
	type DecodedTakerSwap,
	decodeQuoteResult,
	decodeTakerSwapReceipt,
	TAKER_TOKEN_IN,
	type TakerSwapQuote,
} from "@/lib/swap";
import {
	ensureRobinhoodNetwork,
	getEthereumProvider,
	shortenAddress,
} from "@/lib/wallet";
import styles from "./TakerSwap.module.css";

type TakerSwapPanelProps = {
	strategy: Hex;
	strategyHash: Hex | null;
	pairLabel?: string;
	canSwap?: boolean;
};

type SwapResultView = {
	txHash: Hex;
	quote: TakerSwapQuote;
	decoded: DecodedTakerSwap;
};

export function TakerSwapPanel({
	strategy,
	strategyHash,
	pairLabel = "USDG / WETH",
	canSwap = true,
}: TakerSwapPanelProps) {
	const { address: taker, isConnecting, connect } = useWallet();
	const [amountInStr, setAmountInStr] = useState("10");
	const [quote, setQuote] = useState<TakerSwapQuote | null>(null);
	const [result, setResult] = useState<SwapResultView | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);
	const [busyAction, setBusyAction] = useState<"swap" | null>(null);

	const isBusy = busyAction !== null || isConnecting;

	async function handleConnect() {
		if (isBusy) return;

		setError(null);
		try {
			await connect();
			setStatus("Wallet connected");
		} catch (connectError) {
			setStatus(null);
			setError(
				connectError instanceof Error
					? connectError.message
					: "Failed to connect wallet",
			);
		}
	}

	async function handleSwap() {
		if (isBusy || !canSwap) return;
		if (!taker) {
			setError("Connect a wallet first");
			return;
		}

		setError(null);

		let amountIn: bigint;
		try {
			amountIn = parseUnits(amountInStr, 6);
		} catch {
			setError("Enter a valid USDG amount");
			return;
		}
		if (amountIn <= BigInt(0)) {
			setError("Amount must be a positive number");
			return;
		}

		setResult(null);
		setBusyAction("swap");

		try {
			const provider = getEthereumProvider();
			await ensureRobinhoodNetwork(provider);

			const walletClient = createWalletClient({
				account: taker,
				chain: robinhoodFork,
				transport: custom(provider),
			});
			const publicClient = createPublicClient({
				chain: robinhoodFork,
				transport: http(robinhoodFork.rpcUrls.default.http[0]),
			});

			setStatus(`Quoting ${amountInStr} USDG → WETH against ${pairLabel}…`);
			const quoteTx = buildTakerQuoteTx({ strategy, amountIn });
			const simulation = await publicClient.call({
				account: taker,
				to: quoteTx.to,
				data: quoteTx.data,
			});
			if (!simulation.data) throw new Error("SwapVM quote returned empty data");

			const quoted = decodeQuoteResult(simulation.data);
			setQuote(quoted);

			setStatus("Approve USDG for the AquaSwapVMRouter in MetaMask…");
			const approveHash = await walletClient.writeContract({
				address: TAKER_TOKEN_IN,
				abi: erc20Abi,
				functionName: "approve",
				args: [SWAP_VM_ROUTER.toString() as Address, amountIn],
				account: taker,
				chain: robinhoodFork,
			});
			await publicClient.waitForTransactionReceipt({ hash: approveHash });

			setStatus("Confirm the SwapVM swap in MetaMask…");
			const swapTx = buildTakerSwapTx({
				strategy,
				amountIn,
				minAmountOut: quoted.minAmountOut,
			});
			const swapHash = await walletClient.sendTransaction({
				account: taker,
				chain: robinhoodFork,
				to: swapTx.to,
				data: swapTx.data,
				value: swapTx.value,
			});
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: swapHash,
			});

			const decoded = decodeTakerSwapReceipt(receipt);
			setResult({
				txHash: swapHash,
				quote: quoted,
				decoded,
			});
			setStatus(null);
		} catch (swapError) {
			setStatus(null);
			setError(
				swapError instanceof Error
					? swapError.message
					: "Failed to execute taker swap",
			);
		} finally {
			setBusyAction(null);
		}
	}

	return (
		<Card className={styles.card}>
			<CardHeader>
				<CardTitle className={styles.cardTitle}>
					Swap <TokenPair pair={pairLabel} size={20} />
				</CardTitle>
				<CardDescription>
					{canSwap
						? `Claim test funds on Home, then swap ${amountInStr || "…"} USDG → WETH.`
						: "This route is listed from the shipped SwapVM strategy. Live swap is only wired for USDG / WETH right now."}
				</CardDescription>
			</CardHeader>
			<CardContent className={styles.content}>
				<div className={styles.amountField}>
					<label className={styles.amountLabel} htmlFor="taker-amount-in">
						Amount in (USDG)
					</label>
					<Input
						id="taker-amount-in"
						type="number"
						min={0}
						step="any"
						value={amountInStr}
						disabled={isBusy || !canSwap}
						onChange={(event) => setAmountInStr(event.target.value)}
					/>
				</div>
				{strategyHash ? (
					<p>
						Strategy hash{" "}
						<code title={strategyHash}>{shortenAddress(strategyHash)}</code>
					</p>
				) : null}
				{taker ? (
					<p>
						Connected <code title={taker}>{shortenAddress(taker)}</code>
					</p>
				) : (
					<p>Wallet not connected</p>
				)}
				{quote ? (
					<p>
						Quoted out: {formatUnits(quote.amountOut, 18)} WETH (min{" "}
						{formatUnits(quote.minAmountOut, 18)})
					</p>
				) : null}

				{result ? (
					<div className={styles.result}>
						<p>
							Swap tx{" "}
							<code title={result.txHash}>{shortenAddress(result.txHash)}</code>
						</p>
						{result.decoded.swapped ? (
							<p>{result.decoded.swapped.message}</p>
						) : null}
						<ul>
							{result.decoded.pulled.map((event) => (
								<li key={`pulled-${event.token}-${event.amount}`}>
									{event.message}
								</li>
							))}
							{result.decoded.pushed.map((event) => (
								<li key={`pushed-${event.token}-${event.amount}`}>
									{event.message}
								</li>
							))}
							{result.decoded.transfers.map((event) => (
								<li
									key={`${event.token}-${event.from}-${event.to}-${event.amount}`}
								>
									{event.message}
								</li>
							))}
						</ul>
					</div>
				) : null}

				{status ? (
					<p className={styles.progress} aria-live="polite">
						{status}
					</p>
				) : null}
				{error ? (
					<p className={styles.error} role="alert">
						{error}
					</p>
				) : null}
			</CardContent>
			<CardFooter>
				<div className={styles.actions}>
					{taker ? null : (
						<Button
							type="button"
							variant="outline"
							className={styles.secondaryButton}
							disabled={isBusy}
							onClick={handleConnect}
						>
							{isConnecting ? "Connecting…" : "Connect wallet"}
						</Button>
					)}
					<Button
						type="button"
						className={styles.button}
						disabled={isBusy || !taker || !canSwap}
						onClick={handleSwap}
					>
						{busyAction === "swap"
							? "Swapping…"
							: `Swap ${amountInStr || "…"} USDG → WETH`}
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
