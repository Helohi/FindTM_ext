(function () {
  const ATTR = 'data-link-check';
  const ORIG_TITLE = 'data-orig-title';

  // Per-page, non-persistent cache. Dies with the tab.
  const domainCache = new Map();      // hostname -> result
  const inFlightDomains = new Map();  // hostname -> Array<link elements>

  function isGoogleDomain(hostname) {
    return /^(([^.]+\.)?)google\.[a-z]{2,}(\.[a-z]{2,})?$/i.test(hostname);
  }

  function getTarget(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.hostname.startsWith('www.google.') && url.pathname === '/url') {
        const q = url.searchParams.get('q');
        if (q) return q;
      }
      return href;
    } catch {
      return null;
    }
  }

  function shouldSkip(urlStr) {
    try {
      const url = new URL(urlStr, window.location.href);
      if (!url.protocol.startsWith('http')) return true;
      if (isGoogleDomain(url.hostname)) return true;
      return false;
    } catch {
      return true;
    }
  }

  function updateTitle(link, stateLabel, httpCode, timingMs) {
    if (!link.hasAttribute(ORIG_TITLE)) {
      link.setAttribute(ORIG_TITLE, link.title || '');
    }
    const orig = link.getAttribute(ORIG_TITLE);
    const codePart = httpCode ? `HTTP ${httpCode}` : 'HTTP -';
    const timePart = timingMs !== undefined ? `${timingMs}ms` : '-ms';
    const prefix = `${stateLabel} | ${codePart} | ${timePart}`;
    link.title = orig ? `${prefix} | ${orig}` : prefix;
  }

  function paint(link, state) {
    const colors = {
      ok: '#2e7d32',
      fail: '#c62828',
      pending: '#9e9e9e',
      unknown: '#f9a825'
    };
    link.style.setProperty('color', colors[state] || colors.unknown, 'important');
  }

  function applyResult(link, res) {
    if (res.accessible) {
      link.setAttribute(ATTR, 'ok');
      paint(link, 'ok');
      updateTitle(link, 'Accessible', res.status, res.timing);
    } else {
      link.setAttribute(ATTR, 'fail');
      paint(link, 'fail');
      updateTitle(link, 'Inaccessible', res.status, res.timing);
    }
  }

  function check(link) {
    if (link.hasAttribute(ATTR)) return;

    const target = getTarget(link.href);
    if (!target || shouldSkip(target)) {
      link.setAttribute(ATTR, 'skip');
      return;
    }

    let domain;
    try { domain = new URL(target).hostname; } catch { return; }

    // Cache hit
    if (domainCache.has(domain)) {
      applyResult(link, domainCache.get(domain));
      return;
    }

    // Same domain already being checked — queue this link
    if (inFlightDomains.has(domain)) {
      inFlightDomains.get(domain).push(link);
      link.setAttribute(ATTR, 'pending');
      paint(link, 'pending');
      updateTitle(link, 'Pending', 0, undefined);
      return;
    }

    // Start new check
    inFlightDomains.set(domain, []);
    link.setAttribute(ATTR, 'pending');
    paint(link, 'pending');
    updateTitle(link, 'Pending', 0, undefined);

    chrome.runtime.sendMessage({ action: 'checkUrl', url: target }, (res) => {
      // Resolve waiting links for this domain
      const waiting = inFlightDomains.get(domain) || [];
      inFlightDomains.delete(domain);

      const result = (chrome.runtime.lastError || !res)
        ? { accessible: false, status: 0, timing: 0, error: 'Extension error' }
        : res;

      // Treat extension-level failures as Unknown (yellow)
      if (chrome.runtime.lastError || !res) {
        link.setAttribute(ATTR, 'unknown');
        paint(link, 'unknown');
        updateTitle(link, 'Unknown', 0, 0);

        waiting.forEach(l => {
          l.setAttribute(ATTR, 'unknown');
          paint(l, 'unknown');
          updateTitle(l, 'Unknown', 0, 0);
        });
        return;
      }

      domainCache.set(domain, result);
      applyResult(link, result);
      waiting.forEach(l => applyResult(l, result));
    });
  }

  function scan() {
    document.querySelectorAll('a[href]').forEach(check);
  }

  scan();

  const observer = new MutationObserver(() => scan());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();