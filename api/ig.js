function cleanUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/\\+/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function stripMetaNoise(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/["”']?\s*-\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일[,\s]*「いいね！」[\s\S]*$/i, "")
    .replace(/「いいね！」\s*[\d.,]+[KMB만천]?件[\s\S]*$/i, "")
    .replace(/좋아요\s*[\d.,]+[만천개]*[,\s]*댓글\s*[\d.,]+[만천개]*[\s\S]*$/i, "")
    .replace(/^[\s\S]{1,140}?(?:likes?|좋아요|いいね！|コメント)[^:："]*[:：]\s*["“]?/i, "")
    .replace(/^["“]+|["”]+$/g, "")
    .trim();
}

function parseEmbedHtml(html) {
  let thumb = "";
  let caption = "";
  if (!html || typeof html !== "string") return { thumb, caption };

  // 1) EmbeddedMediaImage 태그에서 추출
  const imgTagMatch = html.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/i)
                   || html.match(/<img[^>]+EmbeddedMediaImage[^>]*>/i);
  if (imgTagMatch) {
    const srcMatch = imgTagMatch[0].match(/src="([^"]+)"/i);
    if (srcMatch && srcMatch[1]) {
      const u = cleanUrl(srcMatch[1]);
      if (/^https?:\/\//i.test(u) && !u.includes("s150x150")) thumb = u;
    }
  }

  // 2) JSON 내 display_url / thumbnail_src 추출
  if (!thumb) {
    const jsonPatterns = [
      /(?:\\"|")display_url(?:\\"|")\s*:\s*(?:\\"|")(https?:[^"'\s]+?)(?:\\"|")/i,
      /(?:\\"|")thumbnail_src(?:\\"|")\s*:\s*(?:\\"|")(https?:[^"'\s]+?)(?:\\"|")/i,
      /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i,
      /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i,
      /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i
    ];
    for (const re of jsonPatterns) {
      const m = html.match(re);
      if (m && m[1]) {
        const u = cleanUrl(m[1]);
        if (/^https?:\/\//i.test(u) && !u.includes("s150x150") && !u.includes("profile_pic")) {
          thumb = u;
          break;
        }
      }
    }
  }

  // 3) 캡션 추출
  const capMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<div class="CaptionComments"/i)
                || html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/i);
  if (capMatch && capMatch[1]) {
    const rawCap = capMatch[1]
      .replace(/<a class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .trim();
    if (rawCap.length > 2) caption = stripMetaNoise(rawCap);
  }

  if (!caption) {
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i)
                || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:description"/i);
    if (ogDesc && ogDesc[1]) {
      caption = stripMetaNoise(
        ogDesc[1]
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/g, "'")
      );
    }
  }

  return { thumb, caption };
}

function parseJsonPayload(obj) {
  let thumb = "";
  let caption = "";
  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 9) return;
    if (!thumb) {
      if (node.cover_media?.cropped_image_version?.url) {
        thumb = node.cover_media.cropped_image_version.url;
      } else if (Array.isArray(node.image_versions2?.candidates) && node.image_versions2.candidates.length > 0) {
        const c = node.image_versions2.candidates.find(x => x?.url && !x.url.includes("s150x150")) || node.image_versions2.candidates[0];
        if (c?.url) thumb = c.url;
      } else {
        for (const k of ["thumbnail_src", "display_url", "thumbnail_url", "cover_url"]) {
          if (typeof node[k] === "string" && /^https?:\/\//i.test(cleanUrl(node[k])) && !node[k].includes(".mp4") && !node[k].includes("s150x150")) {
            thumb = node[k];
            break;
          }
        }
      }
    }
    if (!caption) {
      if (typeof node.caption === "string" && node.caption.trim().length > 2) caption = node.caption.trim();
      else if (typeof node.caption?.text === "string" && node.caption.text.trim().length > 2) caption = node.caption.text.trim();
      else if (node.edge_media_to_caption?.edges?.[0]?.node?.text) caption = node.edge_media_to_caption.edges[0].node.text.trim();
    }
    for (const k of Object.keys(node)) {
      if (k === "owner" || k === "user" || k === "profile_pic_url") continue;
      if (node[k] && typeof node[k] === "object") walk(node[k], depth + 1);
    }
  }
  walk(obj, 0);
  return { thumb: cleanUrl(thumb), caption: stripMetaNoise(caption) };
}

async function resolveIgData(code, rapidKey) {
  let thumb = "";
  let caption = "";

  const embedUrls = [
    `https://www.instagram.com/p/${code}/embed/captioned/`,
    `https://www.instagram.com/reel/${code}/embed/captioned/`,
    `https://www.instagram.com/p/${code}/embed/`
  ];

  // 1단계: Instagram Embed 페이지 직접 요청
  for (const u of embedUrls) {
    try {
      const r = await fetch(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8"
        }
      });
      if (r.ok) {
        const html = await r.text();
        const parsed = parseEmbedHtml(html);
        if (parsed.thumb && !thumb) thumb = parsed.thumb;
        if (parsed.caption && !caption) caption = parsed.caption;
        if (thumb && caption) break;
      }
    } catch (_) {}
  }

  // 2단계: 크롤러 봇 User-Agent (Facebook / Telegram / Discord 미리보기 봇)로 OpenGraph og:image 추출
  if (!thumb || !caption) {
    const botAgents = [
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
    ];
    for (const ua of botAgents) {
      try {
        const r = await fetch(`https://www.instagram.com/reel/${code}/`, {
          headers: { "User-Agent": ua, "Accept-Language": "ko-KR,ko;q=0.9" },
          redirect: "follow"
        });
        if (r.ok) {
          const html = await r.text();
          const parsed = parseEmbedHtml(html);
          if (parsed.thumb && !thumb) thumb = parsed.thumb;
          if (parsed.caption && !caption) caption = parsed.caption;
          if (thumb && caption) break;
        }
      } catch (_) {}
    }
  }

  // 3단계: /p/{code}/media/?size=l 리디렉션 엔드포인트 확인
  if (!thumb) {
    try {
      const r = await fetch(`https://www.instagram.com/p/${code}/media/?size=l`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
        },
        redirect: "manual"
      });
      const loc = r.headers.get("location");
      if (loc && /^https?:\/\//i.test(loc) && !loc.includes("login")) {
        thumb = cleanUrl(loc);
      }
    } catch (_) {}
  }

  // 4단계: RapidAPI (키가 있는 경우)
  if (rapidKey && (!thumb || !caption)) {
    const reelUrl = `https://www.instagram.com/reel/${code}/`;
    const endpoints = [
      { host: "instagram-scraper-api2.p.rapidapi.com", url: `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(code)}` },
      { host: "instagram-looter2.p.rapidapi.com", url: `https://instagram-looter2.p.rapidapi.com/post?url=${encodeURIComponent(reelUrl)}` },
      { host: "instagram-scraper-stable-api.p.rapidapi.com", url: `https://instagram-scraper-stable-api.p.rapidapi.com/get_media_data.php?reel_post_code_or_url=${encodeURIComponent(reelUrl)}&type=reel` }
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, {
          headers: { "x-rapidapi-key": rapidKey, "x-rapidapi-host": ep.host }
        });
        if (r.ok) {
          const json = await r.json();
          const parsed = parseJsonPayload(json);
          if (parsed.thumb && !thumb) thumb = parsed.thumb;
          if (parsed.caption && !caption) caption = parsed.caption;
          if (thumb && caption) break;
        }
      } catch (_) {}
    }
  }

  // 5단계: Microlink 백업
  if (!thumb || !caption) {
    try {
      const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(`https://www.instagram.com/reel/${code}/`)}`);
      if (r.ok) {
        const json = await r.json();
        const imgUrl = json?.data?.image?.url || "";
        const desc = json?.data?.description || "";
        if (imgUrl && !imgUrl.includes("s150x150") && !thumb) thumb = cleanUrl(imgUrl);
        if (desc && !caption) caption = stripMetaNoise(desc);
      }
    } catch (_) {}
  }

  return { thumb, caption };
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-rapidapi-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const code = String(req.query.code || "").trim();
  const mode = String(req.query.mode || "").trim();
  const rapidKey = String(req.query.key || req.headers["x-rapidapi-key"] || "").trim();

  if (!code) {
    return res.status(400).json({ ok: false, error: "Missing shortcode" });
  }

  const data = await resolveIgData(code, rapidKey);

  // mode=image 요청 시: 인스타 CDN 이미지를 서버에서 직접 다운로드해 JPEG 바이너리로 반환 (만료 및 CORS 원천 차단)
  if (mode === "image") {
    if (!data.thumb) {
      return res.status(404).end();
    }
    try {
      const imgRes = await fetch(data.thumb, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Referer": "https://www.instagram.com/"
        }
      });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
        return res.status(200).send(buf);
      }
    } catch (_) {}
    const weserv = `https://images.weserv.nl/?url=${encodeURIComponent(data.thumb)}&w=600&h=600&fit=cover&output=jpg`;
    res.writeHead(302, { Location: weserv });
    return res.end();
  }

  const weservUrl = data.thumb
    ? `https://images.weserv.nl/?url=${encodeURIComponent(data.thumb)}&w=600&h=600&fit=cover&output=jpg`
    : "";

  return res.status(200).json({
    ok: Boolean(data.thumb || data.caption),
    code,
    thumb: data.thumb,
    weservThumb: weservUrl,
    caption: data.caption
  });
}

module.exports = handler;
