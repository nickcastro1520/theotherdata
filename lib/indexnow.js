// IndexNow: tell Bing, Yandex, Seznam, Naver etc. which URLs exist/changed. Free, no account.
export const INDEXNOW_KEY = "2ab9db5b9e73b4a85684befe3f4fc983";
export const HOST = "theotherdata.com";
export const ENDPOINT = "https://api.indexnow.org/indexnow";
export const MAX_URLS = 10000;

export function sitemapUrls(xml) {
  const out = new Set();
  for (const m of String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, "&"));
      if (u.hostname === HOST && u.protocol === "https:") out.add(u.href);
    } catch {}
  }
  return [...out];
}

export function buildPayload(urls) {
  return {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
    urlList: [...new Set(urls)].slice(0, MAX_URLS),
  };
}
