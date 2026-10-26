// Interface language (Korean or English). Loaded first so every other script can use window.I18N.
// Data values are translated only from the fixed vocabularies below; object names stay as each museum records them.
(function () {
  const STORAGE_KEY = "museumGlobe.lang";
  const LANGS = ["ko", "en"];

  const STRINGS = {
    ko: {
      title: "동시대 유물 지구본",
      workspaceAria: "3D 유물 지도",
      langAria: "언어",
      intro: "소개",
      about: "About",
      autoRotate: "자동 회전",
      empty: "이 시기에는 표시할 위치가 확정된 유물이 없습니다.",
      timelineAria: "세기 이동",
      prevCentury: "이전 데이터 세기",
      nextCentury: "다음 데이터 세기",
      chooseCentury: "세기 선택",
      sideAria: "필터와 유물 정보",
      search: "검색",
      searchPlaceholder: "유물명, 한자, 재질, 소장처",
      cultureAria: "문화권 필터",
      KR: "한국",
      CN: "중국",
      category: "분류",
      all: "전체",
      metalcraft: "금속공예",
      ceramic: "도자",
      painting: "회화",
      wareFilter: "도자 종류",
      celadon: "청자",
      white: "백자",
      "blue-and-white": "청화백자",
      legendKR: "한국 문화권",
      legendCN: "중국 문화권",
      legendEstimated: "추정 위치",
      detailPlaceholder: "지구본의 마커 또는 비교 리스트의 유물을 선택하세요.",
      compareTitle: "동시대 비교",
      count: "{n}점",
      unknownList: "위치 불명",
      date: "연대",
      dateBasis: "연대 근거",
      dynasty: "왕조",
      ware: "종류",
      material: "재질",
      place: "위치",
      museum: "소장처",
      licence: "라이선스",
      credit: "크레딧",
      source: "출처 열기",
      closeDetails: "유물 정보 닫기",
      "basis.object-record": "소장품 기록의 연대",
      "basis.dynasty": "왕조 범위로 추정",
      "basis.assigned-comparison": "연대 미상, 비교용 배치",
      "certainty.known": "소장처 기록 위치",
      "certainty.capital-fallback": "추정 위치",
      "certainty.unknown": "위치 불명",
      "certaintyShort.known": "기록",
      "certaintyShort.capital-fallback": "추정",
      "certaintyShort.unknown": "불명",
      period: "{c}세기 — 中 {cn} ↔ 韓 {kr}"
    },
    en: {
      title: "Contemporaneous Objects Globe",
      workspaceAria: "3D map of museum objects",
      langAria: "Language",
      intro: "소개",
      about: "About",
      autoRotate: "Auto-rotate",
      empty: "No objects with a mapped location in this century.",
      timelineAria: "Move by century",
      prevCentury: "Previous century with objects",
      nextCentury: "Next century with objects",
      chooseCentury: "Choose a century",
      sideAria: "Filters and object details",
      search: "Search",
      searchPlaceholder: "Name, Chinese characters, material, museum",
      cultureAria: "Culture filter",
      KR: "Korea",
      CN: "China",
      category: "Category",
      all: "All",
      metalcraft: "Metalwork",
      ceramic: "Ceramics",
      painting: "Painting",
      wareFilter: "Ware",
      celadon: "Celadon",
      white: "White porcelain",
      "blue-and-white": "Blue-and-white",
      legendKR: "Korean",
      legendCN: "Chinese",
      legendEstimated: "Estimated place",
      detailPlaceholder: "Select a marker on the globe or an object in the list.",
      compareTitle: "Side by side",
      count: "{n} objects",
      unknownList: "Place unknown",
      date: "Date",
      dateBasis: "Date basis",
      dynasty: "Dynasty",
      ware: "Ware",
      material: "Material",
      place: "Place",
      museum: "Museum",
      licence: "Licence",
      credit: "Credit",
      source: "View source",
      closeDetails: "Close object details",
      "basis.object-record": "From the museum record",
      "basis.dynasty": "Dynasty range only",
      "basis.assigned-comparison": "Undated; placed for comparison",
      "certainty.known": "Recorded by the museum",
      "certainty.capital-fallback": "Estimated",
      "certainty.unknown": "Unknown",
      "certaintyShort.known": "recorded",
      "certaintyShort.capital-fallback": "estimated",
      "certaintyShort.unknown": "unknown",
      period: "{ord} century — China: {cn} ↔ Korea: {kr}"
    }
  };

  // English for the fixed Korean values that appear in data/artifacts.js.
  const DYNASTY_EN = {
    "고려": "Goryeo", "조선": "Joseon", "명": "Ming", "청": "Qing", "명·청": "Ming–Qing",
    "북송": "Northern Song", "남송": "Southern Song", "송": "Song", "明": "Ming", "清": "Qing"
  };
  const PLACE_EN = {
    "강진 가마터 추정": "Gangjin kilns (estimated)",
    "경기도 광주 관요(분원) 일대 추정": "Gwangju royal kilns, Gyeonggi (estimated)",
    "경덕진(景德鎭) 가마, 소장처 기록": "Jingdezhen kilns (museum record)",
    "경덕진(景德鎭) 가마 일대 추정": "Jingdezhen kilns (estimated)",
    "덕화(德化) 가마, 소장처 기록(기물명)": "Dehua kilns (named in the object title)",
    "덕화(德化) 가마, 소장처 기록": "Dehua kilns (museum record)",
    "변경, 현 허난성 카이펑 추정": "Bianjing, now Kaifeng, Henan (estimated)",
    "임안, 현 저장성 항저우 추정": "Lin'an, now Hangzhou, Zhejiang (estimated)",
    "송대 중국 동부 지역 추정": "Eastern China in the Song period (estimated)"
  };
  const MATERIAL_EN = {
    "청자(靑磁)": "Celadon", "도자기": "Ceramic", "도자기 - 백자": "Ceramic – white porcelain",
    "자기(瓷器)": "Porcelain", "종이/비단": "Paper or silk", "금속": "Metal"
  };
  const LICENCE_EN = {
    "공식 이미지 URL": "Official image URL (no licence recorded)",
    "V&A 웹사이트 이용조건(비상업적 이용)": "V&A terms of use (non-commercial)"
  };
  const CREDIT_EN = {
    "국립중앙박물관": "National Museum of Korea",
    "고궁박물원": "Palace Museum, Beijing",
    "고궁박물원 명화기": "Palace Museum, Beijing (Famous Paintings)",
    "고궁박물원 디지털 문물고": "Palace Museum, Beijing (Digital Collection)"
  };

  function ordinal(n) {
    const tens = n % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
  }

  // Korean date phrases written by the collectors, e.g. "12세기 전반" or "공식 상세 세기 미상".
  function datePhraseEn(text) {
    const rules = [
      [/^공식 상세 세기 미상$/, () => "century not recorded"],
      [/^(\d+)세기 전반$/, (m) => `first half of the ${ordinal(+m[1])} century`],
      [/^(\d+)세기 중엽$/, (m) => `mid-${ordinal(+m[1])} century`],
      [/^(\d+)세기 후반$/, (m) => `second half of the ${ordinal(+m[1])} century`],
      [/^(\d+)세기 초$/, (m) => `early ${ordinal(+m[1])} century`],
      [/^(\d+)세기$/, (m) => `${ordinal(+m[1])} century`],
      [/^(\d{3,4})~(\d{3,4})$/, (m) => `${m[1]}–${m[2]}`]
    ];
    for (const [pattern, format] of rules) {
      const match = text.match(pattern);
      if (match) return format(match);
    }
    return text;
  }

  function dateLabelEn(label) {
    const comma = label.indexOf(", ");
    if (comma < 0) return DYNASTY_EN[label] || label;
    const head = label.slice(0, comma);
    return `${DYNASTY_EN[head] || head}, ${datePhraseEn(label.slice(comma + 2))}`;
  }

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function store(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Private windows may refuse storage; the choice then lasts for this page only.
    }
  }

  const stored = readStored();
  let lang = LANGS.includes(stored) ? stored : (/^ko\b/i.test(navigator.language || "") ? "ko" : "en");
  const listeners = [];

  function t(key, vars = {}) {
    const text = STRINGS[lang][key] ?? STRINGS.ko[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
  }

  // Static markup opts in with data-i18n (text), data-i18n-placeholder, data-i18n-aria-label,
  // and data-lang-only (shown only in that language).
  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => { node.setAttribute("aria-label", t(node.dataset.i18nAriaLabel)); });
    root.querySelectorAll("[data-lang-only]").forEach((node) => { node.hidden = node.dataset.langOnly !== lang; });
    root.querySelectorAll("[data-set-lang]").forEach((node) => { node.setAttribute("aria-pressed", String(node.dataset.setLang === lang)); });
  }

  function set(next) {
    if (!LANGS.includes(next) || next === lang) return;
    lang = next;
    store(lang);
    apply();
    listeners.forEach((listener) => listener(lang));
  }

  window.I18N = {
    get lang() { return lang; },
    t,
    set,
    apply,
    ordinal,
    onChange(listener) { listeners.push(listener); },
    data: {
      dateLabel: (value) => (lang === "en" ? dateLabelEn(String(value || "")) : value),
      dynasty: (value) => (lang === "en" ? DYNASTY_EN[value] || value : value),
      place: (value) => (lang === "en" ? PLACE_EN[value] || value : value),
      material: (value) => (lang === "en" ? MATERIAL_EN[value] || value : value),
      licence: (value) => (lang === "en" ? LICENCE_EN[value] || value : value),
      credit: (value) => (lang === "en" ? CREDIT_EN[value] || value : value)
    }
  };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-lang]");
    if (button) set(button.dataset.setLang);
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply());
  else apply();
})();
