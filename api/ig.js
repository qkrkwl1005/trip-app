function cleanIgUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/\\+u0026/gi, "&")
    .replace(/\\+u002f/gi, "/")
    .replace(/\\+u003d/gi, "=")
    .replace(/\\+u003f/gi, "?")
    .replace(/\\+\//g, "/")
    .replace(/&amp;/gi, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&#38;/gi, "&")
    .replace(/\\+/g, "")
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

// 인스타그램 프로필 사진(t51.2885-19) 및 로고/아이콘 완벽 차단 필터
function isAvatarOrBadUrl(url) {
  if (!url || typeof url !== "string") return true;
  const u = cleanIgUrl(url);
  if (!/^https?:\/\//i.test(u)) return true;
  // t51.2885-19는 인스타그램의 프로필 아바타 전용 CDN 경로 (돌곰, 벌꿀오소리 등 프로필 사진)
  if (/t51\.2885-19/i.test(u)) return true;
  if (/profile_pic|s150x150|p150x150|150x150|s320x320|static\.cdninstagram|rsrc\.php|\.mp4/i.test(u)) return true;
  return false;
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

function parseJsonMedia(obj) {
  let thumb = "";
  let caption = "";

  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > 10) return;

    if (!thumb) {
      const candidates = [
        node.cover_media?.cropped_image_version?.url,
        node.thumbnail_src,
        node.display_url,
        node.thumbnail_url,
        node.cover_url,
        ...(Array.isArray(node.display_resources) ? node.display_resources.map(r => r?.src) : []),
        ...(Array.isArray(node.image_versions2?.candidates) ? node.image_versions2.candidates.map(c => c?.url) : [])
      ];
      for (const c of candidates) {
        if (typeof c === "string" && !isAvatarOrBadUrl(c)) {
          thumb = cleanIgUrl(c);
          break;
        }
      }
    }

    if (!caption) {
      if (typeof node.caption === "string" && node.caption.trim().length > 2) caption = node.caption.trim();
      else if (typeof node.caption?.text === "string" && node.caption.text.trim().length > 2) caption = node.caption.text.trim();
      else if (node.edge_media_to_caption?.edges?.[0]?.node?.text) caption = node.edge_media_to_caption.edges[0].node.text.trim();
    }

    for (const k of Object.keys(node)) {
      if (k === "owner" || k === "user" || k === "profile_pic_url" || k === "hd_profile_pic_url_info" || k === "hd_profile_pic_versions") continue;
      if (node[k] && typeof node[k] === "object") walk(node[k], depth + 1);
    }
  }

  walk(obj, 0);
  return { thumb, caption: stripMetaNoise(caption) };
}

function parseEmbedHtml(html) {
  let thumb = "";
  let caption = "";
  if (!html || typeof html !== "string") return { thumb, caption };

  // 1) contextJSON 언이스케이프 파싱 (릴스 인트로 썸네일 최우선 소스)
  const ctxMatch = html.match(/contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (ctxMatch && ctxMatch[1]) {
    try {
      const unescapedStr = JSON.parse('"' + ctxMatch[1] + '"');
      const ctxObj = JSON.parse(unescapedStr);
      const parsedCtx = parseJsonMedia(ctxObj);
      if (parsedCtx.thumb && !isAvatarOrBadUrl(parsedCtx.thumb)) thumb = parsedCtx.thumb;
      if (parsedCtx.caption) caption = parsedCtx.caption;
    } catch (_) {}
  }

  // 2) 상단 Header(프로필 사진 영역)를 제거한 본문 HTML에서 EmbeddedMediaImage 탐색
  const bodyHtml = html.replace(/<div[^>]+class="[^"]*Header[^"]*"[\s\S]*?<\/div>\s*<\/div>/i, "");

  if (!thumb) {
    const mediaImgMatch = bodyHtml.match(/<img[^>]+class="[^"]*EmbeddedMediaImage[^"]*"[^>]*>/i)
                       || bodyHtml.match(/<img[^>]+EmbeddedMediaImage[^>]*>/i);
    if (mediaImgMatch) {
      const srcM = mediaImgMatch[0].match(/src="([^"]+)"/i);
      if (srcM && srcM[1] && !isAvatarOrBadUrl(srcM[1])) {
        thumb = cleanIgUrl(srcM[1]);
      }
    }
  }

  // 3) HTML/스크립트 내부에서 실제 게시물 미디어 버킷(-15 경로) URL 직접 스캔
  if (!thumb) {
    const rawReplaced = cleanIgUrl(bodyHtml);
    const mediaBucketRegex = /https:\/\/[^\s"'<>\\]+?(?:cdninstagram\.com|fbcdn\.net)[^\s"'<>\\]+?\/t51\.(?:2885|29350|71878|75761)-15\/[^\s"'<>\\]+/gi;
    const matches = rawReplaced.match(mediaBucketRegex) || [];
    for (const mUrl of matches) {
      if (!isAvatarOrBadUrl(mUrl)) {
        thumb = cleanIgUrl(mUrl);
        break;
      }
    }
  }

  // 4) display_url / thumbnail_src 정규식 스캔 (프로필 아바타 제외)
  if (!thumb) {
    const fieldRegex = /(?:display_url|thumbnail_src|cover_url)(?:\\"|")\s*:\s*(?:\\"|")(https?:[^"'\s]+?)(?:\\"|")/gi;
    let m;
    while ((m = fieldRegex.exec(html)) !== null) {
      const cand = cleanIgUrl(m[1]);
      if (!isAvatarOrBadUrl(cand)) {
        thumb = cand;
        break;
      }
    }
  }

  // 5) 캡션 추출
  if (!caption) {
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
  }

  return { thumb, caption };
}

async function resolveIgData(code, rapidKey) {
  let thumb = "";
  let caption = "";

  // [Layer 1] Instagram Embed 페이지 직접 파싱
  const embedTargets = [
    `https://www.instagram.com/p/${code}/embed/captioned/`,
    `https://www.instagram.com/reel/${code}/embed/captioned/`,
    `https://www.instagram.com/reel/${code}/embed/`
  ];
  for (const u of embedTargets) {
    try {
      const r = await fetch(u, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8"
        }
      });
      if (r.ok) {
        const html = await r.text();
        const parsed = parseEmbedHtml(html);
        if (parsed.thumb && !isAvatarOrBadUrl(parsed.thumb) && !thumb) thumb = parsed.thumb;
        if (parsed.caption && !caption) caption = parsed.caption;
        if (thumb && caption) break;
      }
    } catch (_) {}
  }

  // [Layer 2] Instagram GraphQL API (doc_id)
  if (!thumb || !caption) {
    try {
      const body = new URLSearchParams({
        av: "0",
        variables: JSON.stringify({ shortcode: code, fetch_comment_count: 2, HRV: 1 }),
        doc_id: "8845758582119845"
      });
      const r = await fetch("https://www.instagram.com/graphql/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-IG-App-ID": "936619743392459",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Origin": "https://www.instagram.com",
          "Referer": `https://www.instagram.com/reel/${code}/`
        },
        body: body.toString()
      });
      if (r.ok) {
        const json = await r.json();
        const parsed = parseJsonMedia(json);
        if (parsed.thumb && !isAvatarOrBadUrl(parsed.thumb) && !thumb) thumb = parsed.thumb;
        if (parsed.caption && !caption) caption = parsed.caption;
      }
    } catch (_) {}
  }

  // [Layer 3] Jina Headless Chrome 렌더러 (모든 이미지 중 첫 번째 프로필 아바타를 건너뛰고 -15 본문 커버만 선택)
  if (!thumb || !caption) {
    for (const target of [`https://www.instagram.com/p/${code}/embed/captioned/`, `https://www.instagram.com/reel/${code}/embed/`]) {
      try {
        const jr = await fetch(`https://r.jina.ai/${target}`, {
          headers: { "Accept": "text/plain" }
        });
        if (jr.ok) {
          const jtxt = await jr.text();
          const imgRegex = /!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/gi;
          let m;
          while ((m = imgRegex.exec(jtxt)) !== null) {
            const candidate = cleanIgUrl(m[1]);
            if (!isAvatarOrBadUrl(candidate) && (candidate.includes("cdninstagram") || candidate.includes("fbcdn"))) {
              if (!thumb) thumb = candidate;
              break;
            }
          }
          if (thumb) break;
        }
      } catch (_) {}
    }
  }

  // [Layer 4] RapidAPI
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
          const parsed = parseJsonMedia(json);
          if (parsed.thumb && !isAvatarOrBadUrl(parsed.thumb) && !thumb) thumb = parsed.thumb;
          if (parsed.caption && !caption) caption = parsed.caption;
          if (thumb && caption) break;
        }
      } catch (_) {}
    }
  }

  return { thumb, caption };
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-rapidapi-key");

  if (req.method === "OPTIONS") return res.status(200).end();

  const code = String(req.query.code || "").trim();
  const mode = String(req.query.mode || "").trim();
  const rapidKey = String(req.query.key || req.headers["x-rapidapi-key"] || "").trim();

  if (!code) return res.status(400).json({ ok: false, error: "Missing shortcode" });

  const data = await resolveIgData(code, rapidKey);

  if (mode === "image") {
    if (!data.thumb || isAvatarOrBadUrl(data.thumb)) {
      return res.status(404).end();
    }
    try {
      const imgRes = await fetch(data.thumb, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
          "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "Referer": "https://www.instagram.com/"
        }
      });
      if (imgRes.ok) {
        const buf = Buffer.from(await imgRes.arrayBuffer());
        res.setHeader("Content-Type", imgRes.headers.get("content-type") || "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
        return res.status(200).send(buf);
      }
    } catch (_) {}
    const weserv = `https://images.weserv.nl/?url=${encodeURIComponent(data.thumb)}&w=640&h=640&fit=cover&output=jpg`;
    res.writeHead(302, { Location: weserv });
    return res.end();
  }

  const weservUrl = (data.thumb && !isAvatarOrBadUrl(data.thumb))
    ? `https://images.weserv.nl/?url=${encodeURIComponent(data.thumb)}&w=640&h=640&fit=cover&output=jpg`
    : "";

  return res.status(200).json({
    ok: Boolean(weservUrl || data.caption),
    code,
    thumb: data.thumb,
    weservThumb: weservUrl,
    caption: data.caption
  });
}

module.exports = handler;
