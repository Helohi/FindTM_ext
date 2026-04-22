(function () {
  const ATTR = 'data-link-check';
  const ORIG_TITLE = 'data-orig-title';

  function getRealUrl(href) {
    try {
      const url = new URL(href, window.location.href);
      if (url.hostname.startsWith('www.google.') && url.pathname === '/url') {
        const q = url.searchParams.get('q');
        if (q) return q;
      }
      if (!url.protocol.startsWith('http')) return null;
      return url.toString();
    } catch {
      return null;
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

  function check(link) {
    if (link.hasAttribute(ATTR)) return;

    const target = getRealUrl(link.href);
    if (!target) {
      link.setAttribute(ATTR, 'skip');
      return;
    }

    link.setAttribute(ATTR, 'pending');
    paint(link, 'pending');
    updateTitle(link, 'Pending', 0, undefined);

    chrome.runtime.sendMessage({ action: 'checkUrl', url: target }, (res) => {
      if (chrome.runtime.lastError || !res) {
        link.setAttribute(ATTR, 'unknown');
        paint(link, 'unknown');
        updateTitle(link, 'Unknown', 0, undefined);
        return;
      }

      if (res.accessible) {
        link.setAttribute(ATTR, 'ok');
        paint(link, 'ok');
        updateTitle(link, 'Accessible', res.status, res.timing);
      } else {
        link.setAttribute(ATTR, 'fail');
        paint(link, 'fail');
        updateTitle(link, 'Inaccessible', res.status, res.timing);
      }
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