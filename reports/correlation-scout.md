# Correlation scout report

Generated: 2026-11-01T17:09:37.974Z

Spearman rank correlation on period returns (weekly or monthly). Lead 0–2/3 periods tested (signal leading price). Prices from Tiingo when keyed; public series from FRED/EIA/Wikipedia/PyPI. Educational scan — correlation ≠ causation; multiple-testing risk is real.

Scanned 178 pairings. Failures: 2.

## Top pairings by |Spearman ρ|

| Signal | Target | ρ (Spearman) | Lead | n | Window | Spurious risk | Wireable |
|---|---|---:|---:|---:|---|---|---|
| VIX volatility index | Consumer discretionary (XLY) | -0.64 | 0 | 128 | 2024-W21 → 2026-W44 | moderate | yes |
| VIX volatility index | Tech sector (XLK) | -0.637 | 0 | 128 | 2024-W21 → 2026-W44 | moderate | yes |
| Advance retail sales | COST | -0.633 | 0 | 28 | 2024-06 → 2026-09 | high | yes |
| Brent crude oil price | Energy sector (XLE) | 0.606 | 0 | 128 | 2024-W21 → 2026-W44 | high | yes |
| U.S. high-yield credit spread | Consumer discretionary (XLY) | -0.582 | 0 | 128 | 2024-W21 → 2026-W44 | moderate | yes |
| Brent crude oil price | XOM | 0.559 | 0 | 128 | 2024-W21 → 2026-W44 | high | yes |
| VIX volatility index | AMZN | -0.552 | 0 | 128 | 2024-W21 → 2026-W44 | moderate | yes |
| U.S. unemployment rate | ABNB | -0.54 | 1 | 27 | 2024-06 → 2026-09 | moderate | yes |
| Advance retail sales | Consumer discretionary (XLY) | 0.526 | 2 | 28 | 2024-06 → 2026-09 | moderate | yes |
| Food services & drinking places sales | DIS | 0.524 | 2 | 27 | 2024-06 → 2026-08 | moderate | yes |
| Air freight revenue ton-miles (index) | AMZN | -0.521 | 0 | 27 | 2024-06 → 2026-08 | moderate | yes |
| Advance retail sales | WMT | -0.506 | 0 | 28 | 2024-06 → 2026-09 | moderate | yes |
| Air freight revenue ton-miles (index) | AAPL | -0.492 | 0 | 27 | 2024-06 → 2026-08 | moderate | yes |
| Building permits | UNP | 0.489 | 0 | 28 | 2024-06 → 2026-09 | moderate | yes |
| Consumer price index | MCD | -0.482 | 0 | 27 | 2024-06 → 2026-09 | moderate | yes |

## Shortlist for product (plausible + wireable)

### VIX volatility index → Consumer discretionary (XLY)
- Spearman ρ=-0.64 (Pearson -0.663), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### VIX volatility index → Tech sector (XLK)
- Spearman ρ=-0.637 (Pearson -0.708), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### Brent crude oil price → Energy sector (XLE)
- Spearman ρ=0.606 (Pearson 0.52), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Global oil benchmark; complements WTI for integrated oils and jet-fuel costs.
- Polarity hint 0: agrees=null; spurious risk=high
- Source: fred {"series":"DCOILBRENTEU","years":5}

### U.S. high-yield credit spread → Consumer discretionary (XLY)
- Spearman ρ=-0.582 (Pearson -0.601), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Wider junk spreads = tighter financial conditions; historically tough for discretionary and growth.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"BAMLH0A0HYM2","years":5}

### Brent crude oil price → XOM
- Spearman ρ=0.559 (Pearson 0.519), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Global oil benchmark; complements WTI for integrated oils and jet-fuel costs.
- Polarity hint 0: agrees=null; spurious risk=high
- Source: fred {"series":"DCOILBRENTEU","years":5}

### VIX volatility index → AMZN
- Spearman ρ=-0.552 (Pearson -0.567), lead=0 weekly periods, n=128, p≈0
- Why it might make sense: Risk-off gauge; often moves opposite high-beta growth and crypto-adjacent names.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"VIXCLS","years":5}

### U.S. unemployment rate → ABNB
- Spearman ρ=-0.54 (Pearson -0.47), lead=1 monthly periods, n=27, p≈0.0077
- Why it might make sense: Labor-market soft patches tend to hit discretionary spending and travel.
- Polarity hint -1: agrees=true; spurious risk=moderate
- Source: fred {"series":"UNRATE","years":5}

### Advance retail sales → Consumer discretionary (XLY)
- Spearman ρ=0.526 (Pearson 0.505), lead=2 monthly periods, n=28, p≈0.0029
- Why it might make sense: Headline consumer spending print that moves retailers and payment/e-commerce names.
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"RSAFS","years":5}

### Food services & drinking places sales → DIS
- Spearman ρ=0.524 (Pearson 0.666), lead=2 monthly periods, n=27, p≈0
- Why it might make sense: Eating-out spend — direct for restaurant names, soft read on discretionary mood.
- Polarity hint 1: agrees=true; spurious risk=moderate
- Source: fred {"series":"MRTSSM722USS","years":5}

### Air freight revenue ton-miles (index) → AMZN
- Spearman ρ=-0.521 (Pearson -0.473), lead=0 monthly periods, n=27, p≈0.0073
- Why it might make sense: Express air cargo often leads goods demand and high-value electronics shipping.
- Polarity hint 1: agrees=false; spurious risk=moderate
- Source: fred {"series":"TSIFRGHT","years":5}

### Advance retail sales → WMT
- Spearman ρ=-0.506 (Pearson -0.425), lead=0 monthly periods, n=28, p≈0.0166
- Why it might make sense: Headline consumer spending print that moves retailers and payment/e-commerce names.
- Polarity hint 1: agrees=false; spurious risk=moderate
- Source: fred {"series":"RSAFS","years":5}

### Air freight revenue ton-miles (index) → AAPL
- Spearman ρ=-0.492 (Pearson -0.537), lead=0 monthly periods, n=27, p≈0.0014
- Why it might make sense: Express air cargo often leads goods demand and high-value electronics shipping.
- Polarity hint 1: agrees=false; spurious risk=moderate
- Source: fred {"series":"TSIFRGHT","years":5}

## Fetch failures
- elec-power: HTTP 404 from fred.stlouisfed.org
- gas-stocks: HTTP 404 from fred.stlouisfed.org