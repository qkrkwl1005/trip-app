function cleanUrl(u) {
  if (!u) return "";
  return u
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/\\+/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
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
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function cleanMetaCaption(raw) {
  if (!raw || typeof raw !== "string") return "";
  let decoded = decodeHtmlEntities(raw);
  const m = decoded.match(/on Instagram:\s*["“]([\s\S]+?)["”]?$/i);
  if (m && m[1] && m[1].trim().length >= 4) {
    decoded = m[1].trim();
  }
  decoded = decoded.replace(/^["“]+|["”]+$/g, "").trim();
  return decoded;
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
  )
    return true;
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
    obj?.context?.media?.caption?.text ||
    obj?.context?.caption ||
    (typeof obj?.caption === "string" ? obj.caption : "") ||
    "";
  if (typeof direct === "string" && direct.trim().length >= 6) {
    return direct.trim();
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

async function fetchTextTO(url, opts = {}, ms = 2200) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    clearTimeout(tm);
    return { ok: res.ok, status: res.status, text };
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
    if (cleaned && cleaned.length >= 6) return cleaned;
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
      2200
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
      2200
    ),
  ]);
  let result = { ...initial };
  for (const docText of [resEmbed.text, resBot.text].filter(Boolean)) {
    result = {
      thumb: extractThumbFromPage(docText, result.thumb),
      caption: extractCaptionFromPage(docText, result.caption),
    };
    if (result.thumb && result.caption) break;
  }
  return result;
}

async function resolveIgData(code) {
  return resolveViaIgPages(code, { thumb: "", caption: "" });
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const code = String(req.query.code || "").trim();

  if (!code) return res.status(400).json({ ok: false });

  const { thumb, caption } = await resolveIgData(code);

  const weservUrl =
    thumb && !isAvatarOrBadUrl(thumb)
      ? `https://images.weserv.nl/?url=${encodeURIComponent(
          thumb
        )}&w=640&h=640&fit=cover&output=jpg&ig_cover=2`
      : "";

  return res.status(200).json({
    ok: Boolean(weservUrl || caption),
    code,
    thumb,
    weservThumb: weservUrl,
    caption: caption || "",
  });
}

module.exports = handler;
