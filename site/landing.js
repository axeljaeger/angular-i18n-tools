// Preserve bookmarks from when Storybook was hosted at the site root.
if (new URLSearchParams(location.search).has("path")) {
  location.replace(
    new URL("angular/storybook/", location.href).pathname +
      location.search +
      location.hash,
  );
} else {
  initializeLandingPage();
}

function initializeLandingPage() {
  const root = document.getElementById("i18n-landing");
  const rail = root.querySelector(".rail");
  const cards = [...rail.querySelectorAll(".product")];
  const dots = [...root.querySelectorAll(".page-dot")];
  const status = root.querySelector("#carousel-status");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let active = -1;
  let settled = -1;
  let animationFrame = 0;
  let scrollFrame = 0;
  let settleTimer;

  function closest() {
    const center = rail.getBoundingClientRect().left + rail.clientWidth / 2;
    const distances = cards.map((card) => {
      const rect = card.getBoundingClientRect();
      return Math.abs(rect.left + rect.width / 2 - center);
    });
    return distances.indexOf(Math.min(...distances));
  }

  function updateMarker(index) {
    if (index === active) return;
    active = index;
    dots.forEach((dot, i) => {
      dot.toggleAttribute("data-active", i === index);
      if (i === index) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function settle() {
    if (animationFrame) return;
    const index = closest();
    updateMarker(index);
    if (settled !== -1 && settled !== index) {
      status.textContent = `${cards[index].querySelector("h2").textContent}, ${index + 1} of ${cards.length}`;
    }
    settled = index;
  }

  function cancelNavigation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    rail.style.removeProperty("scroll-snap-type");
  }

  function navigate(index) {
    cancelNavigation();
    clearTimeout(settleTimer);
    const rect = cards[index].getBoundingClientRect();
    const start = rail.scrollLeft;
    const target =
      start +
      rect.left +
      rect.width / 2 -
      rail.getBoundingClientRect().left -
      rail.clientWidth / 2;
    updateMarker(index);
    if (reducedMotion.matches) {
      rail.scrollTo({ left: target, behavior: "instant" });
      settle();
      return;
    }
    // Native smooth scrolling has no configurable duration. Disable snapping only
    // during this short dot-navigation animation; touch/wheel scrolling stays native.
    const started = performance.now();
    rail.style.scrollSnapType = "none";
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 200);
      const eased = 1 - (1 - progress) ** 3;
      rail.scrollTo({
        left: start + (target - start) * eased,
        behavior: "instant",
      });
      if (progress < 1) animationFrame = requestAnimationFrame(tick);
      else {
        cancelNavigation();
        settle();
      }
    };
    animationFrame = requestAnimationFrame(tick);
  }

  dots.forEach((dot, index) =>
    dot.addEventListener("click", () => navigate(index)),
  );
  const hasScrollEnd = "onscrollend" in rail;
  rail.addEventListener(
    "scroll",
    () => {
      if (!animationFrame && !scrollFrame) {
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (!animationFrame) updateMarker(closest());
        });
      }
      if (!hasScrollEnd) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 150);
      }
    },
    { passive: true },
  );
  if (hasScrollEnd) rail.addEventListener("scrollend", settle);
  for (const event of ["pointerdown", "wheel", "keydown"]) {
    rail.addEventListener(event, cancelNavigation, { passive: true });
  }
  window.addEventListener("resize", () => {
    cancelNavigation();
    requestAnimationFrame(settle);
  });
  settle();

  root.querySelectorAll(".copy-command").forEach((button) => {
    let resetTimer;
    button.addEventListener("click", async () => {
      const label = button.querySelector(".copy-label");
      clearTimeout(resetTimer);
      try {
        await navigator.clipboard.writeText(button.dataset.command);
        label.textContent = "Copied!";
      } catch {
        label.textContent = "Copy unavailable";
      }
      button.setAttribute("data-feedback", "");
      resetTimer = setTimeout(() => {
        label.textContent = "Copy command";
        button.removeAttribute("data-feedback");
      }, 2000);
    });
  });

  const trigger = root.querySelector("#extension-install-button");
  const options = root.querySelector("#extension-install-options");
  const nativePopover = "popover" in HTMLElement.prototype;
  if (!nativePopover) options.hidden = true;
  const isOpen = () =>
    nativePopover ? options.matches(":popover-open") : !options.hidden;

  function synchronizeOptions() {
    trigger.setAttribute("aria-expanded", String(isOpen()));
    if (!isOpen()) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    options.style.left = `${Math.max(12, Math.min(rect.left, viewportWidth - options.offsetWidth - 12))}px`;
    const above = rect.top - options.offsetHeight - 8;
    options.style.top = `${Math.max(12, above >= 12 ? above : Math.min(rect.bottom + 8, viewportHeight - options.offsetHeight - 12))}px`;
  }

  function closeOptions() {
    if (!isOpen()) return;
    if (nativePopover) options.hidePopover();
    else options.hidden = true;
    synchronizeOptions();
  }

  options.addEventListener("toggle", synchronizeOptions);
  // The HTML invoker owns toggling in current browsers. Older browsers get the
  // same finite menu without a library or an unconditional polyfill download.
  if (!("commandForElement" in HTMLButtonElement.prototype) || !nativePopover) {
    trigger.addEventListener("click", () => {
      if (isOpen()) closeOptions();
      else {
        if (nativePopover) options.showPopover();
        else options.hidden = false;
        synchronizeOptions();
      }
    });
  }
  if (!nativePopover) {
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        closeOptions();
        trigger.focus();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!options.contains(event.target) && !trigger.contains(event.target))
        closeOptions();
    });
  }
  rail.addEventListener("scroll", closeOptions, { passive: true });
  window.addEventListener("resize", closeOptions);
}
