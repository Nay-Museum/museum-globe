import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("FAIL: node scripts/check.mjs requires Node.js 22 or newer.");
  process.exit(1);
}

const ROOT = realpathSync(fileURLToPath(new URL("..", import.meta.url)));
const errors = [];
const fail = (where, message) => errors.push(`${where}: ${message}`);
const dataFiles = {
  "data/texture.js": "EARTH_TEXTURE",
  "data/museums.js": "MUSEUMS",
  "data/periods.js": "PERIODS",
  "data/artifacts.js": "ARTIFACTS"
};
const browserScripts = ["vendor/globe.gl.min.js", ...Object.keys(dataFiles), "js/app.js"];
const syntaxFiles = new Set([...browserScripts, "scripts/collect-official-artifacts.mjs", "scripts/check.mjs"]);
const localAssets = new Set();
const cultures = ["KR", "CN"];
const categories = ["ceramic", "metalcraft", "painting"];
const certainties = ["known", "capital-fallback", "unknown"];
const museumCountries = ["KR", "CN", "GB", "US"];
const wares = ["celadon", "white", "blue-and-white"];
const dateBases = ["object-record", "dynasty", "assigned-comparison"];
const officialHosts = ["museum.go.kr", "dpm.org.cn", "vam.ac.uk", "metmuseum.org"];

function read(file) {
  try {
    return readFileSync(resolve(ROOT, file), "utf8");
  } catch (error) {
    fail(file, error.message);
    return null;
  }
}

function outsideRoot(file) {
  const path = relative(ROOT, file);
  return isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`);
}

function localFile(reference, where) {
  try {
    const path = decodeURIComponent(reference.split(/[?#]/)[0]);
    const file = resolve(ROOT, path);
    if (!path || isAbsolute(path) || /^[a-z][\w+.-]*:/i.test(path) || outsideRoot(file)) {
      throw new Error("expected a relative file path inside the project");
    }
    if (outsideRoot(realpathSync(file))) throw new Error("symlink points outside the project");
    if (!statSync(file).isFile()) throw new Error("expected a regular file");
    const name = relative(ROOT, file).split(sep).join("/");
    localAssets.add(name);
    return name;
  } catch (error) {
    fail(where, `${JSON.stringify(reference)}: ${error.message}`);
    return null;
  }
}

const html = read("index.html");
if (html !== null) {
  const scripts = [];
  let styles = 0;
  // Only script/link attributes are needed for this static, dependency-free page.
  for (const [, tag, attributes] of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const attrs = Object.fromEntries([...attributes.matchAll(/([a-z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)]
      .map(([, key, double, single, bare]) => [key.toLowerCase(), double ?? single ?? bare]));
    const script = tag.toLowerCase() === "script";
    if (!script && !attrs.rel?.toLowerCase().split(/\s+/).includes("stylesheet")) continue;
    const reference = script ? attrs.src : attrs.href;
    if (reference === undefined) {
      if (!script) fail("index.html", "stylesheet link is missing href");
      continue;
    }
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference)) continue;
    const file = localFile(reference, "index.html");
    if (!file) continue;
    if (script) {
      scripts.push(file);
      syntaxFiles.add(file);
    } else {
      styles += 1;
    }
  }
  if (!styles) fail("index.html", "no local stylesheet found");
  for (const file of browserScripts) {
    if (!scripts.includes(file)) fail("index.html", `missing essential script ${file}`);
    else if (file !== "js/app.js" && scripts.indexOf(file) > scripts.indexOf("js/app.js")) {
      fail("index.html", `${file} must load before js/app.js`);
    }
  }
}

// --check parses sources without executing the app, vendor bundle, or collector.
for (const file of syntaxFiles) {
  const result = spawnSync(process.execPath, ["--check", resolve(ROOT, file)], {
    encoding: "utf8",
    timeout: 10_000
  });
  if (result.error || result.status !== 0) {
    fail(file, `node --check failed: ${result.error?.message || result.stderr.trim() || `exit ${result.status}`}`);
  }
}

const data = {};
for (const [file, global] of Object.entries(dataFiles)) {
  const source = read(file);
  if (source === null) continue;
  try {
    // Trusted repository data only. vm is not a security boundary for untrusted code.
    const context = createContext({ window: Object.create(null) }, {
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: "afterEvaluate"
    });
    runInContext(source, context, { filename: file, timeout: 1_000 });
    if (!Object.hasOwn(context.window, global)) throw new Error(`missing essential window.${global}`);
    data[global] = context.window[global];
  } catch (error) {
    fail(file, `cannot load window.${global}: ${error.message}`);
  }
}

function record(value, where) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(where, "expected an object");
    return false;
  }
  return true;
}

function strings(value, fields, where) {
  for (const field of fields) {
    if (typeof value[field] !== "string" || (field !== "nameHanja" && !value[field].trim())) {
      fail(`${where}.${field}`, `expected ${field === "nameHanja" ? "a string (may be empty)" : "a nonempty string"}`);
    }
  }
}

function dataset(global, file) {
  const value = data[global];
  if (!Array.isArray(value) || !value.length) {
    fail(file, `window.${global} must be a nonempty array`);
    return [];
  }
  return value;
}

function coordinates(value, where) {
  for (const [key, limit] of [["lat", 90], ["lng", 180]]) {
    if (!Number.isFinite(value[key]) || Math.abs(value[key]) > limit) {
      fail(`${where}.${key}`, `expected a finite number between ${-limit} and ${limit}`);
    }
  }
}

function uniqueId(value, ids, where) {
  if (typeof value.id !== "string" || !value.id.trim()) return;
  if (ids.has(value.id)) fail(`${where}.id`, `duplicate ID ${JSON.stringify(value.id)}`);
  ids.add(value.id);
}

function httpsUrl(value, where, officialSource = false) {
  if (typeof value !== "string" || !value.trim()) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error("expected an absolute HTTPS URL without credentials");
    }
    if (officialSource && !officialHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
      throw new Error(`source hostname must be one of ${officialHosts.join(", ")} or their subdomains`);
    }
    // Images may use HTTPS CDNs, including DPM's myqcloud.com image host.
  } catch (error) {
    fail(where, `${JSON.stringify(value)}: ${error.message}`);
  }
}

const museums = dataset("MUSEUMS", "data/museums.js");
const museumIds = new Set();
const museumById = new Map();
for (const [index, museum] of museums.entries()) {
  const where = `data/museums.js[${index}] (${museum?.id ?? "missing id"})`;
  if (!record(museum, where)) continue;
  strings(museum, ["id", "name", "nameHanja", "country", "city", "color"], where);
  uniqueId(museum, museumIds, where);
  if (!museumCountries.includes(museum.country)) fail(`${where}.country`, `expected ${museumCountries.join(", ")}`);
  coordinates(museum, where);
  museumById.set(museum.id, museum);
}

if (record(data.PERIODS, "data/periods.js window.PERIODS")) {
  for (const [century, period] of Object.entries(data.PERIODS)) {
    const where = `data/periods.js[${century}]`;
    if (!/^[1-9]\d*$/.test(century)) fail(where, "century key must be a positive integer");
    if (record(period, where)) strings(period, ["kr", "cn"], where);
  }
  for (let century = 5; century <= 19; century += 1) {
    if (!Object.hasOwn(data.PERIODS, century)) fail("data/periods.js", `missing timeline century ${century}`);
  }
}

strings(data, ["EARTH_TEXTURE"], "data/texture.js window");
if (typeof data.EARTH_TEXTURE === "string" && data.EARTH_TEXTURE.trim()) {
  localFile(data.EARTH_TEXTURE, "data/texture.js window.EARTH_TEXTURE");
}

const artifacts = dataset("ARTIFACTS", "data/artifacts.js");
const artifactIds = new Set();
for (const [index, artifact] of artifacts.entries()) {
  const where = `data/artifacts.js[${index}] (${artifact?.id ?? "missing id"})`;
  if (!record(artifact, where)) continue;
  strings(artifact, ["id", "name", "nameHanja", "holdingMuseumId", "cultureRegion", "dateLabel", "dateBasis", "dynasty", "dynastyHanja", "category", "material", "image", "imageLicense", "imageCredit", "source", "description"], where);
  uniqueId(artifact, artifactIds, where);
  if (!cultures.includes(artifact.cultureRegion)) fail(`${where}.cultureRegion`, "expected KR or CN");
  if (!categories.includes(artifact.category)) fail(`${where}.category`, `expected ${categories.join(", ")}`);
  if (!dateBases.includes(artifact.dateBasis)) fail(`${where}.dateBasis`, `expected ${dateBases.join(", ")}`);
  // ware is null when the record does not name a glaze type; only ceramics may carry one.
  if (!Object.hasOwn(artifact, "ware")) fail(`${where}.ware`, "missing (use null when not identified)");
  else if (artifact.ware !== null && !wares.includes(artifact.ware)) fail(`${where}.ware`, `expected null or ${wares.join(", ")}`);
  else if (artifact.ware !== null && artifact.category !== "ceramic") fail(`${where}.ware`, "only ceramic records may set ware");
  if (typeof artifact.holdingMuseumVerified !== "boolean") fail(`${where}.holdingMuseumVerified`, "expected a Boolean");
  const museum = museumById.get(artifact.holdingMuseumId);
  // cultureRegion describes the object, not the holder: the V&A and the Met hold KR and CN objects.
  if (!museum) fail(`${where}.holdingMuseumId`, `unknown museum ${JSON.stringify(artifact.holdingMuseumId)}`);
  for (const field of ["yearStart", "yearEnd"]) {
    if (!Number.isFinite(artifact[field]) || !Number.isInteger(artifact[field])) fail(`${where}.${field}`, "expected a finite integer");
  }
  if (artifact.yearStart > artifact.yearEnd) fail(where, "yearStart must be <= yearEnd");
  if (record(artifact.origin, `${where}.origin`)) {
    strings(artifact.origin, ["place", "certainty"], `${where}.origin`);
    if (!certainties.includes(artifact.origin.certainty)) fail(`${where}.origin.certainty`, `expected ${certainties.join(", ")}`);
    if (artifact.origin.certainty === "unknown") {
      if (artifact.origin.lat !== null || artifact.origin.lng !== null) fail(`${where}.origin`, "unknown origin requires null lat and lng");
    } else {
      coordinates(artifact.origin, `${where}.origin`);
    }
  }
  httpsUrl(artifact.source, `${where}.source`, true);
  httpsUrl(artifact.image, `${where}.image`);
}

const counts = (values, select) => values.map((value) => `${value}=${artifacts.filter((item) => item && select(item) === value).length}`).join(", ");
const missingCentury = artifacts.filter((item) => typeof item?.dateLabel === "string" && /\uC138\uAE30\s*(\uBBF8\uC0C1|\uBD88\uBA85)/.test(item.dateLabel)).length;
console.log(`Offline check: ${syntaxFiles.size} JavaScript syntax checks, ${localAssets.size} local assets, ${museums.length} museums, ${artifacts.length} artifacts.`);
console.log(`Cultures: ${counts(cultures, (item) => item.cultureRegion)}. Categories: ${counts(categories, (item) => item.category)}.`);
console.log(`Origins: ${counts(certainties, (item) => item.origin?.certainty)}.`);
console.log(`Date basis: ${counts(dateBases, (item) => item.dateBasis)}. Ware: ${counts([...wares, null], (item) => item.ware)}.`);
console.log(`Holding museums: ${counts(museums.map((museum) => museum.id), (item) => item.holdingMuseumId)}.`);
console.warn(`WARN metadata: ${missingCentury} century-unknown records; the collector assigns artificial 12th-century comparison ranges to these records. Dynasty-based ranges are also approximations, not independently established dates.`);
console.warn("WARN metadata: capital-fallback coordinates are estimates, not proven findspots; displayed marker offsets are not historical facts.");
console.warn("WARN scope: offline structure/syntax only; no network, provenance, image-rights/license, or browser verification. holdingMuseumVerified is stored metadata, not independently verified here.");
if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  console.error(`FAIL: ${errors.length} offline check error(s).`);
  process.exitCode = 1;
} else {
  console.log("PASS: offline checks passed.");
}
