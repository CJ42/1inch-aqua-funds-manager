"use client";

import { useState } from "react";
import { TokenIcon } from "@/components/TokenIcon";
import { Button } from "@/components/ui/button";
import { TOKENIZED_STOCKS, TOKENS } from "@/constants";
import { getTokenDecimals } from "@/lib/tokens";
import {
	formatWalletError,
	getEthereumProvider,
	watchToken,
} from "@/lib/wallet";
import styles from "./ForkWalletActions.module.css";

const COMMON_TOKENS = [
	{ address: TOKENS.USDG, symbol: "USDG" },
	{ address: TOKENS.WETH, symbol: "WETH" },
	{ address: TOKENS.ONEINCH, symbol: "1INCH" },
	{ address: TOKENIZED_STOCKS.TSLA, symbol: "TSLA" },
] as const;

type ImportTokensProps = {
	align?: "start" | "end";
};

export function ImportTokens({ align = "start" }: ImportTokensProps) {
	const [busy, setBusy] = useState<string | null>(null);
	const [status, setStatus] = useState<string | null>(null);

	async function importToken(symbol: string, address: string) {
		if (busy) return;
		setBusy(symbol);
		setStatus(null);

		try {
			const wasAdded = await watchToken(getEthereumProvider(), {
				address,
				symbol,
				decimals: getTokenDecimals(symbol),
			});

			setStatus(
				wasAdded === false
					? `${symbol} import was cancelled.`
					: `${symbol} sent to MetaMask. Zero-balance tokens stay hidden until you unhide them.`,
			);
		} catch (error) {
			setStatus(formatWalletError(error, `Could not import ${symbol}.`));
		} finally {
			setBusy(null);
		}
	}

	return (
		<div
			className={`${styles.tokens} ${align === "end" ? styles.tokensEnd : ""}`}
		>
			<p className={styles.tokensLabel}>Import tokens</p>
			<div className={styles.tokenRow}>
				{COMMON_TOKENS.map((token) => (
					<Button
						key={token.symbol}
						type="button"
						variant="outline"
						size="sm"
						className={styles.token}
						disabled={busy !== null}
						title={`Import ${token.symbol} to your wallet`}
						onClick={() => importToken(token.symbol, token.address)}
					>
						<TokenIcon symbol={token.symbol} size={16} />
						{busy === token.symbol ? "…" : token.symbol}
					</Button>
				))}
			</div>
			{status ? (
				<p className={styles.status} role="status">
					{status}
				</p>
			) : null}
		</div>
	);
}
