# Correlation scout report

Generated: 2026-10-06T17:42:41.664Z

Spearman rank correlation on period returns (weekly or monthly). Lead 0–2/3 periods tested (signal leading price). Prices from Tiingo when keyed; public series from FRED/EIA/Wikipedia/PyPI. Educational scan — correlation ≠ causation; multiple-testing risk is real.

Scanned 125 pairings. Failures: 2.

## Top pairings by |Spearman ρ|

| Signal | Target | ρ (Spearman) | Lead | n | Window | Spurious risk | Wireable |
|---|---|---:|---:|---:|---|---|---|
| Brent crude oil price | Energy sector (XLE) | 0.658 | 0 | 128 | 2024-W17 → 2026-W40 | high | yes |
| VIX volatility index | Tech sector (XLK) | -0.651 | 0 | 129 | 2024-W17 → 2026-W41 | moderate | yes |
| VIX volatility index | Consumer discretionary (XLY) | -0.645 | 0 | 129 | 2024-W17 → 2026-W41 | moderate | yes |
| Brent crude oil price | XOM | 0.597 | 0 | 128 | 2024-W17 → 2026-W40 | high | yes |
| U.S. high-yield credit spread | Consumer discretionary (XLY) | -0.594 | 0 | 129 | 2024-W17 → 2026-W41 | moderate | yes |
| VIX volatility index | AMZN | -0.568 | 0 | 129 | 2024-W17 → 2026-W41 | moderate | yes |
| U.S. unemployment rate | ABNB | -0.523 | 1 | 28 | 2024-05 → 2026-09 | moderate | yes |
| Building permits | UNP | 0.515 | 0 | 28 | 2024-05 → 2026-08 | moderate | yes |
| Air freight revenue ton-miles (index) | Consumer discretionary (XLY) | -0.492 | 0 | 27 | 2024-05 → 2026-07 | moderate | yes |
| Advance retail sales | Consumer discretionary (XLY) | 0.489 | 2 | 28 | 2024-05 → 2026-08 | moderate | yes |
| Advance retail sales | DIS | 0.479 | 2 | 28 | 2024-05 → 2026-08 | moderate | yes |
| Corrugated box PPI | HD | 0.47 | 1 | 28 | 2024-05 → 2026-08 | moderate | yes |
| Air freight revenue ton-miles (index) | AMZN | -0.457 | 0 | 27 | 2024-05 → 2026-07 | moderate | yes |
| VIX volatility index | NVDA | -0.455 | 0 | 129 | 2024-W17 → 2026-W41 | moderate | yes |
| Advance retail sales | WMT | -0.45 | 0 | 28 | 2024-05 → 2026-08 | moderate | yes |

## Shortlist for product (plausible + wireable)

### Brent crude oil price → Energy sector (XLE)
- Spearman ρ=0.658 (Pearson 0.56), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Global oil benchmark; complements WTI for integrated oils and jet-fuel costs.
- Polarity hint 0: agrees=null; spurious risk=high
- Source: fred {"series":"DCOILBRENTEU","years":5}

### VIX volatility index → Tech sector (XLK)
- Spearman ρ=-0.651 (Pearson -0.71), lead=0 weekly periods, n=129, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### VIX volatility index → Consumer discretionary (XLY)
- Spearman ρ=-0.645 (Pearson -0.671), lead=0 weekly periods, n=129, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### Brent crude oil price → XOM
- Spearman ρ=0.597 (Pearson 0.551), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Global oil benchmark; complements WTI for integrated oils and jet-fuel costs.
- Polarity hint 0: agrees=null; spurious risk=high
- Source: fred {"series":"DCOILBRENTEU","years":5}

### U.S. high-yield credit spread → Consumer discretionary (XLY)
- Spearman ρ=-0.594 (Pearson -0.608), lead=0 weekly periods, n=129, p≈0
- Why it might make sense: Wider junk spreads = tighter financial conditions; historically tough for discretionary and growth.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"BAMLH0A0HYM2","years":5}

### VIX volatility index → AMZN
- Spearman ρ=-0.568 (Pearson -0.57), lead=0 weekly periods, n=129, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### U.S. unemployment rate → ABNB
- Spearman ρ=-0.523 (Pearson -0.458), lead=1 monthly periods, n=28, p≈0.0086
- Why it might make sense: Labor-market soft patches tend to hit discretionary spending and travel.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"UNRATE","years":5}

### Building permits → UNP
- Spearman ρ=0.515 (Pearson 0.557), lead=0 monthly periods, n=28, p≈0.0006
- Why it might make sense: Forward-looking housing activity (permits lead starts); relevant for HD and freight.
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"PERMIT","years":5}

### Air freight revenue ton-miles (index) → Consumer discretionary (XLY)
- Spearman ρ=-0.492 (Pearson -0.414), lead=0 monthly periods, n=27, p≈0.0231
- Why it might make sense: Express air cargo often leads goods demand and high-value electronics shipping.
- Polarity hint 1: agrees=false; spurious risk=moderate
- Source: fred {"series":"TSIFRGHT","years":5}

### Advance retail sales → Consumer discretionary (XLY)
- Spearman ρ=0.489 (Pearson 0.474), lead=2 monthly periods, n=28, p≈0.006
- Why it might make sense: Headline consumer spending print that moves retailers and payment/e-commerce names.
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"RSAFS","years":5}

### Advance retail sales → DIS
- Spearman ρ=0.479 (Pearson 0.455), lead=2 monthly periods, n=28, p≈0.0091
- Why it might make sense: Headline consumer spending print that moves retailers and payment/e-commerce names.
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"RSAFS","years":5}

### Corrugated box PPI → HD
- Spearman ρ=0.47 (Pearson 0.435), lead=1 monthly periods, n=28, p≈0.0138
- Why it might make sense: Packaging prices as e-commerce/goods-flow proxy (already on AMZN; scout vs WMT/HD).
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"PCU322211322211","years":5}

## Fetch failures
- elec-power: HTTP 404 from fred.stlouisfed.org
- gas-stocks: HTTP 404 from fred.stlouisfed.org