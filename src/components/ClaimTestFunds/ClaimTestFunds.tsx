"use client";

import { useState } from "react";
import type { Address } from "viem";
import { ImportTokens } from "@/components/ForkWalletActions";
import { TokenIcon } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import { FAUCET_DROPS } from "@/config";
import { fundTaker } from "@/feature/TakerSwap/api";
import { useWallet } from "@/hooks/useWallet";
import {
	ensureRobinhoodNetwork,
	getEthereumProvider,
} from "@/lib/wallet";
import styles from "./ClaimTestFunds.module.css";

export function ClaimTestFunds() {
	const { address, isConnecting, connect } = useWallet();
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function handleClaim() {
		if (busy || isConnecting) return;

		setError(null);
		setStatus(null);
		setBusy(true);

		try {
			if (!address) await connect();

			const provider = getEthereumProvider();
			await ensureRobinhoodNetwork(provider);
			const accounts = (await provider.request({
				method: "eth_requestAccounts",
			})) as string[];
			const account = accounts[0] as Address | undefined;
			if (!account) throw new Error("Connect a wallet first");

			setStatus("Sending test funds…");
			await fundTaker(account);
			setStatus("Test funds sent. Check your wallet balances.");
		} catch (claimError) {
			setStatus(null);
			setError(
				claimError instanceof Error
					? claimError.message
					: "Failed to send test funds",
			);
		} finally {
			setBusy(false);
		}
	}

	return (
		<aside className={styles.card} aria-labelledby="claim-funds-title">
			<h2 id="claim-funds-title" className={styles.title}>
				Step 2 - Claim test tokens
			</h2>
			<p className={styles.body}>
				Get test funds on the Robinhood fork. This sends:
			</p>
			<ul className={styles.list}>
				{FAUCET_DROPS.map((drop) => (
					<li key={drop.symbol} className={styles.listItem}>
						<TokenIcon symbol={drop.symbol} size={18} />
						{drop.amount} {drop.symbol}
					</li>
				))}
			</ul>
			<Button
				type="button"
				className={styles.button}
				disabled={busy || isConnecting}
				onClick={handleClaim}
			>
				{busy || isConnecting ? "Funding…" : "Get test funds"}
			</Button>
			{status ? (
				<p className={styles.status} aria-live="polite">
					{status}
				</p>
			) : null}
			{error ? (
				<p className={styles.error} role="alert">
					{error}
				</p>
			) : null}
			<div className={styles.import}>
				<ImportTokens />
			</div>
		</aside>
	);
}
