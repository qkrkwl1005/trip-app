// Vercel Serverless Function: YouTube Shorts/Video Metadata & Description Scraper
const ALLOWED_ORIGINS = [
  "https://trip-app-psi-two.vercel.app",
  "https://qkrkwl1005.github.io",
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return (
    ALLOWED_ORIGINS.includes(origin) ||
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin) ||
    /^capacitor:\/\//.test(origin)
  );
}

function extractJsonObject(html, marker) {
  if (!html || typeof html !== "string") return null;
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf("{", idx);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1));
          } catch (_) {
            return null;
          }
        }
      }
    }
  }
  return null;
}

function isGarbageContent(text, isTitle = false) {
  if (!text || typeof text !== "string") return true;
  const s = text.trim();
  const minLen = isTitle ? 2 : 5;
  if (s.length < minLen) return true;
  if (/^(?:YouTube|Shorts|YouTube Short|Video unavailable|Instagram|404 Not Found|Not Found|Error)$/i.test(s)) return true;
  if (/YouTube에서 마음에 드는 동영상|Enjoy the videos and music|전 세계 사람들과 콘텐츠를 공유/i.test(s)) return true;
  if (/Video unavailable|This video is unavailable|동영상을 재생할 수 없음|이 동영상은 볼 수 없습니다|Sign in to confirm|Tap to unmute|Skip navigation|You're signed out|404 Not Found/i.test(text)) return true;
  return false;
}

function extractVideoId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const mPath = rawUrl.match(
    /(?:youtube\.com\/(?:shorts|embed|live|v)\/|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i
  );
  if (mPath) return mPath[1];
  const mQuery = rawUrl.match(/[?&]v=([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i);
  if (mQuery) return mQuery[1];
  return "";
}

async function handler(req, res) {
  const origin = req.headers?.origin || "";
  if (origin && !isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
    res.setHeader("Vary", "Origin");
    return res.status(403).json({ ok: false, error: "Forbidden origin" });
  }
  res.setHeader("Access-Control-Allow-Origin", origin || ALLOWED_ORIGINS[0]);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id, v, url: rawUrl } = req.query || {};
  let vid = String(id || v || "").trim();

  if (!vid && rawUrl) {
    vid = extractVideoId(String(rawUrl));
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) {
    return res.status(400).json({ ok: false, error: "Invalid or missing video id" });
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6"
  };

  let title = "";
  let description = "";
  let author = "";
  let thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

  try {
    // 1단계: 공식 oEmbed 병렬 호출 (2.4초 타임아웃)
    const oePromise = fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, {
      signal: AbortSignal.timeout(2400)
    }).then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        if (d?.title && !isGarbageContent(d.title, true)) title = d.title.trim();
        if (d?.author_name) author = d.author_name.trim();
        if (d?.thumbnail_url) thumbnail = d.thumbnail_url;
      }
    }).catch(() => {});

    // 2단계: YouTube Shorts & Watch HTML 파싱 (각 2.2초, 최악 합산 <= 4.4초)
    const scrapePromise = (async () => {
      const candidateUrls = [
        `https://www.youtube.com/shorts/${vid}`,
        `https://www.youtube.com/watch?v=${vid}`
      ];

      for (const fetchUrl of candidateUrls) {
        try {
          const ytRes = await fetch(fetchUrl, {
            headers,
            signal: AbortSignal.timeout(2200)
          });
          if (!ytRes.ok) continue;
          const html = await ytRes.text();

          // 2-1: 정규식으로 shortDescription 고속 직접 추출
          if (!description) {
            const mShort = html.match(/"shortDescription":\s*("([^"\\]|\\.)*")/);
            if (mShort) {
              try {
                const raw = JSON.parse(mShort[1]);
                if (raw && !isGarbageContent(raw, false)) {
                  description = raw.trim();
                }
              } catch (_) {}
            }
          }

          // 2-2: ytInitialPlayerResponse 객체 탐색
          if (!description || !title) {
            const pData = extractJsonObject(html, "ytInitialPlayerResponse");
            if (pData?.videoDetails) {
              const details = pData.videoDetails;
              if (!title && details.title && !isGarbageContent(details.title, true)) {
                title = details.title.trim();
              }
              if (!author && details.author) author = details.author;
              if (!description && details.shortDescription && !isGarbageContent(details.shortDescription, false)) {
                description = details.shortDescription.trim();
              }
              if (details.thumbnail?.thumbnails?.length) {
                thumbnail = details.thumbnail.thumbnails[details.thumbnail.thumbnails.length - 1].url || thumbnail;
              }
            }
          }

          // 2-3: ytInitialData engagement panels 탐색
          if (!description) {
            const initData = extractJsonObject(html, "ytInitialData");
            if (initData) {
              const str = JSON.stringify(initData);
              const mDesc = str.match(/"description":\s*{"runs":\s*\[(.*?)\]}/);
              if (mDesc) {
                try {
                  const runs = JSON.parse(`[${mDesc[1]}]`);
                  const fullText = runs.map(r => r.text || "").join("").trim();
                  if (fullText && !isGarbageContent(fullText, false)) {
                    description = fullText;
                  }
                } catch (_) {}
              }
            }
          }

          if (description) break;
        } catch (_) {}
      }
    })();

    await Promise.all([oePromise, scrapePromise]);

    // 3단계: description이 비어있을 때만 Jina AI fallback (2.0초 타임아웃, 본문 4000자 제한)
    if (!description) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/https://www.youtube.com/shorts/${vid}`, {
          headers: { "Accept": "text/plain" },
          signal: AbortSignal.timeout(2000)
        });
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (jinaText && !isGarbageContent(jinaText, false)) {
            const tMatch = jinaText.match(/Title:\s*(.+?)(?:\n|$)/);
            if (tMatch && !title && !isGarbageContent(tMatch[1], true)) {
              title = tMatch[1].trim();
            }
            const contentIdx = jinaText.indexOf("Markdown Content:");
            const body = (contentIdx !== -1 ? jinaText.slice(contentIdx + 17) : jinaText).trim().slice(0, 4000);
            if (body && !isGarbageContent(body, false)) {
              description = body;
            }
          }
        }
      } catch (_) {}
    }

    const validTitle = isGarbageContent(title, true) ? "" : title;
    const validDesc = isGarbageContent(description, false) ? "" : description;
    const captionParts = [validTitle, validDesc].filter(Boolean);
    const caption = captionParts.join("\n\n").trim();
    const ok = Boolean(caption);

    if (ok) {
      res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    }

    return res.status(200).json({
      ok,
      id: vid,
      title: validTitle,
      description: validDesc,
      hasDescription: Boolean(validDesc),
      author,
      thumbnail,
      caption
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      id: vid,
      title: "",
      description: "",
      hasDescription: false,
      author,
      thumbnail,
      caption: ""
    });
  }
}

module.exports = handler;
