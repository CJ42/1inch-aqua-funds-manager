import Image from "next/image";
import oneinchLogo from "@/img/1inch.png";
import teslaLogo from "@/img/tesla.png";
import usdgLogo from "@/img/usdg.png";
import wethLogo from "@/img/weth.png";
import styles from "./TokenIcon.module.css";

// ETH intentionally reuses the WETH mark for the faucet list.
const TOKEN_LOGOS = {
	USDG: usdgLogo,
	WETH: wethLogo,
	ETH: wethLogo,
	"1INCH": oneinchLogo,
	ONEINCH: oneinchLogo,
	TSLA: teslaLogo,
} as const;

type TokenIconProps = {
	symbol: string;
	size?: number;
};

export function TokenIcon({ symbol, size = 20 }: TokenIconProps) {
	const logo = TOKEN_LOGOS[symbol as keyof typeof TOKEN_LOGOS];
	if (!logo) return null;

	return (
		<Image
			src={logo}
			alt={`${symbol} logo`}
			width={size}
			height={size}
			className={styles.icon}
		/>
	);
}

type TokenPairProps = {
	/** Pair label such as "USDG / WETH" — icons are derived from the symbols. */
	pair: string;
	size?: number;
};

export function TokenPair({ pair, size = 20 }: TokenPairProps) {
	const symbols = pair.split(" / ");

	return (
		<span className={styles.pair}>
			<span className={styles.icons}>
				{symbols.map((symbol) => (
					<TokenIcon key={symbol} symbol={symbol} size={size} />
				))}
			</span>
			{pair}
		</span>
	);
}
