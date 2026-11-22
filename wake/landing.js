// Public Landing Page script for Examnesia (GitHub Pages).
//
// 1. Controls the responsive mobile/tablet navigation menu with full keyboard and outside-click support.
// 2. Fetches ./release/latest.json to render real Android APK release metadata (never invents download links).
// 3. Wakes the free-tier Render instance (__API_ORIGIN__/api/health) with a live progress bar when the user
//    clicks "Open Web App" (or automatically when ?wake=1 is in the URL), then redirects once healthy.

(function () {
  var API = "__API_ORIGIN__";
  var INTERVAL_MS = 3000;
  var CEILING_MS = 90000;
  var started = 0;
  var timer = null;
  var ticker = null;
  var done = false;
  var lastModalTrigger = null;

  function $(id) {
    return document.getElementById(id);
  }

  function formatBytes(bytes) {
    var n = Number(bytes);
    if (!n || n <= 0) return null;
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  // ==================== Responsive Mobile / Tablet Navigation ====================
  var menuToggle = $("menu-toggle");
  var mobileMenu = $("mobile-menu");
  var siteHeader = $("site-header");

  function setMenuOpen(open, restoreFocus) {
    if (!menuToggle || !mobileMenu) return;
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileMenu.hidden = !open;
    if (!open && restoreFocus) {
      menuToggle.focus();
    }
  }

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", function () {
      var isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen, false);
    });

    var mobileLinks = mobileMenu.querySelectorAll("[data-mobile-nav-link]");
    for (var m = 0; m < mobileLinks.length; m++) {
      mobileLinks[m].addEventListener("click", function () {
        setMenuOpen(false, false);
      });
    }

    document.addEventListener("click", function (e) {
      if (mobileMenu.hidden) return;
      if (siteHeader && !siteHeader.contains(e.target)) {
        setMenuOpen(false, false);
      }
    });

    var desktopMq = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
    if (desktopMq) {
      var onMediaChange = function (ev) {
        if (ev.matches) setMenuOpen(false, false);
      };
      if (typeof desktopMq.addEventListener === "function") {
        desktopMq.addEventListener("change", onMediaChange);
      } else if (typeof desktopMq.addListener === "function") {
        desktopMq.addListener(onMediaChange);
      }
    }
  }

  // ==================== Release Metadata (./release/latest.json) ====================
  function renderRelease(meta) {
    var badge = $("apk-status-badge");
    var verEl = $("apk-version");
    var dateEl = $("apk-date");
    var sizeEl = $("apk-size");
    var minEl = $("apk-min-android");
    var shaBox = $("apk-sha-box");
    var shaEl = $("apk-sha256");
    var notesList = $("apk-notes-list");
    var dlBtn = $("apk-download-btn");
    var heroDlBtn = $("hero-apk-btn");
    var pendingNote = $("apk-pending-note");

    if (!meta || typeof meta !== "object") return;

    if (verEl && meta.version_name) {
      verEl.textContent = "v" + meta.version_name + (meta.version_code ? " (build " + meta.version_code + ")" : "");
    }
    if (dateEl) {
      dateEl.textContent = meta.release_date || "Pending first signed release";
    }
    if (sizeEl) {
      sizeEl.textContent = formatBytes(meta.file_size_bytes) || "Listed upon release";
    }
    if (minEl) {
      minEl.textContent = meta.min_android_version || ("Android 7.0+ (API " + (meta.min_sdk || 24) + ")");
    }

    if (notesList && Array.isArray(meta.release_notes) && meta.release_notes.length > 0) {
      notesList.innerHTML = "";
      meta.release_notes.forEach(function (note) {
        var li = document.createElement("li");
        li.textContent = String(note);
        notesList.appendChild(li);
      });
    }

    var apkUrlRe = /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/]+\.apk$/;
    var isPublished =
      Boolean(meta.published) &&
      typeof meta.apk_url === "string" &&
      apkUrlRe.test(meta.apk_url);

    if (isPublished) {
      if (badge) {
        badge.textContent = "Latest Signed Release";
        badge.className = "badge badge-live";
      }
      if (dlBtn) {
        dlBtn.href = meta.apk_url;
        dlBtn.removeAttribute("aria-disabled");
        dlBtn.classList.remove("btn-disabled");
        dlBtn.textContent = "Download APK (v" + (meta.version_name || "1.0.0") + ")";
      }
      if (heroDlBtn) {
        heroDlBtn.href = meta.apk_url;
        heroDlBtn.textContent = "Download Android APK (v" + (meta.version_name || "1.0.0") + ")";
      }
      if (pendingNote) {
        pendingNote.style.display = "none";
      }
      if (shaBox && shaEl && meta.sha256) {
        shaEl.textContent = meta.sha256;
        shaBox.style.display = "block";
      }
    } else {
      if (badge) {
        badge.textContent = "Release Build Pending";
        badge.className = "badge badge-pending";
      }
      if (dlBtn) {
        dlBtn.removeAttribute("href");
        dlBtn.setAttribute("aria-disabled", "true");
        dlBtn.classList.add("btn-disabled");
        dlBtn.textContent = "Signed APK Pending Publication";
      }
      if (pendingNote) {
        pendingNote.style.display = "block";
      }
    }
  }

  function loadReleaseMetadata() {
    fetch("./release/latest.json", { cache: "no-store", credentials: "omit" })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (meta) {
        if (meta) renderRelease(meta);
      })
      .catch(function () {
        /* keep default pending state if offline or unavailable */
      });
  }

  // ==================== Render Free Instance Wake-Up Modal ====================
  function setBackgroundInert(isInert) {
    var ids = ["site-header", "main-content", "site-footer"];
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (el) el.inert = isInert;
    }
  }

  function setProgress(ms) {
    var s = Math.min(90, Math.round(ms / 1000));
    var fill = $("wake-fill");
    if (fill) {
      fill.style.width = (s / 90 * 100) + "%";
      if (fill.parentNode) fill.parentNode.setAttribute("aria-valuenow", String(s));
    }
  }

  function stopTimers() {
    done = true;
    if (timer) clearTimeout(timer);
    if (ticker) clearInterval(ticker);
  }

  function giveUp() {
    stopTimers();
    $("wake-title").textContent = "Kabi is still sleepy";
    $("wake-msg").textContent = "The server is still not answering. Please try again in a little while.";
    $("wake-status").textContent = "";
    $("wake-actions").style.display = "flex";
  }

  function ready() {
    stopTimers();
    setProgress(90000);
    $("wake-title").textContent = "Kabi is awake!";
    $("wake-status").textContent = "Opening Examnesia…";
    window.location.assign(API + "/");
  }

  function checkHealth() {
    if (done) return;
    var elapsed = Date.now() - started;
    if (elapsed >= CEILING_MS) return giveUp();
    var ctl = new AbortController();
    var abort = setTimeout(function () {
      ctl.abort();
    }, 8000);
    fetch(API + "/api/health", { cache: "no-store", credentials: "omit", signal: ctl.signal })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (body && body.status === "healthy") ready();
        else scheduleNext();
      })
      .catch(scheduleNext)
      .then(function () {
        clearTimeout(abort);
      });
  }

  function scheduleNext() {
    if (!done) timer = setTimeout(checkHealth, INTERVAL_MS);
  }

  function isWakeModalOpen() {
    var modal = $("wake-modal");
    return Boolean(modal && modal.getAttribute("aria-hidden") === "false");
  }

  function openWakeModal(e) {
    if (e) {
      e.preventDefault();
      lastModalTrigger = e.currentTarget || document.activeElement;
    } else {
      lastModalTrigger = document.activeElement;
    }
    setMenuOpen(false, false);
    var modal = $("wake-modal");
    if (!modal) return;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    setBackgroundInert(true);
    var closeBtnEl = $("wake-close");
    if (closeBtnEl) closeBtnEl.focus();
    startWake();
  }

  function closeWakeModal() {
    stopTimers();
    var modal = $("wake-modal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    setBackgroundInert(false);
    if (lastModalTrigger && typeof lastModalTrigger.focus === "function") {
      lastModalTrigger.focus();
    }
    lastModalTrigger = null;
  }

  function startWake() {
    done = false;
    started = Date.now();
    $("wake-title").textContent = "Kabi is waking up…";
    $("wake-msg").textContent =
      "Our server runs on a free plan, so it sleeps after 15 minutes of inactivity. Waking it usually takes under a minute.";
    $("wake-actions").style.display = "none";
    setProgress(0);
    if (ticker) clearInterval(ticker);
    ticker = setInterval(function () {
      var e = Date.now() - started;
      setProgress(e);
      $("wake-status").textContent = "Waiting for server… " + Math.round(e / 1000) + " s";
    }, 1000);
    checkHealth();
  }

  // Wire buttons & keyboard shortcuts
  var triggers = document.querySelectorAll("[data-wake-trigger]");
  for (var i = 0; i < triggers.length; i++) {
    triggers[i].addEventListener("click", openWakeModal);
  }
  var retryBtn = $("wake-retry");
  if (retryBtn) retryBtn.addEventListener("click", startWake);
  var closeBtn = $("wake-close");
  if (closeBtn) closeBtn.addEventListener("click", closeWakeModal);

  var wakeModal = $("wake-modal");
  if (wakeModal) {
    wakeModal.addEventListener("click", function (e) {
      if (e.target === wakeModal) closeWakeModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (isWakeModalOpen()) {
      closeWakeModal();
    } else if (mobileMenu && !mobileMenu.hidden) {
      setMenuOpen(false, true);
    }
  });

  loadReleaseMetadata();

  // Auto-open wake modal if visitor arrived with ?wake=1
  if (window.location.search.indexOf("wake=1") !== -1) {
    openWakeModal();
  }
})();
