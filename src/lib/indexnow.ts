// IndexNow: instant URL submission to Bing (and engines that share its index,
// like DuckDuckGo). No account needed; the key file in /public proves domain
// ownership. Google does not support IndexNow; Google discovery comes from the
// sitemap + Search Console instead.
const INDEXNOW_KEY = '4abc043f2825727d8875bd4ad9b94b07';
const HOST = 'www.stoop.house';

export async function pingIndexNow(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: HOST,
        key: INDEXNOW_KEY,
        keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`,
        urlList: urls.slice(0, 100)
      })
    });
  } catch (e) {
    // Indexing pings must never break the user-facing action.
    console.error('indexnow ping failed (non-fatal):', e);
  }
}
