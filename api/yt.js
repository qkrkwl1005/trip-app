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

function isGenericYoutubeDesc(text) {
  if (!text || typeof text !== "string") return true;
  return /YouTube에서 마음에 드는 동영상|Enjoy the videos and music|전 세계 사람들과 콘텐츠를 공유/i.test(text);
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
    const candidateUrls = [
      `https://www.youtube.com/shorts/${vid}`,
      `https://www.youtube.com/watch?v=${vid}`
    ];

    for (const fetchUrl of candidateUrls) {
      try {
        const ytRes = await fetch(fetchUrl, { headers });
        if (!ytRes.ok) continue;
        const html = await ytRes.text();

        const pData = extractJsonObject(html, "ytInitialPlayerResponse");
        if (pData?.videoDetails) {
          const details = pData.videoDetails;
          if (!title && details.title) title = details.title;
          if (!author && details.author) author = details.author;
          if (details.shortDescription && !isGenericYoutubeDesc(details.shortDescription)) {
            description = details.shortDescription;
          }
          if (details.thumbnail?.thumbnails?.length) {
            thumbnail = details.thumbnail.thumbnails[details.thumbnail.thumbnails.length - 1].url || thumbnail;
          }
        }

        if (!description) {
          const initData = extractJsonObject(html, "ytInitialData");
          if (initData) {
            // Check engagement panels or description runs
            const str = JSON.stringify(initData);
            const mDesc = str.match(/"description":\s*{"runs":\s*\[(.*?)\]}/);
            if (mDesc) {
              try {
                const runs = JSON.parse(`[${mDesc[1]}]`);
                const fullText = runs.map(r => r.text || "").join("").trim();
                if (fullText && !isGenericYoutubeDesc(fullText)) {
                  description = fullText;
                }
              } catch (_) {}
            }
          }
        }

        if (title && description) break;
      } catch (_) {}
    }

    // Fallback 1: Jina AI reader if description is still empty
    if (!description) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/https://www.youtube.com/shorts/${vid}`, {
          headers: { "Accept": "text/plain" }
        });
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (jinaText && jinaText.length > 50 && !jinaText.includes("Failed to connect")) {
            // Extract title and description from Jina markdown
            const tMatch = jinaText.match(/Title:\s*(.+?)(?:\n|$)/);
            if (tMatch && !title) title = tMatch[1].trim();
            const contentIdx = jinaText.indexOf("Markdown Content:");
            const body = contentIdx !== -1 ? jinaText.slice(contentIdx + 17).trim() : jinaText;
            if (body && !isGenericYoutubeDesc(body)) {
              description = body;
            }
          }
        }
      } catch (_) {}
    }

    // Fallback 2: oEmbed if title is still missing
    if (!title) {
      try {
        const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`);
        if (oeRes.ok) {
          const oeData = await oeRes.json();
          title = oeData.title || title;
          author = oeData.author_name || author;
          thumbnail = oeData.thumbnail_url || thumbnail;
        }
      } catch (_) {}
    }

    const captionParts = [title, description].filter(Boolean);
    const caption = captionParts.join("\n\n").trim();

    return res.status(200).json({
      id: vid,
      title: title || "YouTube Short",
      description: description || "",
      author,
      thumbnail,
      caption: caption || title
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message || "Failed to fetch YouTube metadata"
    });
  }
}

module.exports = handler;
module.exports.default = handler;
