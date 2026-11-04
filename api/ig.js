function cleanUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/&amp;/gi, "&").replace(/\\+/g, "").replace(/^["']+|["']+$/g, "").trim();
}

function isAvatarOrBadUrl(url) {
  if (!url || typeof url !== "string") return true;
  let d = url;
  try { d = decodeURIComponent(url); } catch (_) {}
  // 프로필 사진의 모든 해상도(s150x150, s320x320 등)와 특정 CDN 패턴 완벽 차단
  if (/t51\.2885-19/i.test(d)) return true;
  if (/profile_pic|s150x150|p150x150|150x150|s320x320|p320x320|320x320|static\.cdninstagram|rsrc\.php|\.mp4/i.test(d)) return true;
  return false;
}

function parseJsonMedia(obj) {
  let thumb = "";
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 10) return;
    if (!thumb) {
      const candidates = [
        node.cover_media?.cropped_image_version?.url,
        node.thumbnail_src, node.display_url, node.thumbnail_url, node.cover_url,
        ...(Array.isArray(node.image_versions2?.candidates) ? node.image_versions2.candidates.map(c => c?.url) : [])
      ];
      for (const c of candidates) {
        if (typeof c === "string" && !isAvatarOrBadUrl(c)) { thumb = cleanUrl(c); break; }
      }
    }
    for (const k of Object.keys(node)) {
      if (k === "owner" || k === "user" || k === "profile_pic_url") continue;
      if (node[k] && typeof node[k] === "object") walk(node[k], depth + 1);
    }
  }
  walk(obj, 0);
  return thumb;
}

function parseEmbedHtml(html) {
  let thumb = "";
  const ctxMatch = html.match(/contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (ctxMatch && ctxMatch[1]) {
    try {
      const unescaped = JSON.parse('"' + ctxMatch[1] + '"');
      const parsedThumb = parseJsonMedia(JSON.parse(unescaped));
      if (parsedThumb && !isAvatarOrBadUrl(parsedThumb)) thumb = parsedThumb;
    } catch (_) {}
  }
  const bodyOnly = html.replace(/<div[^>]+class="[^"]*Header[^"]*"[\s\S]*?<\/div>\s*<\/div>/i, "");
  if (!thumb) {
    const imgMatch = bodyOnly.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/i);
    if (imgMatch) {
      const srcM = imgMatch[0].match(/src="([^"]+)"/i);
      if (srcM && srcM[1] && !isAvatarOrBadUrl(srcM[1])) thumb = cleanUrl(srcM[1]);
    }
  }
  return thumb;
}

async function resolveIgData(code) {
  let thumb = "";
  try {
    const r = await fetch(`https://www.instagram.com/reel/${code}/embed/captioned/`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15", "Accept-Language": "ko-KR" }
    });
    if (r.ok) {
      const html = await r.text();
      const t = parseEmbedHtml(html);
      if (t && !isAvatarOrBadUrl(t)) thumb = t;
    }
  } catch (_) {}
  
  if (!thumb) {
    try {
      const jr = await fetch(`https://r.jina.ai/https://www.instagram.com/p/${code}/embed/captioned/`, { headers: { "Accept": "text/plain" } });
      if (jr.ok) {
        const jtxt = await jr.text();
        const re = /!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/gi;
        let m;
        while ((m = re.exec(jtxt)) !== null) {
          const c = cleanUrl(m[1]);
          if (!isAvatarOrBadUrl(c) && (c.includes("cdninstagram") || c.includes("fbcdn"))) { thumb = c; break; }
        }
      }
    } catch (_) {}
  }
  return thumb;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false });

  const thumb = await resolveIgData(code);
  
  // 핵심: 클라이언트 방어막 통과를 위한 &ig_thumb=1 꼬리표 필수 부여
  const weservUrl = (thumb && !isAvatarOrBadUrl(thumb))
    ? `https://images.weserv.nl/?url=${encodeURIComponent(thumb)}&w=640&h=640&fit=cover&output=jpg&ig_thumb=1`
    : "";

  return res.status(200).json({ ok: Boolean(weservUrl), code, thumb, weservThumb: weservUrl });
}
