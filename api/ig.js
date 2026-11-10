function cleanUrl(u) {
  if (!u) return "";
  return u.replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/\\+/g, "").replace(/^["']+|["']+$/g, "").trim();
}

function isAvatarOrBadUrl(url) {
  if (!url || typeof url !== "string") return true;
  let d = url;
  try { d = decodeURIComponent(url); } catch (_) {}
  // 프로필 아바타 CDN 및 저해상도 완벽 차단
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
      // 프로필 사진 노드 절대 탐색 금지
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

async function resolveIgData(code, rapidKey) {
  let thumb = "";
  let caption = "";

  // 1순위: RapidAPI (사용자가 입력한 키가 전달된 경우)
  if (rapidKey) {
    const reelUrl = `https://www.instagram.com/reel/${code}/`;
    const endpoints = [
      { host: "instagram-scraper-api2.p.rapidapi.com", url: `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(code)}` },
      { host: "instagram-looter2.p.rapidapi.com", url: `https://instagram-looter2.p.rapidapi.com/post?url=${encodeURIComponent(reelUrl)}` },
      { host: "instagram-scraper-stable-api.p.rapidapi.com", url: `https://instagram-scraper-stable-api.p.rapidapi.com/get_media_data.php?reel_post_code_or_url=${encodeURIComponent(reelUrl)}&type=reel` }
    ];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, { headers: { "x-rapidapi-key": rapidKey, "x-rapidapi-host": ep.host } });
        if (r.ok) {
          const json = await r.json();
          if (!thumb) {
            const parsed = parseJsonMedia(json);
            if (parsed && !isAvatarOrBadUrl(parsed)) thumb = parsed;
          }
          if (!caption) {
            const cap = extractCaptionFromJson(json);
            if (cap) caption = cap;
          }
          if (thumb && caption) break;
        }
      } catch(e) {}
    }
  }

  // 2순위: Instagram Embed 기본 파싱
  try {
    const r = await fetch(`https://www.instagram.com/reel/${code}/embed/captioned/`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4 like Mac OS X)", "Accept-Language": "ko-KR" }
    });
    if (r.ok) {
      const html = await r.text();
      const ctxMatch = html.match(/"contextJSON"\s*:\s*("[^"\\]*(?:\\.[^"\\]*)*")/);
      if (ctxMatch) {
        try {
          const parsedObj = JSON.parse(JSON.parse(ctxMatch[1]));
          if (!thumb) thumb = parseJsonMedia(parsedObj);
          if (!caption) caption = extractCaptionFromJson(parsedObj);
        } catch(e) {}
      }
      if (!thumb || isAvatarOrBadUrl(thumb)) {
        const emi = html.match(/class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/i);
        if (emi && emi[1] && !isAvatarOrBadUrl(emi[1])) thumb = cleanUrl(emi[1]);
      }
    }
  } catch (e) {}

  return { thumb, caption };
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const code = String(req.query.code || "").trim();
  const key = String(req.query.key || req.headers["x-rapidapi-key"] || "").trim();
  
  if (!code) return res.status(400).json({ ok: false });

  const { thumb, caption } = await resolveIgData(code, key);
  
  const weservUrl = (thumb && !isAvatarOrBadUrl(thumb)) 
    ? `https://images.weserv.nl/?url=${encodeURIComponent(thumb)}&w=640&h=640&fit=cover&output=jpg&ig_cover=2` 
    : "";
    
  return res.status(200).json({ ok: Boolean(weservUrl || caption), code, thumb, weservThumb: weservUrl, caption: caption || "" });
}

module.exports = handler;
