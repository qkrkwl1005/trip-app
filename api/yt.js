// Vercel Serverless Function: YouTube Shorts/Video Metadata & Description Scraper
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

function isGarbageContent(text) {
  if (!text || typeof text !== "string") return true;
  const s = text.trim();
  if (s.length < 5) return true;
  if (/^(?:YouTube|Shorts|Video unavailable|Instagram|404 Not Found|Not Found|Error)$/i.test(s)) return true;
  if (/YouTube에서 마음에 드는 동영상|Enjoy the videos and music|전 세계 사람들과 콘텐츠를 공유/i.test(s)) return true;
  if (/Video unavailable|This video is unavailable|동영상을 재생할 수 없음|이 동영상은 볼 수 없습니다|Sign in to confirm|Tap to unmute|Skip navigation|You're signed out|404 Not Found/i.test(text)) return true;
  return false;
}

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id, v, url: rawUrl } = req.query || {};
  let vid = String(id || v || "").trim();

  if (!vid && rawUrl) {
    const m = String(rawUrl).match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{10,12})/);
    if (m) vid = m[1];
  }

  if (!vid) {
    return res.status(400).json({ error: "Missing video id or url" });
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
    // 1단계: 초고속 공식 oEmbed 병렬 호출 (0.1~0.3초 이내 100% 무차단 정확한 제목·채널명 확보)
    const oePromise = fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`, {
      signal: AbortSignal.timeout(3000)
    }).then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        if (d?.title && !isGarbageContent(d.title)) title = d.title.trim();
        if (d?.author_name) author = d.author_name.trim();
        if (d?.thumbnail_url) thumbnail = d.thumbnail_url;
      }
    }).catch(() => {});

    // 2단계: YouTube Shorts 전용 HTML 페이지에서 shortDescription 및 ytInitialData 파싱
    const scrapePromise = (async () => {
      const candidateUrls = [
        `https://www.youtube.com/shorts/${vid}`,
        `https://www.youtube.com/watch?v=${vid}`
      ];

      for (const fetchUrl of candidateUrls) {
        try {
          const ytRes = await fetch(fetchUrl, {
            headers,
            signal: AbortSignal.timeout(3500)
          });
          if (!ytRes.ok) continue;
          const html = await ytRes.text();

          // 2-1: 정규식으로 shortDescription 고속 직접 추출
          if (!description) {
            const mShort = html.match(/"shortDescription":\s*("([^"\\]|\\.)*")/);
            if (mShort) {
              try {
                const raw = JSON.parse(mShort[1]);
                if (raw && !isGarbageContent(raw)) {
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
              if (!title && details.title && !isGarbageContent(details.title)) {
                title = details.title;
              }
              if (!author && details.author) author = details.author;
              if (!description && details.shortDescription && !isGarbageContent(details.shortDescription)) {
                description = details.shortDescription;
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
                  if (fullText && !isGarbageContent(fullText)) {
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

    // 3단계: description이 여전히 비어있다면 Jina AI fallback (엄격한 쓰레기 문구 필터링 적용)
    if (!description) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/https://www.youtube.com/shorts/${vid}`, {
          headers: { "Accept": "text/plain" },
          signal: AbortSignal.timeout(3500)
        });
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (jinaText && !isGarbageContent(jinaText)) {
            const tMatch = jinaText.match(/Title:\s*(.+?)(?:\n|$)/);
            if (tMatch && !title && !isGarbageContent(tMatch[1])) {
              title = tMatch[1].trim();
            }
            const contentIdx = jinaText.indexOf("Markdown Content:");
            const body = contentIdx !== -1 ? jinaText.slice(contentIdx + 17).trim() : jinaText;
            if (body && !isGarbageContent(body)) {
              description = body;
            }
          }
        }
      } catch (_) {}
    }

    // 최종 캡션 조립 (유효하지 않은 쓰레기 문구 절대 포함 금지)
    const validTitle = isGarbageContent(title) ? "" : title;
    const validDesc = isGarbageContent(description) ? "" : description;
    const captionParts = [validTitle, validDesc].filter(Boolean);
    const caption = captionParts.join("\n\n").trim();

    return res.status(200).json({
      id: vid,
      title: validTitle || "YouTube Short",
      description: validDesc || "",
      author,
      thumbnail,
      caption: caption || validTitle || ""
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Failed to fetch YouTube metadata"
    });
  }
}

module.exports = handler;
module.exports.default = handler;
