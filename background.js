const queue = [];
let activeCount = 0;
const MAX_CONCURRENT = 5;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== 'checkUrl') return false;
  queue.push({ url: request.url, sendResponse });
  processQueue();
  return true;
});

function processQueue() {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    activeCount++;
    const { url, sendResponse } = queue.shift();
    checkUrl(url).then(result => {
      try { sendResponse(result); } catch (e) {}
      activeCount--;
      processQueue();
    });
  }
}

async function checkUrl(url) {
  const start = performance.now();

  const makeResult = (accessible, status = 0, error = '') => ({
    accessible,
    status,
    timing: Math.round(performance.now() - start),
    error
  });

  const doFetch = async (method, signal) => {
    const res = await fetch(url, { method, signal, redirect: 'follow' });
    return makeResult(true, res.status, '');
  };

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);

  try {
    return await doFetch('HEAD', ctrl.signal);
  } catch (headErr) {
    clearTimeout(t);
    if (headErr.name === 'AbortError') {
      return makeResult(false, 0, 'Timeout');
    }

    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => ctrl2.abort(), 10000);
    try {
      return await doFetch('GET', ctrl2.signal);
    } catch (getErr) {
      clearTimeout(t2);
      if (getErr.name === 'AbortError') {
        return makeResult(false, 0, 'Timeout');
      }
      return makeResult(false, 0, getErr.message || 'Network Error');
    }
  } finally {
    clearTimeout(t);
  }
}