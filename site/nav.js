// Deather Vector: show one section at a time, picked from the side toolbar.
// Without JavaScript every section still shows and the toolbar links scroll to them.
(function () {
  "use strict";
  const main = document.querySelector("main");
  if (!main) return;
  const views = Array.from(main.children).filter((el) => el.tagName === "SECTION" && el.id);
  if (!views.length) return;
  const links = Array.from(document.querySelectorAll('.side-nav a[href^="#"]'));
  document.documentElement.classList.add("views-on");

  function show() {
    const id = decodeURIComponent((location.hash || "#home").slice(1));
    const target = id ? document.getElementById(id) : null;
    let view = target ? views.find((v) => v === target || v.contains(target)) : null;
    if (!view) view = views[0];
    views.forEach((v) => v.classList.toggle("view-off", v !== view));
    links.forEach((a) => {
      if (a.getAttribute("href") === "#" + view.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (target && target !== view) target.scrollIntoView();
    else window.scrollTo(0, 0);
    // Charts measure their width when drawn; redraw now that this view is visible.
    window.dispatchEvent(new Event("resize"));
  }

  window.addEventListener("hashchange", show);
  show();
})();
