// Vercel Serverless Function: YouTube Shorts/Video Metadata & Description Scraper
async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { id, url: rawUrl } = req.query || {};
  let vid = String(id || "").trim();

  if (!vid && rawUrl) {
    const m = String(rawUrl).match(/(?:youtube\.com\/(?:shorts\/|watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{10,12})/);
    if (m) vid = m[1];
  }

  if (!vid) {
    return res.status(400).json({ error: "Missing video id or url" });
  }

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${vid}`;
    const ytRes = await fetch(watchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6"
      }
    });

    let title = "";
    let description = "";
    let author = "";
    let thumbnail = `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;

    if (ytRes.ok) {
      const html = await ytRes.text();
      const playerMatch = html.match(/var ytInitialPlayerResponse\s*=\s*({.+?});(?:var|<\/script>)/);
      if (playerMatch) {
        try {
          const pData = JSON.parse(playerMatch[1]);
          const details = pData.videoDetails || {};
          title = details.title || "";
          description = details.shortDescription || "";
          author = details.author || "";
          if (details.thumbnail?.thumbnails?.length) {
            thumbnail = details.thumbnail.thumbnails[details.thumbnail.thumbnails.length - 1].url || thumbnail;
          }
        } catch (_) {}
      }

      if (!title) {
        const titleMatch = html.match(/<title>(.*?)(?: - YouTube)?<\/title>/i);
        if (titleMatch) title = titleMatch[1].replace(/ - YouTube$/i, "").trim();
      }

      if (!description) {
        const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i) ||
                          html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i);
        if (descMatch) description = descMatch[1].trim();
      }
    }

    // oEmbed fallback if title is still missing
    if (!title) {
      try {
        const oeRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`);
        if (oeRes.ok) {
          const oeData = await oeRes.json();
          title = oeData.title || title;
          author = oeData.author_name || author;
          thumbnail = oeData.thumbnail_url || thumbnail;
        }
      } catch (_) {}
    }

    const caption = [title, description].filter(Boolean).join("\n\n").trim();

    return res.status(200).json({
      id: vid,
      title,
      description,
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
