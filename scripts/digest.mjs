// Weekly digest builder.
//   node scripts/digest.mjs                 -> public/data/digest.json (run by the refresh workflow)
//   node scripts/digest.mjs --preview       -> also reports/digest-preview.html and .txt
//   node scripts/digest.mjs --send-test you@example.com
//        -> emails ONE copy to that address (needs RESEND_API_KEY in the environment; never run automatically)
import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDigestData, loadDigestInputs, renderDigestHtml, renderDigestText } from "../lib/digest.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const data = buildDigestData(await loadDigestInputs(join(ROOT, "public", "data")));
if (!data) { console.error("digest: no qualifying signals; digest.json left unchanged"); process.exit(0); }
await writeFile(join(ROOT, "public", "data", "digest.json"), JSON.stringify(data, null, 1));
console.log(`digest ${data.issueId}: ${data.picks.length} picks · story: ${data.story.ticker} ${data.story.signal}`);

if (args.includes("--preview")) {
  await mkdir(join(ROOT, "reports"), { recursive: true });
  await writeFile(join(ROOT, "reports", "digest-preview.html"), renderDigestHtml(data, { unsubscribeUrl: "https://theotherdata.com/api/unsubscribe?token=PREVIEW", webUrl: "https://theotherdata.com/digest" }));
  await writeFile(join(ROOT, "reports", "digest-preview.txt"), renderDigestText(data, { unsubscribeUrl: "https://theotherdata.com/api/unsubscribe?token=PREVIEW" }));
  console.log("wrote reports/digest-preview.html and .txt");
}

const ti = args.indexOf("--send-test");
if (ti >= 0) {
  const to = args[ti + 1];
  if (!process.env.RESEND_API_KEY) { console.error("--send-test needs RESEND_API_KEY"); process.exit(1); }
  const { sendEmail } = await import("../lib/mailer.js");
  await sendEmail({ to, subject: `[test] ${data.subject}`, html: renderDigestHtml(data), text: renderDigestText(data) });
  console.log("test email sent");
}
