function cleanUrl(u) {
  if (!u) return "";
  return u.replace(/\\u0026/gi, "&").replace(/\\\//g, "/").replace(/\\+/g, "").replace(/^["']+|["']+$/g, "").trim();
}

function extractStrictIntroCover(html) {
  let thumb = "";
  
  // 1. JSON 내 특정 릴스 커버 구역(cropped_image_version)만 핀포인트 타격 (프로필 아바타 절대 접근 불가)
  const ctxMatch = html.match(/contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (ctxMatch) {
    try {
      const obj = JSON.parse(JSON.parse('"' + ctxMatch[1] + '"'));
      const roots = [obj.shortcode_media, obj.items?.[0], obj.graphql?.shortcode_media, obj];
      for (const root of roots) {
        if (!root) continue;
        if (root.cover_media?.cropped_image_version?.url) { thumb = root.cover_media.cropped_image_version.url; break; }
        if (root.image_versions2?.candidates?.[0]?.url) { thumb = root.image_versions2.candidates[0].url; break; }
      }
    } catch(e) {}
  }
  if (thumb) return cleanUrl(thumb);

  // 2. HTML 돔 내 릴스 본문 전용 클래스(EmbeddedMediaImage)만 타격
  const emi = html.match(/class="[^"]*EmbeddedMediaImage[^"]*"[^>]*src="([^"]+)"/i);
  if (emi && emi[1]) return cleanUrl(emi[1]);

  // 3. OG 태그 (가장 최후의 수단, 이 경우에만 프로필 방어)
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  if (og && og[1] && !og[1].includes("profile_pic")) return cleanUrl(og[1]);

  return "";
}

async function resolveIgData(code) {
  let thumb = "";
  try {
    const r = await fetch(`https://www.instagram.com/reel/${code}/embed/captioned/`, {
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU OS 17_4 like Mac OS X)", "Accept-Language": "ko-KR" }
    });
    if (r.ok) {
      thumb = extractStrictIntroCover(await r.text());
    }
  } catch (e) {}

  // 백업: Microlink
  if (!thumb) {
    try {
      const ml = await fetch(`https://api.microlink.io/?url=https://www.instagram.com/p/${code}/`);
      if (ml.ok) {
        const mldata = await ml.json();
        if (mldata.data?.image?.url && !mldata.data.image.url.includes("profile_pic")) {
          thumb = cleanUrl(mldata.data.image.url);
        }
      }
    } catch (e) {}
  }
  return thumb;
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const code = String(req.query.code || "").trim();
  if (!code) return res.status(400).json({ ok: false });

  const thumb = await resolveIgData(code);
  
  // 인증 꼬리표(&ig_thumb=1)를 붙여 프록시 URL 생성
  const weservUrl = thumb ? `https://images.weserv.nl/?url=${encodeURIComponent(thumb)}&w=640&h=640&fit=cover&output=jpg&ig_thumb=1` : "";
  return res.status(200).json({ ok: Boolean(weservUrl), code, thumb, weservThumb: weservUrl });
}

module.exports = handler;
