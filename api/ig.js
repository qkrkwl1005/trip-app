const ALLOWED_ORIGINS = [
  "https://trip-app-psi-two.vercel.app",
  "https://qkrkwl1005.github.io",
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin / server-to-server / direct navigation
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin) ||
    /^capacitor:\/\//.test(origin)
  );
}

function applyCors(req, res) {
  const origin = req.headers?.origin || "";
  if (origin && !isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
    return false;
  }
  res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function cleanUrl(u) {
  if (!u) return "";
  return u
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\+/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function safeFromCodePoint(num) {
  if (!Number.isFinite(num) || num < 0 || num > 0x10ffff) return "";
  try {
    return String.fromCodePoint(num);
  } catch (_) {
    return "";
  }
}

function decodeHtmlEntities(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .trim();
}

function isGarbageIgCaption(text) {
  if (!text || typeof text !== "string") return true;
  const s = text.trim();
  if (s.length < 4) return true;
  if (/^(?:Instagram|Instagram\s*사진\s*및\s*동영상|Login|Log in|Sign up|Page Not Found|Error)$/i.test(s)) {
    return true;
  }
  if (
    /Create an account or log in to Instagram|Log in to Instagram|Welcome back to Instagram|계정을 만들거나 Instagram에 로그인|Instagram에 로그인|Sign up to see photos and videos|This page isn't available|페이지를 이용할 수 없습니다/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
}

function cleanMetaCaption(raw) {
  if (!raw || typeof raw !== "string") return "";
  let decoded = decodeHtmlEntities(raw);
  const mOnIg = decoded.match(/on Instagram:\s*["“]([\s\S]+?)["”]?$/i);
  if (mOnIg && mOnIg[1] && mOnIg[1].trim().length >= 4) {
    decoded = mOnIg[1].trim();
  } else {
    // Strip "N likes, M comments - user on Date: "caption"."
    const mLikes = decoded.match(
      /^[\d,.\sKkMm만천]+(?:likes?|좋아요)[^:]*:\s*["“]?([\s\S]+?)["”]?\s*\.?$/i
    );
    if (mLikes && mLikes[1] && mLikes[1].trim().length >= 4) {
      decoded = mLikes[1].trim();
    }
  }
  decoded = decoded.replace(/^["“]+|["”]+$/g, "").trim();
  return isGarbageIgCaption(decoded) ? "" : decoded;
}

function isAvatarOrBadUrl(url) {
  if (!url || typeof url !== "string") return true;
  let d = url;
  try {
    d = decodeURIComponent(url);
  } catch (_) {}
  if (/t51\.2885-19/i.test(d)) return true;
  if (
    /profile_pic|s150x150|p150x150|150x150|s320x320|p320x320|320x320|static\.cdninstagram|rsrc\.php|\.mp4/i.test(
      d
    )
  ) {
    return true;
  }
  return false;
}

function parseJsonMedia(obj) {
  let thumb = "";
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 10) return;
    if (!thumb) {
      const candidates = [
        node.cover_media?.cropped_image_version?.url,
        node.thumbnail_src,
        node.display_url,
        node.thumbnail_url,
        node.cover_url,
        node.display_src,
        node.image_url,
        node.picture,
        node.media?.display_url,
        node.media?.thumbnail_url,
        node.images?.standard_resolution?.url,
        ...(Array.isArray(node.image_versions2?.candidates)
          ? node.image_versions2.candidates.map((c) => c?.url)
          : []),
      ];
      for (const c of candidates) {
        if (typeof c === "string" && !isAvatarOrBadUrl(c)) {
          thumb = cleanUrl(c);
          break;
        }
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

function extractCaptionFromJson(obj) {
  if (!obj || typeof obj !== "object") return "";
  const direct =
    obj?.data?.caption?.text ||
    obj?.caption?.text ||
    obj?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    obj?.data?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    obj?.gql_data?.shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    obj?.gql_data?.xdt_shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    obj?.xdt_shortcode_media?.edge_media_to_caption?.edges?.[0]?.node?.text ||
    obj?.media?.caption?.edges?.[0]?.node?.text ||
    obj?.media?.caption?.text ||
    obj?.context?.media?.caption?.text ||
    obj?.context?.caption ||
    (typeof obj?.caption === "string" ? obj.caption : "") ||
    "";
  if (typeof direct === "string") {
    const trimmed = direct.trim();
    if (trimmed.length >= 4 && !isGarbageIgCaption(trimmed)) {
      return trimmed;
    }
  }
  return "";
}

function extractMeta(html, prop) {
  if (!html || typeof html !== "string") return "";
  const slice = html.slice(0, 100000);
  const re = /<meta\b[^>]+>/gi;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const tag = m[0];
    const isTarget = new RegExp(`(?:property|name)=["'](?:og:|twitter:)?${prop}["']`, "i").test(tag);
    if (isTarget) {
      const c = tag.match(/content=["']([^"']*)["']/i);
      if (c && c[1]) return c[1];
    }
  }
  return "";
}

function extractContextJson(html) {
  if (!html || typeof html !== "string") return null;
  const key = '"contextJSON"';
  const idx = html.indexOf(key);
  if (idx === -1) return null;
  const colon = html.indexOf(":", idx + key.length);
  if (colon === -1) return null;
  const quote = html.indexOf('"', colon);
  if (quote === -1 || quote - colon > 20) return null;

  let inEscape = false;
  let end = -1;
  const maxSearch = Math.min(html.length, quote + 200000);
  for (let i = quote + 1; i < maxSearch; i++) {
    const c = html[i];
    if (inEscape) {
      inEscape = false;
      continue;
    }
    if (c === "\\") {
      inEscape = true;
      continue;
    }
    if (c === '"') {
      end = i;
      break;
    }
  }
  if (end !== -1) {
    try {
      const rawString = html.slice(quote, end + 1);
      return JSON.parse(JSON.parse(rawString));
    } catch (_) {}
  }
  return null;
}

function isValidShortcode(code) {
  return (
    typeof code === "string" &&
    /^[A-Za-z0-9_-]{5,30}$/.test(code) &&
    !/^(?:audio|reel|reels|p|tv|share|explore|accounts|login)$/i.test(code)
  );
}

function extractShortcodeFromUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  const m = raw.match(
    /(?:instagram\.com|instagr\.am)\/(?:[A-Za-z0-9._]+\/)?(?:reel|reels|p|tv)\/([A-Za-z0-9_-]{5,30})/i
  );
  if (m && isValidShortcode(m[1])) return m[1];
  return "";
}

async function resolveShareUrl(rawUrl) {
  let current = String(rawUrl || "").trim();
  if (!/^https?:\/\/(?:www\.|m\.)?(?:instagram\.com|instagr\.am)\//i.test(current)) {
    return "";
  }
  const direct = extractShortcodeFromUrl(current);
  if (direct) return direct;

  for (let hop = 0; hop < 3; hop++) {
    const ctrl = new AbortController();
    const tm = setTimeout(() => ctrl.abort(), 2200);
    try {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4 like Mac OS X)",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
        signal: ctrl.signal,
      });
      clearTimeout(tm);
      const loc = res.headers.get("location");
      if (loc) {
        const nextUrl = loc.startsWith("http")
          ? loc
          : new URL(loc, current).toString();
        if (/\/accounts\/login/i.test(nextUrl)) return "";
        const found = extractShortcodeFromUrl(nextUrl);
        if (found) return found;
        current = nextUrl;
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        const canonical =
          text.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ||
          extractMeta(text, "url");
        const found = extractShortcodeFromUrl(canonical || "");
        if (found) return found;
      }
      break;
    } catch (_) {
      clearTimeout(tm);
      break;
    }
  }
  return "";
}

async function fetchTextTO(url, opts = {}, ms = 2800) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const finalUrl = res.url || "";
    if (!res.ok || /\/accounts\/login/i.test(finalUrl)) {
      clearTimeout(tm);
      return { ok: false, status: res.status, text: "" };
    }
    const text = await res.text();
    clearTimeout(tm);
    return { ok: true, status: res.status, text };
  } catch (_) {
    clearTimeout(tm);
    return { ok: false, status: 0, text: "" };
  }
}

function extractCaptionFromPage(docText, current) {
  if (current) return current;
  const ctx = extractContextJson(docText);
  const ctxCap = ctx ? extractCaptionFromJson(ctx) : "";
  if (ctxCap) return ctxCap;
  for (const prop of ["description", "title"]) {
    const cleaned = cleanMetaCaption(extractMeta(docText, prop));
    if (cleaned && cleaned.length >= 4) return cleaned;
  }
  return "";
}

function extractFallbackThumb(docText) {
  const ogImg = extractMeta(docText, "image");
  if (ogImg && !isAvatarOrBadUrl(ogImg)) {
    return cleanUrl(decodeHtmlEntities(ogImg));
  }
  const emi = docText.match(/class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/i);
  if (emi && emi[1] && !isAvatarOrBadUrl(emi[1])) {
    return cleanUrl(decodeHtmlEntities(emi[1]));
  }
  return "";
}

function extractThumbFromPage(docText, current) {
  if (current && !isAvatarOrBadUrl(current)) return current;
  const ctx = extractContextJson(docText);
  const ctxThumb = ctx ? parseJsonMedia(ctx) : "";
  if (ctxThumb && !isAvatarOrBadUrl(ctxThumb)) return ctxThumb;
  return extractFallbackThumb(docText);
}

async function resolveViaIgPages(code, initial) {
  const [resEmbed, resBot] = await Promise.all([
    fetchTextTO(
      `https://www.instagram.com/reel/${code}/embed/captioned/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4 like Mac OS X)",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      },
      2800
    ),
    fetchTextTO(
      `https://www.instagram.com/reel/${code}/`,
      {
        headers: {
          "User-Agent":
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8",
        },
      },
      2800
    ),
  ]);

  let result = { ...initial };
  for (const r of [resEmbed, resBot]) {
    if (!r.ok || !r.text) continue;
    result = {
      thumb: extractThumbFromPage(r.text, result.thumb),
      caption: extractCaptionFromPage(r.text, result.caption),
    };
    if (result.thumb && result.caption) break;
  }

  // Fallback for photo/carousel `/p/` posts if `/reel/` failed completely
  if (!result.thumb && !result.caption) {
    const resPost = await fetchTextTO(
      `https://www.instagram.com/p/${code}/embed/captioned/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4 like Mac OS X)",
          "Accept-Language": "ko-KR,ko;q=0.9",
        },
      },
      2200
    );
    if (resPost.ok && resPost.text) {
      result = {
        thumb: extractThumbFromPage(resPost.text, result.thumb),
        caption: extractCaptionFromPage(resPost.text, result.caption),
      };
    }
  }

  return result;
}

async function handler(req, res) {
  if (!applyCors(req, res)) {
    return res.status(403).json({ ok: false, error: "Forbidden origin" });
  }
  if (req.method === "OPTIONS") return res.status(200).end();

  let code = String(req.query.code || "").trim();
  const rawUrl = String(req.query.url || req.query.share || "").trim();

  if (!code && rawUrl) {
    code = await resolveShareUrl(rawUrl);
  }

  if (!isValidShortcode(code)) {
    return res.status(400).json({ ok: false, error: "Invalid or unresolved Instagram code" });
  }

  const { thumb, caption } = await resolveViaIgPages(code, { thumb: "", caption: "" });

  const weservUrl =
    thumb && !isAvatarOrBadUrl(thumb)
      ? `https://images.weserv.nl/?url=${encodeURIComponent(
          thumb
        )}&w=640&h=640&fit=cover&output=jpg&ig_cover=2`
      : "";

  const ok = Boolean(weservUrl || caption);
  if (ok) {
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
  }

  return res.status(200).json({
    ok,
    code,
    resolvedUrl: `https://www.instagram.com/reel/${code}/`,
    thumb,
    weservThumb: weservUrl,
    caption: caption || "",
  });
}

module.exports = handler;
