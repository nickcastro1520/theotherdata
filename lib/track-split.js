// Splits the full track record (public/data/track-record.json, ~470KB) into:
//   track-summary.json  everything except per-stock monthly history (home, stock pages, tour, /track header)
//   track/TICKER.json   one stock's monthly backtest history, loaded lazily by /track
// The full file stays published as the raw download and for the digest.
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export function splitTrack(doc) {
  const perTicker = {};
  const tickers = {};
  for (const [tk, t] of Object.entries(doc.tickers || {})) {
    const { history = [], ...bt } = t.backtest || {};
    tickers[tk] = { ...t, backtest: { ...bt, historyCount: history.length } };
    perTicker[tk] = { ticker: tk, generatedAt: doc.generatedAt, primary: doc.primary, history };
  }
  return { summary: { ...doc, tickers }, perTicker };
}

export async function writeTrackSplit(doc, dataDir) {
  const { summary, perTicker } = splitTrack(doc);
  await mkdir(join(dataDir, "track"), { recursive: true });
  await writeFile(join(dataDir, "track-summary.json"), JSON.stringify(summary));
  for (const [tk, d] of Object.entries(perTicker)) await writeFile(join(dataDir, "track", `${tk}.json`), JSON.stringify(d));
  return { tickers: Object.keys(perTicker).length, summaryBytes: JSON.stringify(summary).length };
}
