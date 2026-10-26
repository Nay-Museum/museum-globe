(function () {
  const state = {
    century: 12,
    cultures: new Set(["KR", "CN"]),
    category: "all",
    ware: "all",
    search: "",
    selectedId: null
  };

  const artifacts = window.ARTIFACTS || [];
  const museums = new Map((window.MUSEUMS || []).map((museum) => [museum.id, museum]));
  const i18n = window.I18N;
  const t = i18n.t;
  const tr = i18n.data;
  const pointCoordinates = buildPointCoordinates();

  const el = {
    globe: document.getElementById("globe"),
    periodHud: document.getElementById("periodHud"),
    centuryRange: document.getElementById("centuryRange"),
    centuryLabel: document.getElementById("centuryLabel"),
    tickRow: document.getElementById("tickRow"),
    prevCentury: document.getElementById("prevCentury"),
    nextCentury: document.getElementById("nextCentury"),
    searchInput: document.getElementById("searchInput"),
    categoryFilter: document.getElementById("categoryFilter"),
    wareFilter: document.getElementById("wareFilter"),
    cultureButtons: Array.from(document.querySelectorAll("[data-culture]")),
    detailCard: document.getElementById("detailCard"),
    krList: document.getElementById("krList"),
    cnList: document.getElementById("cnList"),
    unknownList: document.getElementById("unknownList"),
    resultCount: document.getElementById("resultCount"),
    emptyState: document.getElementById("emptyState"),
    globePopover: document.getElementById("globePopover"),
    rotateToggle: document.getElementById("rotateToggle")
  };

  const globe = Globe()(el.globe)
    .globeImageUrl(window.EARTH_TEXTURE)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true)
    .atmosphereColor("#9fc9cf")
    .atmosphereAltitude(0.13)
    .pointLat((d) => displayOrigin(d).lat)
    .pointLng((d) => displayOrigin(d).lng)
    .pointAltitude((d) => (d.origin.certainty === "capital-fallback" ? 0.035 : 0.025))
    .pointRadius((d) => (d.id === state.selectedId ? 0.26 : 0.12))
    .pointResolution(24)
    .pointColor((d) => d.cultureRegion === "KR" ? "#b8324a" : "#216c7a")
    .pointLabel((d) => `${escapeHtml(d.name)}<br>${escapeHtml(tr.dateLabel(d.dateLabel))}`)
    .pointsTransitionDuration(260)
    .onPointClick((artifact) => selectArtifact(artifact.id))
    .pointOfView({ lat: 34, lng: 118, altitude: 2.05 }, 0);

  globe.controls().autoRotate = true;
  globe.controls().autoRotateSpeed = 0.24;
  globe.controls().enableDamping = true;
  globe.controls().enableRotate = true;
  globe.controls().enableZoom = true;

  function syncGlobeInteractionState() {
    const camera = globe.camera().position;
    const controls = globe.controls();
    el.globe.dataset.camera = [camera.x, camera.y, camera.z].map((value) => value.toFixed(3)).join(",");
    el.globe.dataset.autoRotate = String(controls.autoRotate);
    el.globe.dataset.enableRotate = String(controls.enableRotate);
    el.globe.dataset.enableZoom = String(controls.enableZoom);
  }

  globe.controls().addEventListener("change", syncGlobeInteractionState);
  syncGlobeInteractionState();

  // Globe.gl defaults to the window size; fit it to its own box now and on every resize.
  function fitGlobe() {
    globe.width(el.globe.clientWidth);
    globe.height(el.globe.clientHeight);
  }
  fitGlobe();
  window.addEventListener("resize", fitGlobe);

  // Records come from outside museum sites, so every value is escaped before it reaches innerHTML.
  function escapeHtml(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
    return String(value ?? "").replace(/[&<>"']/g, (ch) => entities[ch]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function museumName(id, withOriginal = false) {
    const museum = museums.get(id);
    if (!museum) return id;
    if (i18n.lang === "en") return museum.nameEn || museum.name;
    return withOriginal ? `${museum.name}(${museum.nameHanja})` : museum.name;
  }

  function centuryBounds(century) {
    return {
      start: (century - 1) * 100 + 1,
      end: century * 100
    };
  }

  function overlapsCentury(artifact, century) {
    const bounds = centuryBounds(century);
    return artifact.yearStart <= bounds.end && artifact.yearEnd >= bounds.start;
  }

  function matchesFilters(artifact, includeCentury) {
    if (includeCentury && !overlapsCentury(artifact, state.century)) return false;
    if (!state.cultures.has(artifact.cultureRegion)) return false;
    if (state.category !== "all" && artifact.category !== state.category) return false;
    if (state.ware !== "all" && artifact.ware !== state.ware) return false;

    const term = state.search.trim().toLowerCase();
    if (!term) return true;

    return [
      artifact.name,
      artifact.nameHanja,
      artifact.material,
      artifact.dateLabel,
      artifact.dynasty,
      artifact.dynastyHanja,
      artifact.origin.place,
      museums.get(artifact.holdingMuseumId)?.name,
      museums.get(artifact.holdingMuseumId)?.nameHanja,
      museums.get(artifact.holdingMuseumId)?.nameEn,
      tr.dateLabel(artifact.dateLabel),
      tr.place(artifact.origin.place)
    ].some((value) => String(value || "").toLowerCase().includes(term));
  }

  function filteredArtifacts() {
    return artifacts.filter((artifact) => matchesFilters(artifact, true));
  }

  function mappableArtifacts(items) {
    return items.filter((artifact) => {
      return artifact.origin.certainty !== "unknown" && Number.isFinite(artifact.origin.lat) && Number.isFinite(artifact.origin.lng);
    });
  }

  function buildPointCoordinates() {
    const groups = new Map();
    mappableArtifacts(artifacts).forEach((artifact) => {
      const key = [
        artifact.cultureRegion,
        artifact.origin.lat.toFixed(3),
        artifact.origin.lng.toFixed(3)
      ].join(":");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(artifact);
    });

    const coordinates = new Map();
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    groups.forEach((group) => {
      const origin = group[0].origin;
      if (group.length === 1) {
        coordinates.set(group[0].id, { lat: origin.lat, lng: origin.lng });
        return;
      }

      const maxRadius = group.length > 500 ? 3.8 : group.length > 100 ? 2.4 : 1.2;
      const step = maxRadius / Math.sqrt(group.length);
      const lngScale = Math.max(0.35, Math.cos(origin.lat * Math.PI / 180));

      group.forEach((artifact, index) => {
        const radius = Math.sqrt(index) * step;
        const angle = index * goldenAngle;
        coordinates.set(artifact.id, {
          lat: origin.lat + Math.sin(angle) * radius,
          lng: origin.lng + (Math.cos(angle) * radius) / lngScale
        });
      });
    });

    return coordinates;
  }

  function displayOrigin(artifact) {
    return pointCoordinates.get(artifact.id) || artifact.origin;
  }

  function dataCenturies() {
    const centuries = new Set();
    artifacts.filter((artifact) => matchesFilters(artifact, false)).forEach((artifact) => {
      for (let century = 5; century <= 19; century += 1) {
        if (overlapsCentury(artifact, century)) centuries.add(century);
      }
    });
    return Array.from(centuries).sort((a, b) => a - b);
  }

  function render() {
    const items = filteredArtifacts();
    const mappable = mappableArtifacts(items);

    globe.pointsData(mappable);
    el.emptyState.hidden = mappable.length > 0;
    el.centuryLabel.textContent = `${state.century}C`;
    el.periodHud.textContent = periodLabel(state.century);
    el.resultCount.textContent = t("count", { n: items.length });
    renderTicks();
    renderLists(items);

    if (state.selectedId && !items.some((artifact) => artifact.id === state.selectedId)) {
      state.selectedId = null;
      renderDetail(null);
      renderGlobePopover(null);
    } else {
      const selectedArtifact = items.find((artifact) => artifact.id === state.selectedId) || null;
      renderDetail(selectedArtifact);
      renderGlobePopover(selectedArtifact);
    }
  }

  function periodLabel(century) {
    const period = window.PERIODS[century] || { cn: "-", kr: "-", cnEn: "-", krEn: "-" };
    const en = i18n.lang === "en";
    return t("period", { c: century, ord: i18n.ordinal(century), cn: en ? period.cnEn : period.cn, kr: en ? period.krEn : period.kr });
  }

  function renderTicks() {
    const centuries = dataCenturies();
    el.tickRow.innerHTML = "";
    centuries.forEach((century) => {
      const tick = document.createElement("span");
      tick.className = "tick";
      tick.style.left = `${((century - 5) / 14) * 100}%`;
      tick.title = `${century}C`;
      el.tickRow.appendChild(tick);
    });
  }

  function renderLists(items) {
    renderList(el.krList, items.filter((artifact) => artifact.cultureRegion === "KR" && artifact.origin.certainty !== "unknown"));
    renderList(el.cnList, items.filter((artifact) => artifact.cultureRegion === "CN" && artifact.origin.certainty !== "unknown"));
    renderList(el.unknownList, items.filter((artifact) => artifact.origin.certainty === "unknown"));
  }

  function renderList(container, items) {
    container.innerHTML = "";
    items.forEach((artifact) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `artifact-button ${artifact.id === state.selectedId ? "active" : ""}`;
      const kind = t(artifact.ware || artifact.category);
      button.innerHTML = `<strong>${escapeHtml(artifact.name)}</strong><small>${escapeHtml(tr.dateLabel(artifact.dateLabel))} · ${escapeHtml(kind)} · ${escapeHtml(museumName(artifact.holdingMuseumId))}</small>`;
      button.addEventListener("click", () => selectArtifact(artifact.id));
      container.appendChild(button);
    });
  }

  function selectArtifact(id) {
    state.selectedId = id;
    const artifact = artifacts.find((item) => item.id === id);
    if (artifact && artifact.origin.certainty !== "unknown") {
      const display = displayOrigin(artifact);
      globe.pointOfView({ lat: display.lat, lng: display.lng, altitude: 1.15 }, 700);
    }
    render();
  }

  function renderDetail(artifact) {
    if (!artifact) {
      el.detailCard.innerHTML = `<div class="detail-placeholder">${escapeHtml(t("detailPlaceholder"))}</div>`;
      return;
    }

    const certaintyLabel = t(`certainty.${artifact.origin.certainty}`);
    // Descriptions were written in Korean by the collectors; English mode relies on the translated fields instead.
    const description = i18n.lang === "ko" ? artifact.description : "";

    const e = escapeHtml;
    el.detailCard.innerHTML = `
      <img class="detail-image" src="${e(safeUrl(artifact.image))}" alt="${e(artifact.name)}">
      <div class="detail-body">
        <h2>${e(artifact.name)}</h2>
        <div class="hanja">${e(artifact.nameHanja)}</div>
        ${description ? `<p>${e(description)}</p>` : ""}
        <dl class="meta-grid">
          <dt>${e(t("date"))}</dt><dd>${e(tr.dateLabel(artifact.dateLabel))}</dd>
          <dt>${e(t("dateBasis"))}</dt><dd>${e(t(`basis.${artifact.dateBasis}`))}</dd>
          <dt>${e(t("dynasty"))}</dt><dd>${e(tr.dynasty(artifact.dynasty))}${i18n.lang === "en" ? " " : ""}(${e(artifact.dynastyHanja)})</dd>
          ${artifact.ware ? `<dt>${e(t("ware"))}</dt><dd>${e(t(artifact.ware))}</dd>` : ""}
          <dt>${e(t("material"))}</dt><dd>${e(tr.material(artifact.material))}</dd>
          <dt>${e(t("place"))}</dt><dd>${e(tr.place(artifact.origin.place))} · ${e(certaintyLabel)}</dd>
          <dt>${e(t("museum"))}</dt><dd>${e(museumName(artifact.holdingMuseumId, true))}</dd>
          <dt>${e(t("licence"))}</dt><dd>${e(tr.licence(artifact.imageLicense))}</dd>
          <dt>${e(t("credit"))}</dt><dd>${e(tr.credit(artifact.imageCredit))}</dd>
        </dl>
        <a href="${e(safeUrl(artifact.source))}" target="_blank" rel="noreferrer">${e(t("source"))}</a>
      </div>
    `;
  }

  function renderGlobePopover(artifact) {
    if (!artifact) {
      el.globePopover.hidden = true;
      el.globePopover.innerHTML = "";
      return;
    }

    const certaintyLabel = t(`certaintyShort.${artifact.origin.certainty}`);

    el.globePopover.hidden = false;
    el.globePopover.innerHTML = `
      <img class="popover-image" src="${escapeHtml(safeUrl(artifact.image))}" alt="${escapeHtml(artifact.name)}">
      <div class="popover-body">
        <div class="popover-header">
          <div>
            <h2>${escapeHtml(artifact.name)}</h2>
            <div class="hanja">${escapeHtml(artifact.nameHanja)}</div>
          </div>
          <button class="popover-close" id="closePopover" type="button" aria-label="${escapeHtml(t("closeDetails"))}">×</button>
        </div>
        <div class="popover-meta">
          <span><b>${escapeHtml(t("date"))}</b>${escapeHtml(tr.dateLabel(artifact.dateLabel))}</span>
          <span><b>${escapeHtml(t("material"))}</b>${escapeHtml(tr.material(artifact.material))}</span>
          <span><b>${escapeHtml(t("place"))}</b>${escapeHtml(tr.place(artifact.origin.place))} · ${escapeHtml(certaintyLabel)}</span>
          <span><b>${escapeHtml(t("museum"))}</b>${escapeHtml(museumName(artifact.holdingMuseumId))}</span>
        </div>
        <a class="popover-link" href="${escapeHtml(safeUrl(artifact.source))}" target="_blank" rel="noreferrer">${escapeHtml(t("source"))}</a>
      </div>
    `;

    document.getElementById("closePopover").addEventListener("click", () => {
      state.selectedId = null;
      render();
    });
  }

  function moveToDataCentury(direction) {
    const centuries = allDataCenturies();
    if (!centuries.length) return;
    const next = direction > 0
      ? centuries.find((century) => century > state.century) || centuries[0]
      : [...centuries].reverse().find((century) => century < state.century) || centuries[centuries.length - 1];
    state.century = next;
    el.centuryRange.value = String(next);
    render();
  }

  function allDataCenturies() {
    const centuries = new Set();
    artifacts.forEach((artifact) => {
      for (let century = 5; century <= 19; century += 1) {
        if (overlapsCentury(artifact, century)) centuries.add(century);
      }
    });
    return Array.from(centuries).sort((a, b) => a - b);
  }

  el.centuryRange.addEventListener("input", (event) => {
    state.century = Number(event.target.value);
    render();
  });

  el.prevCentury.addEventListener("click", () => moveToDataCentury(-1));
  el.nextCentury.addEventListener("click", () => moveToDataCentury(1));

  el.rotateToggle.addEventListener("change", (event) => {
    globe.controls().autoRotate = event.target.checked;
    syncGlobeInteractionState();
  });

  el.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  el.categoryFilter.addEventListener("change", (event) => {
    state.category = event.target.value;
    render();
  });

  el.wareFilter.addEventListener("change", (event) => {
    state.ware = event.target.value;
    render();
  });

  el.cultureButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const culture = button.dataset.culture;
      if (state.cultures.has(culture) && state.cultures.size > 1) {
        state.cultures.delete(culture);
        button.classList.remove("active");
      } else {
        state.cultures.add(culture);
        button.classList.add("active");
      }
      render();
    });
  });

  // Labels, lists and the open detail are drawn from the current language, so redraw on a switch.
  i18n.onChange(() => {
    globe.pointLabel(globe.pointLabel());
    render();
  });

  render();
})();
