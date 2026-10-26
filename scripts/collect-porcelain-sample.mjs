// Collects Joseon and Ming/Qing white and blue-and-white porcelain candidates
// into a review file. It never writes data/artifacts.js: candidates are merged
// only after a person has reviewed them (see docs/DATA.md).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROTECTED = resolve(ROOT, "data/artifacts.js");
const SOURCES = ["nmk", "dpm", "vam", "met"];
const WARES = ["white", "blue-and-white"];

const HELP = `Usage: node scripts/collect-porcelain-sample.mjs [options]

Collects white and blue-and-white porcelain candidates for review.
Writes only the review file; data/artifacts.js is never modified.

Options:
  --sources nmk,dpm,vam,met   Sources to query (default: all)
  --per-group N               Candidates kept per museum/culture/ware group (default: 30)
  --out PATH                  Review file (default: review/porcelain-candidates.json)
  --dry-run                   Query sources and print counts without writing a file
  --help                      Show this message and exit (no network requests)

Groups: nmk KR, dpm CN, vam KR, vam CN, met KR, met CN; each split into white and blue-and-white.
The Met's API may refuse automated requests on some networks; run that source where it is reachable.`;

function parseArgs(argv) {
  const options = { sources: SOURCES, perGroup: 30, out: "review/porcelain-candidates.json", dryRun: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) throw new Error(`${arg} needs a value`);
      index += 1;
      return next;
    };
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--sources") options.sources = value().split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--per-group") options.perGroup = Number(value());
    else if (arg === "--out") options.out = value();
    else throw new Error(`Unknown option ${arg}`);
  }
  const unknown = options.sources.filter((source) => !SOURCES.includes(source));
  if (unknown.length) throw new Error(`Unknown source(s): ${unknown.join(", ")}`);
  if (!Number.isInteger(options.perGroup) || options.perGroup < 1) throw new Error("--per-group must be a positive integer");
  const out = resolve(ROOT, options.out);
  if (out === PROTECTED) throw new Error("Refusing to write data/artifacts.js; choose a review file");
  options.outPath = out;
  return options;
}

// ---------- shared helpers ----------

const failures = [];

function sleep(ms) {
  return new Promise((done) => setTimeout(done, ms));
}

async function fetchWithRetry(url, { headers = {}, as = "text" } = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (attempt) await sleep(800 * attempt);
      const response = await fetch(url, {
        headers: { "User-Agent": "museum-globe-research/1.0 (+https://nay-museum.github.io/museum-globe/)", ...headers },
        signal: AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return as === "json" ? await response.json() : await response.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${url}: ${lastError.message}`);
}

// Records one failed request and keeps going; the review file lists every failure.
async function attempt(source, url, options) {
  try {
    return await fetchWithRetry(url, options);
  } catch (error) {
    failures.push({ source, url, error: error.message });
    return null;
  }
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
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function linesFromHtml(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function lineAfter(lines, label) {
  const index = lines.findIndex((line) => line === label);
  return index >= 0 ? lines[index + 1] || "" : "";
}

// Shards, photographs and modern pieces are not comparable objects.
const EXCLUDE = /(?:편|조각|파편|도편|묘지석|지석|유리건판|사진|모조|복제|fragment|sherd|shard|photograph|replica|reproduction|copy after|jiseok|epitaph|残片|标本|瓷片)/i;

function exclusionReason(text, yearStart, yearEnd) {
  if (EXCLUDE.test(text)) return "fragment, photograph or reproduction";
  if (yearEnd > 1911) return `made after 1911 (${yearStart}-${yearEnd})`;
  if (yearStart < 1368) return `made before 1368 (${yearStart}-${yearEnd})`;
  return null;
}

const ORIGINS = {
  gwangju: { lat: 37.4095, lng: 127.255, place: "경기도 광주 관요(분원) 일대 추정", certainty: "capital-fallback" },
  jingdezhenEstimate: { lat: 29.269, lng: 117.1784, place: "경덕진(景德鎭) 가마 일대 추정", certainty: "capital-fallback" },
  jingdezhenRecorded: { lat: 29.269, lng: 117.1784, place: "경덕진(景德鎭) 가마, 소장처 기록", certainty: "known" }
};

const JOSEON = { dynasty: "조선", dynastyHanja: "朝鮮", yearStart: 1392, yearEnd: 1897 };
const MING = { dynasty: "명", dynastyHanja: "明", yearStart: 1368, yearEnd: 1644 };
const QING = { dynasty: "청", dynastyHanja: "淸", yearStart: 1644, yearEnd: 1911 };

// Ming and Qing reign periods, as written in Palace Museum records (e.g. 明永乐).
const REIGNS = [
  ["明洪武", 1368, 1398], ["明建文", 1399, 1402], ["明永乐", 1403, 1424], ["明洪熙", 1425, 1425],
  ["明宣德", 1426, 1435], ["明正统", 1436, 1449], ["明景泰", 1450, 1457], ["明天顺", 1457, 1464],
  ["明成化", 1465, 1487], ["明弘治", 1488, 1505], ["明正德", 1506, 1521], ["明嘉靖", 1522, 1566],
  ["明隆庆", 1567, 1572], ["明万历", 1573, 1620], ["明泰昌", 1620, 1620], ["明天启", 1621, 1627],
  ["明崇祯", 1628, 1644], ["清顺治", 1644, 1661], ["清康熙", 1662, 1722], ["清雍正", 1723, 1735],
  ["清乾隆", 1736, 1795], ["清嘉庆", 1796, 1820], ["清道光", 1821, 1850], ["清咸丰", 1851, 1861],
  ["清同治", 1862, 1874], ["清光绪", 1875, 1908], ["清宣统", 1909, 1911]
];

function chineseDynasty(yearStart, yearEnd) {
  if (yearEnd <= 1644) return MING;
  if (yearStart >= 1644) return QING;
  return { dynasty: "명·청", dynastyHanja: "明·淸" };
}

function centuryLabel(yearStart, yearEnd) {
  const from = Math.ceil(yearStart / 100);
  const to = Math.ceil(yearEnd / 100);
  return from === to ? `${from}세기` : `${from}~${to}세기`;
}

// Classifies from the object's own title/medium text; null means "not plain white or blue-and-white".
// Mixed decoration (blue with iron or copper red, enamels) and qingbai are left out on purpose.
function wareFromText(text) {
  if (/철화|진사|동화|상감|청채|동채|鐵畵|辰砂|五彩|粉彩|斗彩|釉里红|青白|qingbai|iron|copper|famille|enamel|polychrome|overglaze/i.test(text)) return null;
  if (/청화|靑畵|靑華|青花|blue[- ]and[- ]white|underglaze (?:cobalt )?blue|cobalt blue/i.test(text)) return "blue-and-white";
  if (/백자|白磁|白瓷|甜白|白釉|white porcelain|white ware|blanc de chine/i.test(text)) return "white";
  return null;
}

function candidate(fields) {
  return {
    holdingMuseumVerified: true,
    ...fields,
    review: { status: "pending", notes: "", ...fields.review }
  };
}

// ---------- National Museum of Korea ----------

async function collectNmk(perGroup) {
  const out = [];
  const queries = { white: "백자", "blue-and-white": "백자 청화" };
  for (const ware of WARES) {
    const seen = new Set();
    for (let start = 0; start < perGroup * 6 && out.filter((item) => item.ware === ware).length < perGroup; start += 12) {
      const url = `https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?searchId=search&schM=collectionList&query=${encodeURIComponent(queries[ware])}&startCount=${start}&collectionViewCount=12&pageSize=12&siteId=MUSEUM`;
      const html = await attempt("nmk", url);
      if (!html) break;
      const cards = [...html.matchAll(/<li class="card">([\s\S]*?)<\/li>/g)].map((match) => ({
        relicId: match[1].match(/relicId=(\d+)/)?.[1],
        image: match[1].match(/<img src="([^"]+)"/)?.[1]
      })).filter((card) => card.relicId && card.image && !seen.has(card.relicId));
      if (!cards.length) break;

      for (const card of cards) {
        seen.add(card.relicId);
        const source = `https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?schM=view&searchId=search&relicId=${card.relicId}`;
        const detail = await attempt("nmk", source);
        if (!detail) continue;
        const lines = linesFromHtml(detail);
        // Same title element the main collector reads (the site spells it "outveiw").
        const title = stripTags(detail.match(/<strong[^>]*class="[^"]*outvei?w-tit[^"]*"[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || "");
        if (!title) {
          out.push({ id: `kr-nmk-${card.relicId}`, name: "", source, excluded: "title not found on detail page" });
          continue;
        }
        const [name, nameHanja = ""] = title.split(/\s*[（(]\s*/).map((part) => part.replace(/[）)]\s*$/, "").trim());
        const era = lineAfter(lines, "국적/시대");
        const material = lineAfter(lines, "재질");
        const text = `${title} ${material}`;
        const recordWare = wareFromText(text);
        // Only the record's own 국적/시대 field counts; page-wide text also holds unrelated items.
        const centuries = [...new Set((era.match(/1[4-9]세기/g) || []).map((value) => Number(value.slice(0, 2))))].sort();
        const dated = centuries.length > 0;
        const range = dated
          ? { yearStart: (centuries[0] - 1) * 100 + 1, yearEnd: centuries[centuries.length - 1] * 100 }
          : { yearStart: JOSEON.yearStart, yearEnd: JOSEON.yearEnd };
        const base = { id: `kr-nmk-${card.relicId}`, name: name || title, source };
        if (!/조선/.test(era)) {
          out.push({ ...base, excluded: `period is "${era || "unknown"}", not Joseon` });
          continue;
        }
        const excluded = exclusionReason(text, range.yearStart, range.yearEnd);
        if (excluded) {
          out.push({ ...base, excluded });
          continue;
        }
        if (recordWare !== ware) {
          out.push({ ...base, excluded: `ware reads as ${recordWare ?? "other decoration"} from "${title}"` });
          continue;
        }
        out.push(candidate({
          ...base,
          nameHanja,
          holdingMuseumId: "nmk",
          cultureRegion: "KR",
          ...range,
          dateLabel: dated ? `조선, ${centuryLabel(range.yearStart, range.yearEnd)}` : "조선",
          dateBasis: dated ? "object-record" : "dynasty",
          dynasty: JOSEON.dynasty,
          dynastyHanja: JOSEON.dynastyHanja,
          category: "ceramic",
          ware,
          material: material || "도자기 - 백자",
          origin: { ...ORIGINS.gwangju },
          image: new URL(decodeHtml(card.image), "https://www.museum.go.kr").href,
          imageLicense: "KOGL Type 1",
          imageCredit: "국립중앙박물관",
          description: `국립중앙박물관 소장품 상세의 국적/시대 표기: ${era}.${dated ? "" : " 세기 표기가 없어 조선 왕조 전체 범위로 둔다."}`,
          review: { sourceDate: era, sourcePlace: "", query: queries[ware] }
        }));
        if (out.filter((item) => item.ware === ware).length >= perGroup) break;
      }
    }
  }
  return out;
}

// ---------- Palace Museum, Beijing ----------

async function collectDpm(perGroup) {
  const out = [];
  const queries = { white: ["甜白", "白釉"], "blue-and-white": ["青花"] };
  for (const ware of WARES) {
    for (const query of queries[ware]) {
      for (let page = 1; page <= 20 && out.filter((item) => item.ware === ware).length < perGroup; page += 1) {
        const url = `https://www.dpm.org.cn/searchs/ceramics.html?names=${encodeURIComponent(query)}&p=${page}&dbg=0&category_id=90`;
        const html = await attempt("dpm", url, { headers: { "X-Requested-With": "XMLHttpRequest", Referer: "https://www.dpm.org.cn/collection/ceramics.html" } });
        if (!html) break;
        const rows = [...html.matchAll(/<div class="li">([\s\S]*?)(?=<div class="li">|$)/g)].map((match) => match[1]);
        if (!rows.length) break;

        for (const row of rows) {
          const href = row.match(/href="(\/collection\/ceramic\/(\d+)\.html)"/);
          if (!href) continue;
          const id = `cn-gugong-${href[2]}`;
          if (out.some((item) => item.id === id)) continue;
          const title = stripTags(row.replace(/<div class="box">[\s\S]*/, ""));
          const cells = [...row.matchAll(/<div class="span span(\d)">([\s\S]*?)<\/div>/g)].map((match) => [match[1], stripTags(match[2])]);
          const cell = (key) => cells.find(([index]) => index === key)?.[1] || "";
          const era = cell("2");
          const kiln = cell("4");
          const image = row.match(/<img src="([^"]+)"/)?.[1];
          const source = `https://www.dpm.org.cn${href[1]}`;
          const reign = REIGNS.find(([label]) => era.startsWith(label));
          const dynasty = era.startsWith("明") ? MING : era.startsWith("清") ? QING : null;
          const base = { id, name: title, source };
          if (!dynasty || !image) {
            out.push({ ...base, excluded: !image ? "no image" : `period is "${era || "unknown"}", not Ming or Qing` });
            continue;
          }
          const range = reign ? { yearStart: reign[1], yearEnd: reign[2] } : { yearStart: dynasty.yearStart, yearEnd: dynasty.yearEnd };
          const excluded = exclusionReason(title, range.yearStart, range.yearEnd);
          const recordWare = wareFromText(title);
          if (excluded || recordWare !== ware) {
            out.push({ ...base, excluded: excluded || `ware reads as ${recordWare ?? "other decoration"} from "${title}"` });
            continue;
          }
          out.push(candidate({
            ...base,
            nameHanja: title,
            holdingMuseumId: "gugong-bj",
            cultureRegion: "CN",
            ...range,
            dateLabel: reign ? `${era}, ${range.yearStart}~${range.yearEnd}` : era,
            dateBasis: reign ? "object-record" : "dynasty",
            dynasty: dynasty.dynasty,
            dynastyHanja: dynasty.dynastyHanja,
            category: "ceramic",
            ware,
            material: "자기(瓷器)",
            origin: { ...(kiln.includes("景德镇") ? ORIGINS.jingdezhenRecorded : ORIGINS.jingdezhenEstimate) },
            image: new URL(image, "https://www.dpm.org.cn").href,
            imageLicense: "공식 이미지 URL",
            imageCredit: "고궁박물원",
            description: `고궁박물원 도자 소장품 목록의 시대 표기: ${era}${kiln ? `, 가마: ${kiln}` : ""}.`,
            review: { sourceDate: era, sourcePlace: kiln, query }
          }));
          if (out.filter((item) => item.ware === ware).length >= perGroup) break;
        }
      }
    }
  }
  return out;
}

// ---------- Victoria and Albert Museum ----------

const VAM_PLACES = { KR: "x30965", CN: "x29398" };

async function collectVam(perGroup) {
  const out = [];
  // Korean holdings are small, so one broad query is sorted by ware; Chinese holdings need targeted queries.
  const queries = { KR: ["porcelain"], CN: ["blue and white porcelain", "white porcelain"] };
  const kept = (culture, ware) => out.filter((item) => item.cultureRegion === culture && item.ware === ware).length;
  for (const culture of ["KR", "CN"]) {
    const range = culture === "KR" ? [JOSEON.yearStart, 1910] : [MING.yearStart, QING.yearEnd];
    const full = () => WARES.every((ware) => kept(culture, ware) >= perGroup);
    for (const query of queries[culture]) {
      for (let page = 1; page <= 15 && !full(); page += 1) {
        const url = `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(query)}&id_place=${VAM_PLACES[culture]}&images_exist=1&year_made_from=${range[0]}&year_made_to=${range[1]}&page_size=30&page=${page}`;
        const result = await attempt("vam", url, { as: "json" });
        if (!result?.records?.length) break;

        for (const summary of result.records) {
          if (full()) break;
          const id = `${culture === "KR" ? "kr" : "cn"}-vam-${summary.systemNumber}`;
          if (out.some((item) => item.id === id)) continue;
          const title = summary._primaryTitle || summary.objectType || "";
          const source = `https://collections.vam.ac.uk/item/${summary.systemNumber}/`;
          const base = { id, name: title, source };
          // Skip the detail request for records the summary already rules out.
          if (EXCLUDE.test(`${title} ${summary.objectType || ""}`)) {
            out.push({ ...base, excluded: "fragment, photograph or reproduction" });
            continue;
          }
          const iiif = summary._images?._iiif_image_base_url;
          if (!iiif) {
            out.push({ ...base, excluded: "no IIIF image" });
            continue;
          }
          const detail = await attempt("vam", `https://api.vam.ac.uk/v2/museumobject/${summary.systemNumber}`, { as: "json" });
          const record = detail?.record;
          if (!record) continue;
          const made = record.productionDates?.[0];
          const yearStart = Number(made?.date?.earliest?.slice(0, 4));
          const yearEnd = Number(made?.date?.latest?.slice(0, 4));
          const places = (record.placesOfOrigin || []).map((item) => item.place?.text).filter(Boolean);
          const text = `${title} ${summary.objectType || ""} ${record.materialsAndTechniques || ""} ${record.briefDescription || ""}`;
          if (!Number.isInteger(yearStart) || !Number.isInteger(yearEnd)) {
            out.push({ ...base, excluded: `no machine-readable production date ("${made?.date?.text || ""}")` });
            continue;
          }
          const excluded = exclusionReason(text, yearStart, yearEnd);
          const ware = wareFromText(text);
          if (excluded || !ware) {
            out.push({ ...base, excluded: excluded || "not plain white or blue-and-white" });
            continue;
          }
          if (kept(culture, ware) >= perGroup) continue;
          const dynasty = culture === "KR" ? JOSEON : chineseDynasty(yearStart, yearEnd);
          const origin = culture === "CN"
            ? { ...(places.includes("Jingdezhen") ? ORIGINS.jingdezhenRecorded : ORIGINS.jingdezhenEstimate) }
            : { ...ORIGINS.gwangju };
          out.push(candidate({
            ...base,
            name: title || summary.objectType,
            nameHanja: "",
            holdingMuseumId: "vam",
            cultureRegion: culture,
            yearStart,
            yearEnd,
            dateLabel: `${dynasty.dynasty}, ${made.date.text}`,
            dateBasis: "object-record",
            dynasty: dynasty.dynasty,
            dynastyHanja: dynasty.dynastyHanja,
            category: "ceramic",
            ware,
            material: record.materialsAndTechniques || "Porcelain",
            origin,
            image: `${iiif}full/!800,800/0/default.jpg`,
            imageLicense: "V&A 웹사이트 이용조건(비상업적 이용)",
            imageCredit: "© Victoria and Albert Museum, London",
            description: `V&A 소장품 기록의 제작 연대: ${made.date.text}; 제작지: ${places.join(", ") || "미기재"}.${made.note ? ` 기록 메모: ${made.note}` : ""}`,
            review: { sourceDate: made.date.text, sourcePlace: places.join(", "), query }
          }));
        }
      }
    }
  }
  return out;
}

// ---------- The Metropolitan Museum of Art ----------

async function collectMet(perGroup) {
  const out = [];
  const queries = { white: "white porcelain", "blue-and-white": "blue and white porcelain" };
  for (const culture of ["KR", "CN"]) {
    const geo = culture === "KR" ? "Korea" : "China";
    const range = culture === "KR" ? [JOSEON.yearStart, 1910] : [MING.yearStart, QING.yearEnd];
    for (const ware of WARES) {
      const url = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&geoLocation=${geo}&dateBegin=${range[0]}&dateEnd=${range[1]}&q=${encodeURIComponent(queries[ware])}`;
      const result = await attempt("met", url, { as: "json" });
      for (const objectId of (result?.objectIDs || []).slice(0, perGroup * 4)) {
        if (out.filter((item) => item.cultureRegion === culture && item.ware === ware && !item.excluded).length >= perGroup) break;
        const prefix = culture === "KR" ? "kr" : "cn";
        const id = `${prefix}-met-${objectId}`;
        if (out.some((item) => item.id === id)) continue;
        await sleep(100);
        const record = await attempt("met", `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`, { as: "json" });
        if (!record) continue;
        const base = { id, name: record.title, source: record.objectURL };
        const text = `${record.title} ${record.medium} ${record.classification}`;
        const excluded = exclusionReason(text, record.objectBeginDate, record.objectEndDate);
        const recordWare = wareFromText(text);
        if (!record.isPublicDomain || !record.primaryImageSmall) {
          out.push({ ...base, excluded: "not public domain or no image" });
          continue;
        }
        if (excluded || recordWare !== ware) {
          out.push({ ...base, excluded: excluded || `ware reads as ${recordWare ?? "other decoration"}` });
          continue;
        }
        const dynasty = culture === "KR" ? JOSEON : chineseDynasty(record.objectBeginDate, record.objectEndDate);
        out.push(candidate({
          ...base,
          nameHanja: "",
          holdingMuseumId: "met",
          cultureRegion: culture,
          yearStart: record.objectBeginDate,
          yearEnd: record.objectEndDate,
          dateLabel: `${dynasty.dynasty}, ${record.objectDate}`,
          dateBasis: "object-record",
          dynasty: dynasty.dynasty,
          dynastyHanja: dynasty.dynastyHanja,
          category: "ceramic",
          ware,
          material: record.medium || "Porcelain",
          origin: culture === "KR" ? { ...ORIGINS.gwangju } : { ...ORIGINS.jingdezhenEstimate },
          image: record.primaryImageSmall,
          imageLicense: "CC0 (The Met Open Access)",
          imageCredit: "The Metropolitan Museum of Art",
          description: `The Met 소장품 기록의 연대: ${record.objectDate}; ${[record.period, record.reign].filter(Boolean).join(", ") || "시대 표기 없음"}.`,
          review: { sourceDate: record.objectDate, sourcePlace: [record.country, record.city].filter(Boolean).join(", "), query: queries[ware] }
        }));
      }
    }
  }
  return out;
}

// ---------- main ----------

const COLLECTORS = { nmk: collectNmk, dpm: collectDpm, vam: collectVam, met: collectMet };

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`${error.message}\n\n${HELP}`);
  process.exit(2);
}
if (options.help) {
  console.log(HELP);
  process.exit(0);
}

const collected = [];
for (const source of options.sources) {
  console.log(`Collecting ${source}...`);
  collected.push(...await COLLECTORS[source](options.perGroup));
}

const byId = (a, b) => a.id.localeCompare(b.id);
const candidates = collected.filter((item) => !item.excluded).sort(byId);
const excluded = collected.filter((item) => item.excluded).sort(byId);
const groups = {};
for (const item of candidates) {
  const key = `${item.holdingMuseumId} ${item.cultureRegion} ${item.ware}`;
  groups[key] = (groups[key] || 0) + 1;
}

const report = {
  collectedAt: new Date().toISOString(),
  note: "Review file only. Nothing here is in data/artifacts.js until a reviewer approves it.",
  options: { sources: options.sources, perGroup: options.perGroup },
  counts: { candidates: candidates.length, excluded: excluded.length, failures: failures.length, groups },
  candidates,
  excluded,
  failures
};

console.log(JSON.stringify(report.counts, null, 2));
if (options.dryRun) {
  console.log("Dry run: no file written.");
} else {
  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${relative(ROOT, options.outPath)}`);
}
if (failures.length) console.warn(`WARN: ${failures.length} request(s) failed; see "failures" in the report.`);
