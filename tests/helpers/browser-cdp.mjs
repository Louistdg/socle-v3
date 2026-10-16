const commandTimeoutMs = 30_000;
const navigationTimeoutMs = 30_000;
const sessionProbes = new WeakMap();

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isTransientContextError(error) {
  return /execution context (?:was )?destroyed|cannot find (?:default )?(?:execution )?context|no execution context|execution context is not available/i.test(errorMessage(error));
}

export async function withTimeout(promise, label, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(`${label}: timeout after ${ms} ms`)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function waitFor(probe, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTransientError;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    try {
      const result = await withTimeout(Promise.resolve().then(() => probe(remaining)), label, remaining);
      if (result) return result;
    } catch (error) {
      if (!isTransientContextError(error)) throw error;
      lastTransientError = errorMessage(error);
    }
    const delay = Math.min(100, Math.max(0, deadline - Date.now()));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw Error(`${label}: timeout after ${timeoutMs} ms${lastTransientError ? `; last context error: ${lastTransientError}` : ''}`);
}

export async function waitForApp(session, expectedUserId, timeoutMs = 30_000) {
  const expected = expectedUserId == null ? '' : String(expectedUserId);
  const expression = `(() => {
    const access = globalThis.socleCurrentAccess;
    const nav = document.querySelector('#nav');
    const main = document.querySelector('#main');
    return Boolean(document.readyState === 'complete' &&
      typeof storageReady !== 'undefined' && storageReady && access?.userId &&
      (!${JSON.stringify(expected)} || String(access.userId) === ${JSON.stringify(expected)}) &&
      nav && !nav.hasAttribute('inert') && nav.querySelector('button') &&
      main && !main.querySelector('.load-error'));
  })()`;
  const evaluate = sessionProbes.get(session) || session.evaluate;
  console.log(`[browser-cdp] app-ready${expected ? ` user=${expected}` : ''}: start`);
  try {
    await waitFor(remaining => evaluate(expression, 'app-ready:probe', Math.min(remaining, 5_000)), 'app-ready', timeoutMs);
    console.log('[browser-cdp] app-ready: PASS');
  } catch (error) {
    console.error(`[browser-cdp] app-ready: FAIL: ${errorMessage(error)}`);
    throw error;
  }
}

export async function connectBrowser(base) {
  const connectionBase = String(base).replace(/\/$/, '');
  const cdpBase = (process.env.SOCLE_CDP_URL || 'http://127.0.0.1:9222').replace(/\/$/, '');
  const version = await withTimeout((async () => {
    const response = await fetch(`${cdpBase}/json/version`, {signal: AbortSignal.timeout(commandTimeoutMs)});
    if (!response.ok) throw Error(`CDP discovery: HTTP ${response.status}`);
    return response.json();
  })(), 'CDP discovery', commandTimeoutMs);
  if (!version.webSocketDebuggerUrl) throw Error('CDP discovery: browser WebSocket URL missing');

  const socket = new WebSocket(version.webSocketDebuggerUrl);
  const pending = new Map();
  const eventWaiters = new Set();
  const contexts = new Map();
  const diagnostics = new Map();
  let sequence = 0;
  let closed = false;
  let closing = false;
  let closePromise;

  function rejectPending(error) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
    for (const waiter of [...eventWaiters]) waiter.finish(error);
  }

  function diagnostic(sessionId, text) {
    const key = sessionId || 'browser';
    const entries = diagnostics.get(key) || [];
    entries.push(text.slice(0, 600));
    if (entries.length > 12) entries.shift();
    diagnostics.set(key, entries);
    console.warn(`[browser-cdp ${key}] ${text.slice(0, 600)}`);
  }

  socket.addEventListener('message', event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch (error) {
      rejectPending(Error(`CDP invalid response: ${errorMessage(error)}`));
      return;
    }
    if (message.id) {
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(Error(`${item.method}: ${message.error.message}`));
      else item.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      const params = message.params || {};
      const text = (params.args || []).map(arg => arg.value ?? arg.unserializableValue ?? arg.description ?? arg.type).join(' ');
      diagnostic(message.sessionId, `console.${params.type}: ${text}`);
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params?.exceptionDetails;
      diagnostic(message.sessionId, `exception: ${details?.exception?.description || details?.text || 'unknown'}`);
    } else if (message.method === 'Page.javascriptDialogOpening') {
      diagnostic(message.sessionId, `dialog ${message.params?.type}: ${String(message.params?.message || '').slice(0, 200)}`);
    }
    for (const waiter of [...eventWaiters]) {
      if (waiter.method === message.method && waiter.sessionId === message.sessionId) waiter.finish(null, message.params);
    }
  });
  socket.addEventListener('close', event => {
    closed = true;
    rejectPending(Error(`CDP socket closed (${event.code}${event.reason ? `: ${event.reason}` : ''})`));
  });
  socket.addEventListener('error', () => rejectPending(Error('CDP socket error')));

  const opened = new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };
    const onOpen = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(Error('CDP socket could not open')); };
    const onClose = () => { cleanup(); reject(Error('CDP socket closed before opening')); };
    socket.addEventListener('open', onOpen, {once: true});
    socket.addEventListener('error', onError, {once: true});
    socket.addEventListener('close', onClose, {once: true});
  });
  try {
    await withTimeout(opened, 'CDP socket open', commandTimeoutMs);
  } catch (error) {
    socket.close();
    throw error;
  }

  function command(method, params = {}, sessionId) {
    if (closed || socket.readyState !== WebSocket.OPEN) return Promise.reject(Error(`${method}: CDP socket is not open`));
    const timeoutMs = method === 'Runtime.evaluate' && Number(params.timeout) > 0 ? Number(params.timeout) : commandTimeoutMs;
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`${method}: timeout after ${timeoutMs} ms${sessionId ? ` (session ${sessionId})` : ''}`));
      }, timeoutMs);
      pending.set(id, {resolve, reject, timer, method});
      try {
        socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  async function evaluateInternal(expression, label, sessionId, timeoutMs = 70_000, quiet = false) {
    const start = Date.now();
    if (!quiet) console.log(`[browser-cdp] ${label}: start`);
    try {
      const result = await command('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs}, sessionId);
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      if (!quiet) console.log(`[browser-cdp] ${label}: PASS (${Date.now() - start} ms)`);
      return result.result.value;
    } catch (error) {
      if (!quiet) {
        const entries = diagnostics.get(sessionId || 'browser') || [];
        console.error(`[browser-cdp] ${label}: FAIL (${Date.now() - start} ms): ${errorMessage(error)}`);
        if (entries.length) console.error(`[browser-cdp] ${label}: recent diagnostics\n${entries.join('\n')}`);
      }
      throw Error(`${label}: ${errorMessage(error)}`, {cause: error});
    }
  }

  function nextEvent(method, sessionId, label, timeoutMs) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => waiter.finish(Error(`${label}: timeout after ${timeoutMs} ms`)), timeoutMs);
      waiter = {method, sessionId, finish(error, value) {
        clearTimeout(timer);
        eventWaiters.delete(waiter);
        error ? reject(error) : resolve(value);
      }};
      eventWaiters.add(waiter);
    });
    // A navigation command may fail before its event promise is awaited.
    promise.catch(() => {});
    return {promise, cancel() {waiter.finish(null);}};
  }

  async function disposeContext(browserContextId) {
    if (!contexts.has(browserContextId)) return;
    try {
      await command('Target.disposeBrowserContext', {browserContextId});
      contexts.delete(browserContextId);
    } catch (error) {
      if (closed) contexts.delete(browserContextId);
      throw error;
    }
  }

  async function createSession(sessionBase = connectionBase) {
    if (closing) throw Error('Cannot create a session while closing the browser connection');
    let browserContextId;
    try {
      ({browserContextId} = await command('Target.createBrowserContext'));
      contexts.set(browserContextId, null);
      const {targetId} = await command('Target.createTarget', {url: 'about:blank', browserContextId});
      const {sessionId} = await command('Target.attachToTarget', {targetId, flatten: true});
      contexts.set(browserContextId, sessionId);
      const call = (method, params = {}) => command(method, params, sessionId);
      await call('Runtime.enable');
      await call('Page.enable');
      await call('Page.bringToFront');
      let currentUrl = 'about:blank';
      const probe = (expression, label, timeoutMs) => evaluateInternal(expression, label, sessionId, timeoutMs, true);

      async function navigation(method, params, url) {
        const label = method === 'Page.reload' ? 'reload' : `navigate ${url}`;
        const deadline = Date.now() + navigationTimeoutMs;
        const loaded = nextEvent('Page.loadEventFired', sessionId, `${label}:load-event`, navigationTimeoutMs);
        console.log(`[browser-cdp] ${label}: start`);
        try {
          await Promise.all([call(method, params).then(result => {
            if (result.errorText) throw Error(result.errorText);
          }), loaded.promise]);
          await waitFor(remaining => probe(`document.readyState === 'complete' && location.href === ${JSON.stringify(url)}`, `${label}:document`, Math.min(remaining, 5_000)), `${label}:document`, Math.max(1, deadline - Date.now()));
          currentUrl = url;
          await call('Page.bringToFront');
          console.log(`[browser-cdp] ${label}: PASS`);
        } catch (error) {
          console.error(`[browser-cdp] ${label}: FAIL: ${errorMessage(error)}`);
          const entries = diagnostics.get(sessionId) || [];
          if (entries.length) console.error(`[browser-cdp] ${label}: recent diagnostics\n${entries.join('\n')}`);
          throw Error(`${label}: ${errorMessage(error)}`, {cause: error});
        } finally {
          loaded.cancel();
        }
      }

      const session = {
        call,
        evaluate: (expression, label, timeoutMs = 70_000) => evaluateInternal(expression, label, sessionId, timeoutMs),
        navigate: url => navigation('Page.navigate', {url: new URL(url, sessionBase).href}, new URL(url, sessionBase).href),
        reload: () => navigation('Page.reload', {ignoreCache: true}, currentUrl),
        close: () => disposeContext(browserContextId)
      };
      sessionProbes.set(session, probe);
      return session;
    } catch (error) {
      if (browserContextId) {
        try { await disposeContext(browserContextId); }
        catch (cleanupError) { diagnostic(null, `session cleanup: ${errorMessage(cleanupError)}`); }
      }
      throw error;
    }
  }

  function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      const results = await Promise.allSettled([...contexts.keys()].map(disposeContext));
      for (const result of results) if (result.status === 'rejected') diagnostic(null, `browser cleanup: ${errorMessage(result.reason)}`);
      closed = true;
      rejectPending(Error('CDP connection closed by harness'));
      if (socket.readyState === WebSocket.CLOSED) return;
      const socketClosed = new Promise(resolve => socket.addEventListener('close', resolve, {once: true}));
      socket.close();
      try { await withTimeout(socketClosed, 'CDP socket close', 5_000); }
      catch (error) { diagnostic(null, errorMessage(error)); }
    })();
    return closePromise;
  }

  return {
    command,
    evaluate: (expression, label, sessionId, timeoutMs = 70_000) => evaluateInternal(expression, label, sessionId, timeoutMs),
    createSession,
    close
  };
}
