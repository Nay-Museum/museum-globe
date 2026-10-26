// Loaded before the globe bundle so the intro and About stay readable even if WebGL or app.js fails.
(function () {
  const dialog = document.getElementById("aboutDialog");
  if (!dialog || typeof dialog.showModal !== "function") return;

  const title = document.getElementById("aboutTitle");
  const tabs = {
    intro: { hash: "#intro", tab: document.getElementById("tabIntro"), panel: document.getElementById("panelIntro"), link: document.getElementById("introLink"), title: "동시대 유물 지구본 소개" },
    about: { hash: "#about", tab: document.getElementById("tabAbout"), panel: document.getElementById("panelAbout"), link: document.getElementById("aboutLink"), title: "About Museum Globe" }
  };
  let current = "about";

  function select(name, { focusTab = false } = {}) {
    current = name;
    for (const [key, item] of Object.entries(tabs)) {
      const active = key === name;
      item.tab.setAttribute("aria-selected", String(active));
      item.tab.tabIndex = active ? 0 : -1;
      item.panel.hidden = !active;
    }
    title.textContent = tabs[name].title;
    title.lang = name === "about" ? "en" : "ko";
    if (dialog.open) history.replaceState(null, "", tabs[name].hash);
    if (focusTab) tabs[name].tab.focus();
  }

  function open(name) {
    select(name);
    if (!dialog.open) dialog.showModal();
    history.replaceState(null, "", tabs[name].hash);
  }

  function tabFromHash() {
    return Object.keys(tabs).find((key) => tabs[key].hash === location.hash) || null;
  }

  for (const [name, item] of Object.entries(tabs)) {
    item.link.addEventListener("click", (event) => {
      event.preventDefault();
      open(name);
    });
    item.tab.addEventListener("click", () => select(name));
  }

  // Arrow keys move between the two tabs, as in a standard tab list.
  dialog.querySelector(".about-tabs").addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    select(current === "about" ? "intro" : "about", { focusTab: true });
  });

  document.getElementById("aboutFromIntro").addEventListener("click", (event) => {
    event.preventDefault();
    select("about", { focusTab: true });
  });

  document.getElementById("closeAbout").addEventListener("click", () => dialog.close());

  // Clicks on the backdrop land on the dialog element itself.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (tabFromHash()) history.replaceState(null, "", location.pathname + location.search);
    tabs[current].link.focus();
  });

  window.addEventListener("hashchange", () => {
    const name = tabFromHash();
    if (name) open(name);
  });

  // Direct links such as https://<site>/#about (the CV link) or #intro open the matching tab on load.
  const initial = tabFromHash();
  if (initial) open(initial);
})();
