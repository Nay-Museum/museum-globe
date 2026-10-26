import { writeFile } from "node:fs/promises";

const ROOT = new URL("..", import.meta.url);
const OUT = new URL("data/artifacts.js", ROOT);

const CATEGORY_LABELS = {
  ceramic: "도자",
  painting: "회화",
  metalcraft: "금속공예"
};

const KR_ORIGIN = {
  lat: 34.642,
  lng: 126.769,
  place: "강진 가마터 추정",
  certainty: "capital-fallback"
};

const CN_ORIGINS = {
  north: {
    lat: 34.7973,
    lng: 114.3076,
    place: "변경, 현 허난성 카이펑 추정",
    certainty: "capital-fallback"
  },
  south: {
    lat: 30.2741,
    lng: 120.1551,
    place: "임안, 현 저장성 항저우 추정",
    certainty: "capital-fallback"
  },
  song: {
    lat: 31.2304,
    lng: 121.4737,
    place: "송대 중국 동부 지역 추정",
    certainty: "capital-fallback"
  }
};

// Mirrors the rule used to tag the committed snapshot: only an explicit celadon/greenware term sets ware.
function wareFor(category, ...texts) {
  if (category !== "ceramic") return null;
  return /청자|靑磁|青瓷|青釉/.test(texts.join(" ")) ? "celadon" : null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<!HS>|<!HE>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value) {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|dt|dd|h\d|tr|td|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function linesFromHtml(html) {
  return decodeHtml(html)
    .replace(/<!HS>|<!HE>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|dt|dd|h\d|tr|td|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function absUrl(url, base) {
  return new URL(decodeHtml(url), base).href;
}

async function fetchText(url, headers = {}) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if (attempt) await sleep(500 * attempt);
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 museum-globe-local-data/1.0",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7,zh-CN;q=0.6",
          ...headers
        }
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${url}`);
      }
      return response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNmkCards(html) {
  const cards = [];
  const cardRegex = /<li class="card">([\s\S]*?)<\/li>/g;
  for (const match of html.matchAll(cardRegex)) {
    const block = match[1];
    const relicId = block.match(/relicId=(\d+)/)?.[1];
    const image = block.match(/<img src="([^"]+)"/)?.[1];
    const titleBlock = block.match(/<div class="txt">([\s\S]*?)<\/div>/)?.[1] || "";
    const title = stripTags(titleBlock);
    if (relicId && image && title) {
      cards.push({
        relicId,
        title,
        image: absUrl(image, "https://www.museum.go.kr")
      });
    }
  }
  return cards;
}

function lineAfter(lines, label) {
  const index = lines.findIndex((line) => line === label);
  return index >= 0 ? lines[index + 1] || "" : "";
}

function splitNameHanja(title, fallbackHanja = "") {
  const cleanTitle = title.replace(/\s*\.\.\.$/, "").trim();
  const match = cleanTitle.match(/^(.+?)\s*[（(]([^()（）]+)[）)]/);
  if (!match) return { name: cleanTitle, nameHanja: fallbackHanja };
  return {
    name: match[1].trim(),
    nameHanja: match[2].trim()
  };
}

function nmkDetailTitle(html, fallback) {
  const match = html.match(/<strong[^>]*class="[^"]*outvei?w-tit[^"]*"[^>]*>([\s\S]*?)<\/strong>/i);
  return match ? stripTags(match[1]) || fallback : fallback;
}

function krDateRange(text) {
  if (/12세기\s*(전반|초|초반)/.test(text)) return { start: 1101, end: 1150, label: "고려, 12세기 전반" };
  if (/12세기\s*(중엽|중반)/.test(text)) return { start: 1135, end: 1165, label: "고려, 12세기 중엽" };
  if (/12세기\s*(후반|말)/.test(text)) return { start: 1151, end: 1200, label: "고려, 12세기 후반" };
  return { start: 1101, end: 1200, label: "고려, 12세기" };
}

function normalizeMaterial(value) {
  const material = value || "";
  if (material.includes("청자")) return "청자(靑磁)";
  if (material.includes("도자")) return "도자기";
  if (material.includes("금속")) return "금속";
  return material || "재질 정보 미상";
}

const NMK_SEARCH_TERMS = ["청자"];
const MAX_NMK_SEARCH_OFFSET = 2400;

function hasNonArtifactRecordMarker(text) {
  return /유리건판|원판번호|건판|사진자료|사진 자료/.test(text);
}

function hasOtherExplicitCentury(text) {
  return /(10|11|13|14|15|16|17|18|19|20)세기/.test(text) && !/12세기/.test(text);
}

async function collectNmkCandidates() {
  const seenCards = new Set();
  const candidates = [];

  for (const term of NMK_SEARCH_TERMS) {
    const pageSignatures = new Set();
    for (let start = 0; start < MAX_NMK_SEARCH_OFFSET; start += 12) {
      const url = `https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?searchId=search&schM=collectionList&query=${encodeURIComponent(term)}&startCount=${start}&collectionViewCount=12&pageSize=12&siteId=MUSEUM`;
      const html = await fetchText(url);
      const cards = parseNmkCards(html);
      if (!cards.length) break;

      const signature = cards.map((card) => card.relicId).join(",");
      if (pageSignatures.has(signature)) break;
      pageSignatures.add(signature);

      let added = 0;
      for (const card of cards) {
        if (!seenCards.has(card.relicId)) {
          seenCards.add(card.relicId);
          candidates.push(card);
          added += 1;
        }
      }
      if (start % 600 === 0) {
        console.log(`NMK term "${term}" start ${start}, added ${added}, total candidates ${candidates.length}`);
      }
    }
  }

  return candidates;
}

async function collectKoreanArtifacts() {
  const candidates = await collectNmkCandidates();
  const exact = [];
  const fallback = [];

  let index = 0;
  async function next() {
    while (index < candidates.length) {
      const card = candidates[index];
      index += 1;
      if (index % 50 === 0) {
        console.log(`NMK checked ${index}/${candidates.length}, exact ${exact.length}, fallback ${fallback.length}`);
      }
      const source = `https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?schM=view&searchId=search&relicId=${card.relicId}`;
      let detailHtml;
      try {
        detailHtml = await fetchText(source);
      } catch (error) {
        console.warn(`NMK detail skipped ${card.relicId}: ${error.message}`);
        continue;
      }
      const detailText = stripTags(detailHtml);
      if (!detailText.includes("한국 - 고려")) continue;
      if (hasOtherExplicitCentury(detailText)) continue;
      if (!`${card.title} ${detailText}`.includes("청자")) continue;

      const lines = linesFromHtml(detailHtml);
      const officialName = nmkDetailTitle(detailHtml, card.title);
      const alternate = lineAfter(lines, "다른명칭");
      const { name, nameHanja } = splitNameHanja(officialName, alternate.match(/[一-龥][一-龥\s·,]*/)?.[0] || "");
      const date = krDateRange(detailText);
      const material = normalizeMaterial(lineAfter(lines, "재질"));
      const itemNumber = lineAfter(lines, "소장품번호");
      const classification = lineAfter(lines, "분류");
      if (hasNonArtifactRecordMarker(`${card.title} ${officialName} ${classification} ${itemNumber}`)) continue;
      const category = material.includes("청자") || material.includes("도자") ? "ceramic" : "metalcraft";
      const isExactTwelfth = detailText.includes("12세기");
      const dateLabel = isExactTwelfth ? date.label : "고려, 공식 상세 세기 미상";
      const dateDescription = isExactTwelfth
        ? `공식 소장품 상세에서 확인되는 ${date.label}`
        : "공식 소장품 상세에서 고려 청자로 확인되며, 12세기 비교군으로 배치한";

      const artifact = {
        id: `kr-nmk-${card.relicId}`,
        name,
        nameHanja,
        holdingMuseumId: "nmk",
        holdingMuseumVerified: true,
        cultureRegion: "KR",
        yearStart: date.start,
        yearEnd: date.end,
        dateLabel,
        dateBasis: isExactTwelfth ? "object-record" : "assigned-comparison",
        dynasty: "고려",
        dynastyHanja: "高麗",
        category,
        ware: wareFor(category, name, nameHanja, material),
        material,
        origin: { ...KR_ORIGIN },
        image: card.image,
        imageLicense: "KOGL Type 1",
        imageCredit: "국립중앙박물관",
        source,
        description: `국립중앙박물관 ${dateDescription} ${CATEGORY_LABELS[category]} 유물입니다.${itemNumber ? ` 소장품번호: ${itemNumber}.` : ""}`
      };

      if (isExactTwelfth) {
        exact.push(artifact);
      } else {
        fallback.push(artifact);
      }
      if ((exact.length + fallback.length) % 25 === 0) {
        console.log(`NMK collected ${exact.length + fallback.length}: exact ${exact.length}, fallback ${fallback.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: 4 }, () => next()));
  return [...exact, ...fallback];
}

function parseDpmItems(html) {
  const items = [];
  const itemRegex = /<div class="item">([\s\S]*?)(?=<div class="item">|<\/div>\s*<\/div>\s*<script|$)/g;
  for (const match of html.matchAll(itemRegex)) {
    const block = match[1];
    const href = block.match(/<a href="([^"]+)"/)?.[1];
    const image = block.match(/<img src="([^"]+)"/)?.[1];
    const title = decodeHtml(block.match(/<div class="h20 t1" title="([^"]+)"/)?.[1] || stripTags(block.match(/<div class="h20 t1"[\s\S]*?<\/div>/)?.[0] || ""));
    const era = stripTags(block.match(/<div class="h16 t2">([\s\S]*?)<\/div>/)?.[1] || "");
    if (href && image && title) {
      items.push({
        href: absUrl(href, "https://www.dpm.org.cn"),
        image: absUrl(image, "https://www.dpm.org.cn"),
        title,
        era
      });
    }
  }
  return items;
}

function cnCategory(item) {
  const url = item.href;
  const title = item.title;
  if (url.includes("/ceramic/") || /窑|釉|瓷|陶|青花|白釉|青釉|钧窑|汝窑|官窑|龙泉/.test(title)) return "ceramic";
  if (/铜|金|银|鎏金|佛|瓶/.test(title) && !url.includes("paint")) return "metalcraft";
  return "painting";
}

function cnDynasty(era, title) {
  const text = `${era} ${title}`;
  if (text.includes("北宋")) {
    return {
      dynasty: "북송",
      dynastyHanja: "北宋",
      yearStart: 1101,
      yearEnd: 1127,
      dateLabel: "북송, 12세기 초",
      origin: CN_ORIGINS.north
    };
  }
  if (text.includes("南宋")) {
    return {
      dynasty: "남송",
      dynastyHanja: "南宋",
      yearStart: 1127,
      yearEnd: 1200,
      dateLabel: "남송, 12세기",
      origin: CN_ORIGINS.south
    };
  }
  return {
    dynasty: "송",
    dynastyHanja: "宋",
    yearStart: 1101,
    yearEnd: 1200,
    dateLabel: "송, 12세기",
    origin: CN_ORIGINS.song
  };
}

function transliterateCnSource(source) {
  if (source.includes("minghuaji.dpm.org.cn")) return "고궁박물원 명화기";
  if (source.includes("/shuziwenwu/")) return "고궁박물원 디지털 문물고";
  return "고궁박물원";
}

async function collectChineseArtifacts() {
  const filters = [
    ["991053", "북송"],
    ["990937", "남송"],
    ["990940", "송"]
  ];
  const raw = [];

  for (const [timeId] of filters) {
    const url = `https://www.dpm.org.cn/searchs/sixhundredsearch.html?times=${timeId}&types=&names=&tpl_file=gg600_collection2&dbg=0&category_id=442`;
    const html = await fetchText(url, {
      Referer: "https://www.dpm.org.cn/subject_600/collection.html",
      "X-Requested-With": "XMLHttpRequest"
    });
    raw.push(...parseDpmItems(html));
  }

  const collected = [];
  const seen = new Set();
  for (const item of raw) {
    if (seen.has(item.href)) continue;
    seen.add(item.href);

    const category = cnCategory(item);
    const date = cnDynasty(item.era, item.title);
    const sourceName = transliterateCnSource(item.href);
    const idSource = item.href.match(/(\d+)\.html/)?.[1] || item.href.match(/id=([^&]+)/)?.[1] || item.title;
    const id = `cn-gugong-${String(idSource).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}`;

    collected.push({
      id,
      name: item.title,
      nameHanja: item.title,
      holdingMuseumId: "gugong-bj",
      holdingMuseumVerified: true,
      cultureRegion: "CN",
      yearStart: date.yearStart,
      yearEnd: date.yearEnd,
      dateLabel: date.dateLabel,
      dateBasis: "dynasty",
      dynasty: date.dynasty,
      dynastyHanja: date.dynastyHanja,
      category,
      ware: wareFor(category, item.title),
      material: category === "ceramic" ? "도자기" : category === "metalcraft" ? "금속" : "종이/비단",
      origin: { ...date.origin },
      image: item.image,
      imageLicense: "공식 이미지 URL",
      imageCredit: sourceName,
      source: item.href,
      description: `${sourceName} 공식 소장품 목록에서 확인되는 ${date.dateLabel} ${CATEGORY_LABELS[category]} 유물입니다. 원 표기: ${item.era || date.dynastyHanja}.`
    });
  }

  return collected;
}

const kr = await collectKoreanArtifacts();
const cn = await collectChineseArtifacts();
const artifacts = [...kr, ...cn];

if (!kr.length) throw new Error("No Korean official artifacts collected.");
if (!cn.length) throw new Error("No Chinese official artifacts collected.");

const serialized = `window.ARTIFACTS = ${JSON.stringify(artifacts, null, 2)};\n`;
await writeFile(OUT, serialized, "utf8");

console.log(JSON.stringify({
  written: new URL(OUT).pathname,
  total: artifacts.length,
  kr: artifacts.filter((artifact) => artifact.cultureRegion === "KR").length,
  cn: artifacts.filter((artifact) => artifact.cultureRegion === "CN").length,
  museums: [...new Set(artifacts.map((artifact) => artifact.holdingMuseumId))],
  sample: artifacts.slice(0, 3).map((artifact) => ({ id: artifact.id, name: artifact.name, source: artifact.source }))
}, null, 2));
