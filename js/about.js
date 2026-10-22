// Loaded before the globe bundle so About stays readable even if WebGL or app.js fails.
(function () {
  const dialog = document.getElementById("aboutDialog");
  const openLink = document.getElementById("aboutLink");
  const closeButton = document.getElementById("closeAbout");
  if (!dialog || typeof dialog.showModal !== "function") return;

  function open() {
    if (!dialog.open) dialog.showModal();
  }

  function clearHash() {
    if (location.hash === "#about") {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  openLink.addEventListener("click", (event) => {
    event.preventDefault();
    history.replaceState(null, "", "#about");
    open();
  });

  closeButton.addEventListener("click", () => dialog.close());

  // Clicks on the backdrop land on the dialog element itself.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    clearHash();
    openLink.focus();
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#about") open();
  });

  // Direct links such as https://<site>/#about open the dialog on load.
  if (location.hash === "#about") open();
})();
