(function () {
  const state = {
    century: 12,
    cultures: new Set(["KR", "CN"]),
    category: "all",
    search: "",
    selectedId: null
  };

  const artifacts = window.ARTIFACTS || [];
  const museums = new Map((window.MUSEUMS || []).map((museum) => [museum.id, museum]));
  const categoryLabels = {
    metalcraft: "금속공예",
    ceramic: "도자",
    painting: "회화"
  };
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
    .pointLabel((d) => `${d.name}<br>${d.dateLabel}`)
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

  window.addEventListener("resize", () => {
    globe.width(el.globe.clientWidth);
    globe.height(el.globe.clientHeight);
  });

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

    const term = state.search.trim().toLowerCase();
    if (!term) return true;

    return [
      artifact.name,
      artifact.nameHanja,
      artifact.material,
      artifact.dateLabel,
      artifact.dynasty,
      artifact.dynastyHanja,
      artifact.origin.place
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
        artifact.holdingMuseumId,
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
    el.resultCount.textContent = `${items.length}점`;
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
    const period = window.PERIODS[century] || { cn: "-", kr: "-" };
    return `${century}세기 — 中 ${period.cn} ↔ 韓 ${period.kr}`;
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
      button.innerHTML = `<strong>${artifact.name}</strong><small>${artifact.dateLabel} · ${categoryLabels[artifact.category] || artifact.category}</small>`;
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
      el.detailCard.innerHTML = `<div class="detail-placeholder">지구본의 마커 또는 비교 리스트의 유물을 선택하세요.</div>`;
      return;
    }

    const museum = museums.get(artifact.holdingMuseumId);
    const certaintyLabel = {
      known: "확정 위치",
      "capital-fallback": "추정 위치",
      unknown: "위치 불명"
    }[artifact.origin.certainty];

    el.detailCard.innerHTML = `
      <img class="detail-image" src="${artifact.image}" alt="${artifact.name}">
      <div class="detail-body">
        <h2>${artifact.name}</h2>
        <div class="hanja">${artifact.nameHanja}</div>
        <p>${artifact.description}</p>
        <dl class="meta-grid">
          <dt>연대</dt><dd>${artifact.dateLabel}</dd>
          <dt>왕조</dt><dd>${artifact.dynasty}(${artifact.dynastyHanja})</dd>
          <dt>재질</dt><dd>${artifact.material}</dd>
          <dt>위치</dt><dd>${artifact.origin.place} · ${certaintyLabel}</dd>
          <dt>소장처</dt><dd>${museum ? `${museum.name}(${museum.nameHanja})` : artifact.holdingMuseumId}</dd>
          <dt>라이선스</dt><dd>${artifact.imageLicense}</dd>
          <dt>크레딧</dt><dd>${artifact.imageCredit}</dd>
        </dl>
        <a href="${artifact.source}" target="_blank" rel="noreferrer">출처 열기</a>
      </div>
    `;
  }

  function renderGlobePopover(artifact) {
    if (!artifact) {
      el.globePopover.hidden = true;
      el.globePopover.innerHTML = "";
      return;
    }

    const museum = museums.get(artifact.holdingMuseumId);
    const certaintyLabel = {
      known: "확정",
      "capital-fallback": "추정",
      unknown: "불명"
    }[artifact.origin.certainty];

    el.globePopover.hidden = false;
    el.globePopover.innerHTML = `
      <img class="popover-image" src="${artifact.image}" alt="${artifact.name}">
      <div class="popover-body">
        <div class="popover-header">
          <div>
            <h2>${artifact.name}</h2>
            <div class="hanja">${artifact.nameHanja}</div>
          </div>
          <button class="popover-close" id="closePopover" type="button" aria-label="유물 정보 닫기">×</button>
        </div>
        <div class="popover-meta">
          <span><b>연대</b>${artifact.dateLabel}</span>
          <span><b>재질</b>${artifact.material}</span>
          <span><b>위치</b>${artifact.origin.place} · ${certaintyLabel}</span>
          <span><b>소장처</b>${museum ? museum.name : artifact.holdingMuseumId}</span>
        </div>
        <a class="popover-link" href="${artifact.source}" target="_blank" rel="noreferrer">출처 열기</a>
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

  render();
})();
