// --- FOCUS TRAP UTIL ---
const FOCUSABLE_SELECTOR =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable]';

function getVisibleFocusableElements(container) {
  if (!container) return [];
  const elements = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR));
  return elements.filter(
    (el) =>
      el.offsetWidth > 0 ||
      el.offsetHeight > 0 ||
      el.getClientRects().length > 0
  );
}

/**
 * createFocusTrap(container, { onEscape })
 * Zwraca obiekt { enable(), disable() }.
 * - zapisuje poprzednio aktywny element,
 * - blokuje body scroll,
 * - ustawia aria-hidden na <main>,
 * - obsługuje Tab / Shift+Tab oraz Escape (wywołuje onEscape).
 */
function createFocusTrap(container, options = {}) {
  let lastFocused = null;
  let trapped = false;
  const onEscape =
    typeof options.onEscape === "function" ? options.onEscape : null;

  const mqlMobile = window.matchMedia("(max-width: 767px)");

  function focusFallback(el) {
    try {
      el.focus();
    } catch (e) {
      el.setAttribute("tabindex", "-1");
      el.focus();
    }
  }

  function keyHandler(e) {
    if (e.key === "Escape") {
      if (onEscape) onEscape();
      return;
    }

    if (e.key === "Tab") {
      const focusable = getVisibleFocusableElements(container);
      if (!focusable.length) {
        e.preventDefault();
        focusFallback(container);
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  return {
    enable() {
      if (!container || trapped) return;
      lastFocused = document.activeElement;

      const focusable = getVisibleFocusableElements(container);
      if (focusable.length) {
        focusFallback(focusable[0]);
      } else {
        focusFallback(container);
      }

      if (mqlMobile.matches) {
        document.body.style.overflow = "hidden";
      }

      const mainEl = document.querySelector("main");
      if (mainEl) mainEl.setAttribute("aria-hidden", "true");

      document.addEventListener("keydown", keyHandler);
      trapped = true;
    },
    disable() {
      if (!trapped) return;

      document.removeEventListener("keydown", keyHandler);

      //  cofamy blokadę tylko jeśli była nałożona
      if (mqlMobile.matches) {
        document.body.style.overflow = "";
      }

      const mainEl = document.querySelector("main");
      if (mainEl) mainEl.removeAttribute("aria-hidden");

      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
      lastFocused = null;
      trapped = false;
    },
  };
}

// --- MEDIA QUERY CACHING ---
const mqlMobile = window.matchMedia("(max-width: 767px)");

// --- MENU MODULE ---
const menuModule = (function () {
  let menuContainer, menuToggle, closeMenu, menuOverlay, menuElement;
  let focusTrapInstance = null;

  function init() {
    menuContainer = document.querySelector(".layout__wrapper");
    menuToggle = document.getElementById("menuToggle");
    closeMenu = document.getElementById("closeMenu");
    menuOverlay = document.getElementById("menuOverlay");
    menuElement = document.querySelector(".navigation-menu");

    if (!menuContainer || !menuToggle) return;

    menuToggle.addEventListener("click", toggleMenu);
    closeMenu?.addEventListener("click", toggleMenu);
    menuOverlay?.addEventListener("click", () => {
      if (menuContainer.classList.contains("menu-active")) {
        toggleMenu();
      }
    });

    // Obsługa linków w menu (przeniesiona do init żeby mieć pewność, że DOM jest gotowy)
    const menuLinks = document.querySelectorAll(
      ".navigation-menu a[href^='#']"
    );
    menuLinks.forEach((link) => {
      link.addEventListener("click", () => {
        if (menuContainer && menuContainer.classList.contains("menu-active")) {
          toggleMenu();
        }
      });
    });
  }

  function toggleMenu() {
    const isActive = menuContainer.classList.toggle("menu-active");
    menuToggle.setAttribute("aria-expanded", String(isActive));
    menuToggle.setAttribute(
      "aria-label",
      isActive ? "Close menu" : "Open menu"
    );

    if (isActive) {
      // utwórz instancję focus trap przy pierwszym otwarciu
      focusTrapInstance =
        focusTrapInstance ||
        createFocusTrap(menuElement, { onEscape: toggleMenu });
      focusTrapInstance.enable();
    } else {
      if (focusTrapInstance) {
        focusTrapInstance.disable();
      }
    }
  }

  return { init };
})();

// --- MODAL MODULE ---
const modalModule = (function () {
  let modal, modalOverlay, closeModal, productIdEl, modalImg;
  let lastFocusedElement;
  let focusTrapInstance = null;

  const altMapping = {
    1: "Pink alpine climbing jacket with hood, insulated and waterproof",
    2: "Brown and blue color-blocked alpine climbing jacket, unisex fit",
    3: "Green and pink split-color alpine climbing jacket with zipper pockets",
    4: "Gray and brown hooded alpine climbing jacket, technical outdoor gear",
    5: "Blue and orange multi-panel alpine climbing jacket, breathable fabric",
    6: "Orange and blue insulated alpine climbing jacket with adjustable hood",
  };

  function init() {
    modal = document.getElementById("productModal");
    modalOverlay = document.getElementById("modalOverlay");
    closeModal = document.getElementById("closeModal");
    productIdEl = document.querySelector(".product-modal__id");
    modalImg = document.querySelector(".product-modal__image");

    if (!modal || !modalImg) return;

    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "productModalLabel");
    if (productIdEl) {
      productIdEl.id = "productModalLabel";
    }

    closeModal?.addEventListener("click", hide);
    modalOverlay?.addEventListener("click", hide);

    document.querySelectorAll(".product-list__item").forEach((el) => {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");

      const rawId = Number(el.dataset.productId);

      // 1) Spróbuj odczytać numer obrazka z <img src=".../product-03-...">
      let imageNum = null;
      const img = el.querySelector("img");
      if (img) {
        const src = img.getAttribute("src") || "";
        // dopasuje: product-03-, product-03., product-03_
        const match = src.match(/product-(\d{2})\D/);
        if (match) imageNum = parseInt(match[1], 10);
      }

      // 2) Fallback: jeśli brak <img> lub nie dopasowano, użyj data-image-num (jeśli ktoś poda w HTML)
      if (!imageNum && el.dataset.imageNum) {
        imageNum = parseInt(el.dataset.imageNum, 10);
      }

      // 3) Ostateczny fallback: dawny modułowy wzór (żeby nic się nie „wysypało”)
      if (!imageNum) {
        imageNum = ((rawId - 1) % 6) + 1;
      }

      // zapisz dla późniejszego użycia
      el.dataset.imageNum = String(imageNum);

      const altText =
        altMapping[imageNum] || `Product ${String(rawId).padStart(2, "0")}`;
      el.setAttribute("aria-label", `Open product details: ${altText}`);

      el.addEventListener("click", () => {
        show(rawId, imageNum);
      });

      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          show(rawId, imageNum);
        }
      });
    });
  }

  function show(rawId, imageNum) {
    lastFocusedElement = document.activeElement;

    const idStr = String(imageNum).padStart(2, "0");
    const isMob = mqlMobile.matches;

    const m1 = `/assets/images/products/product-${idStr}-280x388.webp`;
    const m2 = `/assets/images/products/product-${idStr}-560x776.webp`;
    const d1 = `/assets/images/products/product-${idStr}-776x556.webp`;
    const d2 = `/assets/images/products/product-${idStr}-1024x734.webp`;

    const srcset = isMob ? `${m1} 280w, ${m2} 560w` : `${d1} 776w, ${d2} 1024w`;
    const sizes = isMob ? "280px" : "(max-width: 991px) 50vw, 776px";
    const src = isMob ? m2 : d2;
    const w = isMob ? 280 : 776;
    const h = isMob ? 388 : 556;

    modalImg.srcset = srcset;
    modalImg.sizes = sizes;
    modalImg.src = src;
    modalImg.width = w;
    modalImg.height = h;
    modalImg.alt =
      altMapping[imageNum] || `Product ${String(rawId).padStart(2, "0")}`;
    modalImg.style.display = "block";

    if (productIdEl) {
      productIdEl.textContent = `ID: ${String(rawId).padStart(2, "0")}`;
    }

    modal.style.display = "flex";
    modalOverlay.style.display = "block";

    closeModal.focus();

    focusTrapInstance = createFocusTrap(modal, { onEscape: hide });
    focusTrapInstance.enable();
  }

  function hide() {
    modal.style.display = "none";
    modalOverlay.style.display = "none";

    if (focusTrapInstance) {
      focusTrapInstance.disable();
      focusTrapInstance = null;
    }

    if (lastFocusedElement) {
      lastFocusedElement.focus();
    }
  }

  return { init };
})();

// --- SWIPER MODULE z obsługą dostępności ---
const swiperModule = (function () {
  let swiperInstance;

  function init() {
    if (typeof Swiper === "undefined") return;

    swiperInstance = new Swiper(".featured-products__swiper", {
      loop: true,
      freeMode: {
        enabled: true,
        sticky: false,
        momentumRatio: 0.25,
        momentumBounce: false,
      },
      slidesPerView: "auto",
      spaceBetween: 16,
      grabCursor: true,
      mousewheel: true,
      // Ważne: wyłączamy domyślne zarządzanie a11y przez Swiper
      a11y: {
        enabled: false,
      },
      breakpoints: {
        320: { slidesPerView: 1.2, spaceBetween: 16 },
        480: { slidesPerView: 1.5, spaceBetween: 16 },
        768: { slidesPerView: 2.2, spaceBetween: 16 },
        992: { slidesPerView: 3, spaceBetween: 16 },
        1200: { slidesPerView: 4, spaceBetween: 16 },
      },
      on: {
        init: function () {
          updateProgress(this);
          // Kluczowe: uruchamiamy zarządzanie dostępnością po inicjalizacji
          updateSlideAccessibility(this);
        },
        slideChange: function () {
          updateProgress(this);
          // Aktualizujemy dostępność przy każdej zmianie slajdu
          updateSlideAccessibility(this);
        },
      },
    });

    const btn = document.querySelector(".featured-products__swiper-next");
    btn?.addEventListener("click", () => swiperInstance.slideNext());
    btn?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        swiperInstance.slideNext();
      }
    });

    setupKeyboardNavigation();
  }

  /**
   * Ukrywa duplikaty oraz niewidoczne slajdy przed nawigacją Tab i czytnikami ekranu
   */
  function updateSlideAccessibility(swiperInstance) {
    const slides = swiperInstance.slides;

    const containerRect = swiperInstance.el.getBoundingClientRect();

    slides.forEach((slide) => {
      const focusableElements = slide.querySelectorAll(FOCUSABLE_SELECTOR);

      // Sprawdź czy to duplikat (Swiper dodaje klasę swiper-slide-duplicate)
      const isDuplicate = slide.classList.contains("swiper-slide-duplicate");

      // Sprawdź czy slajd jest widoczny w kontenerze
      const slideRect = slide.getBoundingClientRect();

      const marginError = 10;
      const isVisible =
        slideRect.right > containerRect.left + marginError &&
        slideRect.left < containerRect.right - marginError;

      if (isDuplicate || !isVisible) {
        slide.setAttribute("aria-hidden", "true");

        focusableElements.forEach((element) => {
          if (!element.hasAttribute("data-original-tabindex")) {
            const currentTabindex = element.getAttribute("tabindex");
            element.setAttribute(
              "data-original-tabindex",
              currentTabindex || "0"
            );
          }
          element.setAttribute("tabindex", "-1");
        });
      } else {
        slide.removeAttribute("aria-hidden");

        focusableElements.forEach((element) => {
          const originalTabindex = element.getAttribute(
            "data-original-tabindex"
          );
          if (originalTabindex !== null) {
            if (originalTabindex === "0" || originalTabindex === "") {
              element.removeAttribute("tabindex");
            } else {
              element.setAttribute("tabindex", originalTabindex);
            }
            element.removeAttribute("data-original-tabindex");
          }
        });
      }
    });
  }

  function setupKeyboardNavigation() {
    const swiperElement = document.querySelector(".featured-products__swiper");
    if (!swiperElement) return;

    swiperElement.setAttribute("tabindex", "0");
    swiperElement.setAttribute("role", "region");
    swiperElement.setAttribute("aria-label", "Featured products slider");

    (function () {
      const swiperElement = document.querySelector(
        ".featured-products__swiper"
      );
      if (!swiperElement) return;

      let lastInteractionWasKeyboard = false;

      // Wykrywanie ostatniej metody interakcji
      document.addEventListener("keydown", (e) => {
        if (e.key === "Tab") {
          lastInteractionWasKeyboard = true;
        }
      });

      document.addEventListener("mousedown", () => {
        lastInteractionWasKeyboard = false;
      });

      swiperElement.addEventListener("focus", () => {
        // Pokazuj tylko po Tab i tylko raz na sesję
        if (!lastInteractionWasKeyboard) return;
        if (sessionStorage.getItem("swiperNavigationHintShown")) return;

        const hintElement = document.createElement("div");
        hintElement.setAttribute("role", "status");
        hintElement.setAttribute("aria-live", "polite");
        hintElement.className = "featured-products__swiper-hint";
        hintElement.textContent =
          "Use the left/right arrows to navigate between slides, Home to go to the first slide, End to go to the last slide.";

        swiperElement.appendChild(hintElement);
        sessionStorage.setItem("swiperNavigationHintShown", "true");

        setTimeout(() => {
          hintElement.style.opacity = "0";
        }, 6000);

        setTimeout(() => {
          hintElement.remove();
        }, 11000);
      });
    })();

    swiperElement.addEventListener("keydown", (e) => {
      if (document.activeElement === swiperElement) {
        switch (e.key) {
          case "ArrowLeft":
            e.preventDefault();
            swiperInstance.slidePrev();
            break;
          case "ArrowRight":
            e.preventDefault();
            swiperInstance.slideNext();
            break;
          case "Home":
            e.preventDefault();
            swiperInstance.slideTo(0);
            break;
          case "End":
            e.preventDefault();
            // Przejdź do ostatniego prawdziwego slajdu (nie duplikatu)
            const realSlides = swiperElement.querySelectorAll(
              ".swiper-slide:not(.swiper-slide-duplicate)"
            );
            swiperInstance.slideTo(realSlides.length - 1);
            break;
        }
      }
    });
  }

  function updateProgress(sw) {
    const bar = document.querySelector(".featured-products__progress");
    if (!bar) return;

    // Liczymy tylko prawdziwe slajdy (bez duplikatów)
    const total = sw.el.querySelectorAll(
      ".swiper-slide:not(.swiper-slide-duplicate)"
    ).length;
    const idx = sw.realIndex;
    bar.style.width = `${((idx + 1) / total) * 100}%`;
  }

  return { init };
})();

// ----- WISHLIST MODULE -----
const wishlistModule = (function () {
  function init() {
    document
      .querySelectorAll(".featured-products__wishlist-button")
      .forEach((btn) => {
        btn.addEventListener("click", (e) => {
          // Zapobiegamy propagacji eventi, żeby klik na przycisk nie aktywował innych elementów
          e.stopPropagation();
          toggle(btn);
        });

        const icon = btn.querySelector("img.featured-products__wishlist-icon");
        if (icon && icon.src.includes("icon-favorite.svg")) {
          btn.setAttribute("aria-label", "Add to wishlist");
        }
      });
  }

  function toggle(btn) {
    const icon = btn.querySelector("img.featured-products__wishlist-icon");
    const src = icon.getAttribute("src");

    if (src.includes("icon-favorite.svg")) {
      icon.src = "/assets/images/icons/icon-favorite-black.svg";
      icon.alt = "";
      btn.setAttribute("aria-label", "Remove from wishlist");
    } else {
      icon.src = "/assets/images/icons/icon-favorite.svg";
      icon.alt = "";
      btn.setAttribute("aria-label", "Add to wishlist");
    }
  }

  return { init };
})();

// ----- DROPDOWN MODULE -----
const dropdownModule = (function () {
  const sizes = [14, 28, 36];
  let currentSize = 14;
  let toggleBtn, optionsEl, currentSpan, selector;

  function init() {
    toggleBtn = document.getElementById("sizeToggle");
    optionsEl = document.getElementById("sizeOptions");
    currentSpan = document.getElementById("currentSize");
    selector = document.getElementById("sizeSelector");

    if (!toggleBtn || !optionsEl || !currentSpan) return;

    selector.setAttribute("role", "combobox");
    selector.setAttribute("aria-expanded", "false");
    optionsEl.setAttribute("role", "listbox");
    optionsEl.setAttribute("aria-labelledby", "sizeToggle"); // Powiązanie z etykietą przycisku
    toggleBtn.setAttribute("aria-controls", "sizeOptions");

    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
      expanded ? closeList() : openList();
    });

    toggleBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
        expanded ? closeList() : openList();
      }
    });

    document.addEventListener("click", (e) => {
      if (selector && !selector.contains(e.target)) {
        closeList();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        toggleBtn.getAttribute("aria-expanded") === "true"
      ) {
        closeList();
        toggleBtn.focus(); // Zwróć fokus na przycisk po zamknięciu
      }
    });

    // Obsługa blur - zamknięcie listy po utracie fokusu (dla WCAG)
    selector.addEventListener("focusout", (e) => {
      if (!selector.contains(e.relatedTarget)) {
        closeList();
      }
    });

    closeList();
  }

  function clearOptions() {
    optionsEl.innerHTML = "";
  }

  function renderOptions() {
    clearOptions();
    sizes
      .filter((s) => s !== currentSize)
      .sort((a, b) => a - b)
      .forEach((s, index) => {
        const li = document.createElement("li");
        li.className = "product-list__option";
        li.role = "option";
        li.dataset.size = s;
        li.textContent = s;
        li.tabIndex = 0; // Uczynienie opcji fokusowalnymi
        li.setAttribute("aria-selected", "false");

        li.addEventListener("click", () => {
          selectOption(s);
        });

        li.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectOption(s);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusNextOption(index);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusPrevOption(index);
          }
        });

        optionsEl.append(li);
      });
  }

  function selectOption(size) {
    currentSize = size;
    currentSpan.textContent = size;
    // Aktualizacja ARIA dla wybranego elementu (choć w tym przypadku lista jest odtwarzana)
    closeList();
    toggleBtn.focus(); // Zwróć fokus na przycisk po wyborze
  }

  function focusNextOption(currentIndex) {
    const options = optionsEl.querySelectorAll("li");
    const nextIndex = (currentIndex + 1) % options.length;
    options[nextIndex].focus();
  }

  function focusPrevOption(currentIndex) {
    const options = optionsEl.querySelectorAll("li");
    const prevIndex = (currentIndex - 1 + options.length) % options.length;
    options[prevIndex].focus();
  }

  function openList() {
    renderOptions();
    optionsEl.style.display = "flex";
    toggleBtn.setAttribute("aria-expanded", "true");
    selector.classList.add("is-open");
    selector.setAttribute("aria-expanded", "true");

    const firstOption = optionsEl.querySelector("li");
    if (firstOption) {
      firstOption.focus();
    }
  }

  function closeList() {
    optionsEl.style.display = "none";
    toggleBtn.setAttribute("aria-expanded", "false");
    selector.classList.remove("is-open");
    selector.setAttribute("aria-expanded", "false");
  }

  return { init };
})();

// --- PROMO MODULE ---
const promoModule = (function () {
  const PROMO_KEY = "promoBannerShown";
  let promoBanner, promoButton;

  function init() {
    promoBanner = document.getElementById("promoBanner");
    promoButton = document.querySelector(".promo__button");

    if (promoBanner) {
      if (localStorage.getItem(PROMO_KEY) === "true") {
        promoBanner.style.display = "none";
      } else {
        localStorage.setItem(PROMO_KEY, "true");
      }
    }

    promoButton?.addEventListener("click", () => {
      alert("Checking out the promotion!");
    });
  }

  return { init };
})();

// ----- META MODULE -----
const metaModule = (function () {
  const pageMeta = {
    "": {
      title: "Home - Forma'sint",
      desc: "Welcome to Forma'sint - expert climbing gear.",
    },
    "#featuredProducts": {
      title: "Featured - Forma'sint",
      desc: "Browse our featured climbing jackets, helmets and accessories.",
    },
    "#productListing": {
      title: "Products - Forma'sint",
      desc: "Explore our full product range: apparel, equipment and more.",
    },
  };

  function init() {
    updateMeta(window.location.hash);
    window.addEventListener("hashchange", () =>
      updateMeta(window.location.hash)
    );
  }

  function updateMeta(hash) {
    const data = pageMeta[hash] || pageMeta[""];
    document.title = data.title;
    document.querySelector('meta[name="description"]').content = data.desc;

    // Unifikacja aria-hidden
    const sections = document.querySelectorAll("main > section");
    sections.forEach((section) => {
      if ("#" + section.id === hash || (!hash && section.id === "")) {
        section.removeAttribute("aria-hidden");
      } else {
        section.setAttribute("aria-hidden", "true");
      }
    });
  }

  return { init };
})();

// --- ROZRUCH WSZYSTKICH MODUŁÓW ---
document.addEventListener("DOMContentLoaded", function () {
  menuModule.init();
  modalModule.init();
  swiperModule.init();
  wishlistModule.init();
  dropdownModule.init();
  promoModule.init();
  metaModule.init();

  // ZMIANA KOLORU LOGO
  const brandLinks = document.querySelectorAll(".header__brand");
  brandLinks.forEach((link) => {
    const icon = link.querySelector(".header__brand-icon");
    if (!icon) return;
    link.addEventListener("mouseenter", () => {
      icon.src = "/assets/images/icons/forma-icon-black.svg";
    });
    link.addEventListener("mouseleave", () => {
      icon.src = "/assets/images/icons/forma-icon.svg";
    });
  });
});
