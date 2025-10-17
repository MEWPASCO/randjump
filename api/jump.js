// api/jumpingspider.js — SerpAPI Google Images, streams image/*
// Same structure as your raccoon/lizard routes, just stricter filters.

export const config = { api: { bodyParser: false } };

const BLOCK_SITES = [
  "pinterest.", "etsy.", "redbubble.", "aliexpress.", "temu.",
  "vectorstock.", "shutterstock.", "adobe.", "istockphoto.", "123rf.",
  "dreamstime.", "depositphotos.", "freepik.", "pngtree."
];

const BLOCK_WORDS = [
  "sticker","clipart","svg","logo","vector","icon",
  "plush","plushie","toy","merch","tattoo","drawing",
  "ai","midjourney","dalle","generated","meme","cartoon"
];

// MUST contain at least one of these in title or link
const REQUIRE_WORDS = [
  "jump", "spider", "salticidae", "phidippus", "maratus", "habronattus", "portia", "regius", "audax"
];

// Hard filter out common wrong species
const EXTRA_NEG = ["-lizard","-gecko","-iguana","-scorpion","-mantis","-ant","-beetle","-fly","-moth","-butterfly","-tick","-tarantula"];

// Only jumping-spider queries
const QUERIES = [
  "jumping spider macro photo",
  "jumping spider close up photo",
  "salticidae macro photo",
  "phidippus regius macro photo",
  "phidippus audax macro photo",
  "maratus jumping spider macro photo",
  "jumping spider eyes macro",
  "cute jumping spider macro photo"
];

const FALLBACKS = [
  "https://upload.wikimedia.org/wikipedia/commons/e/ef/Phidippus_regius_-_male_2.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/b/b4/Phidippus_audax_jumping_spider.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/8/86/Phidippus_regius_female_01.jpg",
  "https://upload.wikimedia.org/wikipedia/commons/b/b7/Salticidae_-_jumping_spider_macro.jpg"
];

function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function setCORS(res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
}
function setCache(res){
  res.setHeader("Cache-Control","public, s-maxage=3600, stale-while-revalidate=43200");
}
function blockedSite(url){
  try{ const h = new URL(url).hostname.toLowerCase();
       return BLOCK_SITES.some(d => h.includes(d));
  }catch{ return false; } // don't over-block on parse errors
}
function blockedWords(text=""){
  const s = String(text).toLowerCase();
  return BLOCK_WORDS.some(w => s.includes(w));
}
function requiresSpider(text=""){
  const s = String(text).toLowerCase();
  return REQUIRE_WORDS.some(w => s.includes(w));
}
async function fetchJSON(url){
  const r = await fetch(url, { redirect:"follow", headers:{"user-agent":"Mozilla/5.0"} });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
async function fetchAsImage(url){
  const r = await fetch(url, {
    redirect:"follow",
    headers: { "user-agent":"Mozilla/5.0", "accept":"image/*,*/*;q=0.8" }
  });
  if(!r.ok) return null;
  const ct = (r.headers.get("content-type")||"").toLowerCase();
  if(!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  let ext = "jpg";
  if(ct.includes("png")) ext = "png";
  else if(ct.includes("jpeg")) ext = "jpg";
  else if(ct.includes("gif")) ext = "gif";
  else if(ct.includes("webp")) ext = "webp";
  return { buf, ct, ext };
}

export default async function handler(req,res){
  setCORS(res);
  if(req.method==="OPTIONS") return res.status(204).end();

  const serpKey = process.env.SERPAPI_KEY;
  const userQ = (req.query.q||"").toString().trim();
  const baseQuery = userQ || pick(QUERIES);

  // No key → Wikimedia fallback
  if(!serpKey){
    setCache(res);
    const url = pick(FALLBACKS);
    const data = await fetchAsImage(url);
    if(!data) return res.status(500).json({ ok:false, error:"no_key_and_fallback_failed" });
    if((req.query.format||"").toString().toLowerCase()==="json"){
      return res.status(200).json({ ok:true, source:"static_fallback", image:url, content_type:data.ct });
    }
    res.setHeader("Content-Type", data.ct);
    res.setHeader("Content-Disposition", `inline; filename="jumpingspider.${data.ext}"`);
    return res.status(200).send(data.buf);
  }

  const ijn = Math.floor(Math.random()*6);
  const q = [baseQuery, ...EXTRA_NEG].join(" ");
  const params = new URLSearchParams({
    engine:"google_images",
    q,
    tbm:"isch",
    tbs:"itp:photo,isz:l",
    safe:"active",
    ijn:String(ijn),
    api_key:serpKey
  });

  let candidates = [];
  try{
    const data = await fetchJSON(`https://serpapi.com/search.json?${params.toString()}`);
    const list = Array.isArray(data.images_results) ? data.images_results : [];
    candidates = list.filter(r=>{
      const url = r?.original || r?.thumbnail || "";
      const title = r?.title || "";
      const link = r?.link || "";
      if(!url) return false;
      if(url.toLowerCase().endsWith(".svg")) return false;
      if(blockedSite(url)) return false;
      if(blockedWords(title)) return false;
      // REQUIRE spider terms in title or link
      if(!(requiresSpider(title) || requiresSpider(link))) return false;
      return true;
    });
  }catch{
    // fall through to static
  }

  // shuffle
  for(let i=candidates.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }

  setCache(res);

  const MAX_TRIES = Math.min(12, candidates.length);
  for(let i=0;i<MAX_TRIES;i++){
    const url = candidates[i]?.original || candidates[i]?.thumbnail;
    try{
      const data = await fetchAsImage(url);
      if(!data) continue;

      if((req.query.format||"").toString().toLowerCase()==="json"){
        return res.status(200).json({
          ok:true, source:"serpapi", image:url, content_type:data.ct,
          candidates:candidates.length
        });
      }

      res.setHeader("Content-Type", data.ct);
      res.setHeader("Content-Disposition", `inline; filename="jumpingspider.${data.ext}"`);
      return res.status(200).send(data.buf);
    }catch{/* next */}
  }

  // static fallback
  try{
    const url = pick(FALLBACKS);
    const data = await fetchAsImage(url);
    if(!data) throw new Error("fallback failed");
    if((req.query.format||"").toString().toLowerCase()==="json"){
      return res.status(200).json({ ok:true, source:"static_fallback", image:url, content_type:data.ct });
    }
    res.setHeader("Content-Type", data.ct);
    res.setHeader("Content-Disposition", `inline; filename="jumpingspider.${data.ext}"`);
    return res.status(200).send(data.buf);
  }catch{
    return res.status(404).json({ ok:false, error:"no_usable_jumpingspider_found" });
  }
}
