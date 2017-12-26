/** global: browser */

if ( typeof browser !== 'undefined' && typeof document.body !== 'undefined' ) {
  var tab = null;

  var html = document.documentElement.outerHTML;

  if ( html.length > 50000 ) {
    html = html.substring(0, 25000) + html.substring(html.length - 25000, html.length);
  }

  var scripts = Array.prototype.slice
      .apply(document.scripts)
      .filter(s => s.src)
      .map(s => s.src);

  try {
    browser.runtime.sendMessage({
      id: 'analyze',
      subject: { html },
      source: 'content.js'
    });

    browser.runtime.sendMessage({
      id: 'analyze',
      subject: { scripts },
      source: 'content.js'
    });

    var container = document.createElement('wappalyzerData');

    container.setAttribute('id',    'wappalyzerData');
    container.setAttribute('style', 'display: none');

    var script = document.createElement('script');

    script.setAttribute('id', 'wappalyzerEnvDetection');
    script.setAttribute('src', browser.extension.getURL('js/inject.js'));
/*
    container.addEventListener('wappalyzerEvent', (event => {
      var env = event.target.childNodes[0].nodeValue;

      document.documentElement.removeChild(container);
      document.documentElement.removeChild(script);

      env = env.split(' ').slice(0, 500);

      browser.runtime.sendMessage({
        id: 'analyze',
        subject: { env },
        source: 'content.js'
      });
    }), true);
*/
/*    browser.runtime.sendMessage({
      id: 'get_apps',
      url: location.href,
      source: 'content.js'
    })
      .then(handleDetectedApps);
*/
    function loadLib (src, onload) {
      const script = document.createElement('script')
      script.src = src
      script.onload = onload
      document.documentElement.appendChild(script)
    }

    showBar()

    document.documentElement.appendChild(container);
    document.documentElement.appendChild(script);
  } catch(e) {
    log(e);
  }
}
/*
async function scanSite(url) {
  const response = await fetch(url)
  const html = await response.text()
  alert(html.substr(html.indexOf('html')))
}
*/
const filterByCategoryId = (detected, categoryId) => Object.entries(detected)
  .filter(([
    _,
    { props: {
        cats
      }
    }]) => cats.includes(categoryId))
  .map(([name, value]) => ({ name, ...value }))

function handleDetectedApps({ apps, categories, tabCache: { detected } }) {
  const eCommerceCategoryId = Object.entries(categories)
    .find(([id, { name }]) => name === 'Ecommerce')
    [0]
  const eCommerceDetected = filterByCategoryId(detected, eCommerceCategoryId)

  detectProductName()
  detectPrice()
/*  if (eCommerceDetected.length) {
    showBar(eCommerceDetected
      .map(({ name }) => name ))
  }*/
}

const productInfoByFramework = {
  Magento: {
    name: '*[itemProp="name"]',
    price: [ '*[itemProp="price"]', '.price-box' ],
  }
}

const productInfoByUrl = {
  "shekem-electric.co.il": {
    name: 'h1[role="document"]',
    price: '.price b',
  }
}

const getCleanHost = host => host
  .replace(/^www\./, '')

const getDomain = url => getCleanHost(new URL(url).host)

const getProductInfo = ({ url, framework }) =>
  productInfoByUrl[getDomain(url)]
  || productInfoByFramework[framework]

function renderField ({ field, value }) {
  return `<div>
    <span>${field}</span>
    <b>${value}</b>
  </div>`
}

function isElementVisible(el) {
//-- Cross browser method to get style properties:
  function _getStyle(el, property) {
    if ( window.getComputedStyle ) {
      return document.defaultView.getComputedStyle(el,null)[property];
    }
    if ( el.currentStyle ) {
      return el.currentStyle[property];
    }
  }

  var p = el.parentNode;

  if (9 === p.nodeType) {
    return true; // document type
  }

  //-- Return false if our element is invisible
  if (
    '0' === _getStyle(el, 'opacity') ||
    'none' === _getStyle(el, 'display').replace(/\s!important/i, '') ||
    'hidden' === _getStyle(el, 'visibility')
  ) {
    return false;
  }

  //-- Let's recursively check upwards:
  if (p) {
    return isElementVisible(p);
  }

  return true;
}

function isLeafNode(node) {
  return Array.prototype.every.call(node.childNodes, ({ offsetParent }) => !offsetParent)
}

function hasLineThrough(node) {
  if (!node) {
    return false
  }

  return (getComputedStyle(node).textDecorationLine === 'line-through')
    || hasLineThrough(node.parentElement)
}

function createVisibleElementInnerTextIterator(regExp, root = document.body, onlyLeaves = true) {
  return document.createNodeIterator(
    root,
    NodeFilter.SHOW_ELEMENT,
    el =>
      (!onlyLeaves || isLeafNode(el))
      && el.offsetParent
      && el.innerText
      && regExp.test(el.innerText.trim())
      && !hasLineThrough(el)
      && isElementVisible(el)
  )
}

function createVisibleTextIterator(regExp, root, maxLength) {
  const filterTagName = /^script$|^style$/i
  return document.createNodeIterator(
    root,
    NodeFilter.SHOW_TEXT,
    el =>
      el.parentElement.offsetParent
      && (getComputedStyle(el.parentElement).display !== 'none')
      && el.textContent
      && (el.textContent.trim().length <= maxLength)
      && regExp.test(el.textContent.trim())
      && isElementVisible(el.parentElement)
  )
}

function getOffset(node) {
  if (!node) {
    return { left: 0, top: 0 }
  }
  const parentOffset = getOffset(node.offsetParent)

  return {
    left: node.offsetLeft + parentOffset.left,
    top: node.offsetTop + parentOffset.top,
  }
}

function detectBuyButton() {
  function findClickable (node) {
    if (!node) {
      return null
    }

    if ((/^a$|^button$/i.test(node.tagName))
      || node.onclick
      || /^submit$/i.test(node.type)) {
      return node
    }

    return findClickable(node.parentElement)
  }
  const buyOrCartRegExp = /to\sbasket|to\scart|^buy$|^buy\s|^purchase|קנה|קניה|רכוש|\s+לסל$/i
  const iterator = createVisibleTextIterator(buyOrCartRegExp, document.body, 20)
  const results = []
  let node

  while (node = iterator.nextNode()) {
    const button = findClickable(node.parentElement)
    if (button) {
      results.push({
        node,
        button,
        offset: getOffset(button),
      })
    }
  }

  const buyRegExp = /buy$|^buy\s|^purchase|קנה|קניה|רכוש/i

  results
    .sort((a, b) =>
      ((buyRegExp.test(b.button.innerText.trim()) ? 1 : 0)
      - (buyRegExp.test(a.button.innerText.trim()) ? 1 : 0))
      + (a.offset.top - b.offset.top))

  if (results.length) {
    results[0].button.style.border = '2px solid red'
  }

  return results[0]
}

function toPixels (size) {
  return /em$/.test(size)
    ? parseFloat(size.replace(/em$/, '')) * 16
    : parseFloat(size.replace(/px$/, ''))
}

function detectProductName(parent, maxTop) {
  const cleanText = text => text
    .trim()
    .toLowerCase()
    .replace(/[()®]/g, '')
    .replace(/\s+-+\s+|,\s/g, ' ')

  const breakIntoWords = text => text
    .split(/\s+/)

  const getScore = (a, b) => {
    let score = 0

    for (let i = 0; i < a.length; i++) {
      const start = b.indexOf(a[i])

      if (start >= 0) {
        let j
        for (j = start; (i < a.length) && (j < b.length) && (b[j] === a[i]); i++, j++) {}

        let subScore = j - start

        if (i === 0) {
          subScore *= 2
        }
        if (start === 0) {
          subScore *= 2
        }

        score += subScore
      }
    }

    return score
  }

  const cleanTitle = cleanText(document.title)
  const titleWords = breakIntoWords(cleanTitle)
  const escapeRegExp = str => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")

  const titleRegExp = new RegExp(
    titleWords
      .map(escapeRegExp)
      .join('|')
  )

  const searchCache = new Map()
  let bestScore = -1
  let foundNode = null

  do {
    const iterator = document.createNodeIterator(
      parent,
      NodeFilter.SHOW_TEXT,
      el => !searchCache.has(el)
        && el.textContent
        && (el.textContent.trim().length < document.title.length * 2)
        && titleRegExp.test(el.textContent.trim())
        && el.parentElement.offsetParent
        && (getOffset(el.parentElement).top <= maxTop)
        && isElementVisible(el.parentElement)
    )
    let node

    while (node = iterator.nextNode()) {
      const nodeText = cleanText(node.textContent)
      const nodeWords = breakIntoWords(nodeText)
      const { fontSize } = getComputedStyle(node.parentElement)

      const score = getScore(titleWords, nodeWords) * toPixels(fontSize)

      searchCache.set(node, score)
      if (score > bestScore) {
        foundNode = node
        bestScore = score
      } else if (foundNode
        && (score === bestScore)
        && (toPixels(getComputedStyle(foundNode.parentElement).fontSize)
          < toPixels(getComputedStyle(node.parentElement).fontSize))) {
        foundNode = node
      }
    }
  } while ((parent = parent.parentElement) && (bestScore < titleWords.length))

  if (foundNode) {
    foundNode.parentElement.style.backgroundColor = 'yellow'
    return foundNode.textContent.trim()
  }

  return null
}

function detectProductName2() {
  const breakIntoWords = str => str.split(/[\s|_|\/|\.]+/)
    .map(word => word.toLowerCase())
  const makeDictionary = words => words
    .reduce((result, word) => ({ ...result, [word]: 1 }), {})
  const escapeRegExp = str => str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")

  const titleWords = breakIntoWords(document.title)
  const titleRegExp = new RegExp(
    titleWords
      .map(escapeRegExp)
      .join('|')
  )

  const iterator = createVisibleElementInnerTextIterator(titleRegExp, document.body)

  const results = []
  let element
  while (element = iterator.nextNode()) {
    const words = breakIntoWords(element.innerText)
    const dictionary = makeDictionary(words)
    const titleWordCount = titleWords
      .filter(word => !!dictionary[word])
      .length
    const style = getComputedStyle(element)

    results.push({
      fontSize: toPixels(style.fontSize),
      wordCount: words.length,
      titleWordCount,
      offset: getOffset(element),
      element,
    })
  }

  results
    .sort((a, b) =>
      400 * (b.titleWordCount - a.titleWordCount)
      + 200 * (Math.abs(a.wordCount - titleWords.length) - Math.abs(b.wordCount - titleWords.length))
      + 100 * (b.fontSize - a.fontSize)
      + (a.offset.top - b.offset.top))

  if (results.length) {
    results[0].element.style.backgroundColor = 'yellow'
  }
}

function detectPrice(buyButton) {
  const priceAndCurrencyRegExp = /[\s\S]{0,50}((USD|EUR|€|\$|£|GBP|₪|ILS)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(USD|EUR|€|\$|£|GBP|₪|ILS))[\s\S]{0,50}/i
  let parent = buyButton

  while (parent) {
    if (priceAndCurrencyRegExp.test(parent.innerText.trim())) {
      break
    }
    parent = parent.parentElement
  }

  let priceElement
  if (parent) {
    function getDepth(node) {
      let result

      for (result = 0; (node !== parent) && node; result++) {
        node = node.parentElement
      }

      return result
    }

    const priceAndCurrencyOnlyRegExp = /^([\s\S]{0,50}((USD|EUR|€|\$|£|GBP|₪|ILS)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(USD|EUR|€|\$|£|GBP|₪|ILS))[\s\S]{0,50})$/i
    const results = []
    const iterator = createVisibleElementInnerTextIterator(priceAndCurrencyOnlyRegExp, parent, false)
    let element

    while (element = iterator.nextNode()) {
      const { fontSize } = getComputedStyle(element)

      results.push({
        element,
        depth: getDepth(element),
        offset: getOffset(element),
        fontSize: toPixels(fontSize),
      })
    }

    results
      .sort((a, b) =>
        (b.depth - a.depth)
        + 0.1 * (a.offset.top - b.offset.top)
        + (b.fontSize - a.fontSize)
      )

    if (results.length) {
      priceElement = results[0].element
      priceElement.style.backgroundColor = 'lime'
    }
  }

  return {
    priceElement,
    parent,
  }
}

function detectPrice2() {
  function distanceFromRegExp({ offsetLeft, offsetTop }, node, regExp) {
    if (!node) {
      return 10000
    }

    const maxLength = 100
    const { innerText } = node

    if (innerText.length > maxLength) {
      return 10000
    }

    if (regExp.test(innerText)) {
      return Math.sqrt(offsetLeft * offsetLeft + offsetTop * offsetTop)
    }

    return distanceFromRegExp({
      offsetLeft: offsetLeft + node.offsetLeft,
      offsetTop: offsetTop + node.offsetTop,
    }, node.parentElement, regExp)
  }

  function getDepth(node) {
    let result = 0

    for (; node; result++) {
      node = node.parentElement
    }

    return result
  }

  const zeroOffset = { offsetLeft: 0, offsetTop: 0 }
  function iterateWith(regExp, buyRegExp, bidRegExp) {
    function iterate(regExp, onlyLeaves) {
      const iterator = createVisibleElementInnerTextIterator(regExp, document.body, onlyLeaves)
      const results = []
      let element

      while (element = iterator.nextNode()) {
        const style = getComputedStyle(element)
        const distanceFromBuy = distanceFromRegExp(zeroOffset, element, buyRegExp)
        const distanceFromBid = distanceFromBuy >= 10000
          ? distanceFromRegExp(zeroOffset, element, bidRegExp)
          : 10000

        results.push({
          fontSize: parseInt(style.fontSize),
          offset: getOffset(element),
          distanceFromBuy,
          distanceFromBid,
//          depth: getDepth(element),
          element,
          parent: element.parentElement,
        })
      }

      return results
    }

    return iterate(regExp, false)
  }

  const priceAndCurrencyRegExp = /^([\s\S]{0,50}((USD|EUR|€|\$|£|GBP|₪|ILS)\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)|(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(USD|EUR|€|\$|£|GBP|₪|ILS))[\s\S]{0,50})$/i
  const priceRegExp = /^(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)$/
  const buyRegExp = /buy|purchase|קנה|קניה/i
  const bidRegExp = /bid|הצעה/i
  let results = iterateWith(priceAndCurrencyRegExp, buyRegExp, bidRegExp)
  const parents = results
    .map(({ parent }) => parent)

  results = results
    .filter(({ element }) => !parents.includes(element))

  results
    .sort((a, b) =>
      10 * (a.distanceFromBuy - b.distanceFromBuy)
      + 2 * (a.offset.top - b.offset.top)
      + (b.distanceFromBid - a.distanceFromBid)
      + 2000 * (b.fontSize - a.fontSize)
    )

  console.log(results)
  results[0].element.style.backgroundColor = 'lime'
//  results.forEach(({ element }) => element.style.backgroundColor = 'lime')
}

function arrayBufferDataUri(raw) {
  var base64 = '';
  var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var bytes = new Uint8Array(raw);
  var byteLength = bytes.byteLength;
  var byteRemainder = byteLength % 3;
  var mainLength = byteLength - byteRemainder;
  var a, b, c, d;
  var chunk;

  // Main loop deals with bytes in chunks of 3
  for (var i = 0; i < mainLength; i = i + 3) {
    // Combine the three bytes into a single integer
    chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    // Use bitmasks to extract 6-bit segments from the triplet
    a = (chunk & 16515072) >> 18; // 16515072 = (2^6 - 1) << 18
    b = (chunk & 258048) >> 12; // 258048 = (2^6 - 1) << 12
    c = (chunk & 4032) >> 6; // 4032 = (2^6 - 1) << 6
    d = chunk & 63; // 63 = 2^6 - 1
    // Convert the raw binary segments to the appropriate ASCII encoding
    base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d];
  }

  // Deal with the remaining bytes and padding
  if (byteRemainder == 1) {
    chunk = bytes[mainLength];
    a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2;
    // Set the 4 least significant bits to zero
    b = (chunk & 3) << 4 // 3 = 2^2 - 1;
    base64 += encodings[a] + encodings[b] + '==';
  }
  else if (byteRemainder == 2) {
    chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1];
    a = (chunk & 16128) >> 8 // 16128 = (2^6 - 1) << 8;
    b = (chunk & 1008) >> 4 // 1008 = (2^6 - 1) << 4;
    // Set the 2 least significant bits to zero
    c = (chunk & 15) << 2 // 15 = 2^4 - 1;
    base64 += encodings[a] + encodings[b] + encodings[c] + '=';
  }

  return base64
}

function addZero(a) {
  return (a < 0 || a > 9 ? "" : "0") + a
}

function toISODate(date) {
  with (date) {
    return getFullYear()
      + '-'+addZero(getMonth()+1)+'-'+addZero(getDate())
      +'T'+addZero(getHours())+':'+addZero(getMinutes())+':'+addZero(getSeconds())+'.000Z'
  }
}

function getNowTimeStamp() {
  var b = new Date();
  var a = new Date(b.getTime() + (b.getTimezoneOffset() * 60000));
  return toISODate(a)
}

async function signAsync(secretKey, data) {
  const enc = new TextEncoder('utf-8')

  const key = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    {
      name: 'HMAC',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  )
  const signature = await window.crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(data)
  )

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

async function showBar() {
  const queryParams = params => Object
    .entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .sort()
    .join('&')

  const secretKey = 'UgWpEOjWiD+kmVSB6t1ur/4vnXFdpAe7VmGhOAFq'
  const signParams = async (endpoint, uri, params) => {
    const stringToSign = `GET\n${endpoint}\n${uri}\n${params}`
    const base64 = sign(secretKey, stringToSign)
    const base64_2 = await signAsync(secretKey, stringToSign)

    return `${params}&Signature=${encodeURIComponent(base64_2)}`
  }

  const fields = []

  const buyButton = detectBuyButton()
  const { priceElement, parent } = detectPrice(buyButton.node.parentElement)
  const productName = detectProductName(parent, getOffset(priceElement).top)

  if (productName) {
    fields.push({field: 'name', value: productName})

    const endpoint = 'webservices.amazon.com'
    const uri = '/onca/xml'

    const params = queryParams({
      AWSAccessKeyId: 'AKIAJUI45MRHWJVMOZKA',
      AssociateTag: 'saveey2018-20',
      Keywords: productName.replace(/[(),]/g, ''),
      Operation: 'ItemSearch',
      ResponseGroup: 'ItemAttributes,Offers',
      SearchIndex: 'All',
      Service: 'AWSECommerceService',
      Timestamp: getNowTimeStamp(),
    })
    const signedQuery = await signParams(endpoint, uri, params)
    const response = await fetch(`https://${endpoint}${uri}?${signedQuery}`, { mode: 'cors' })
    const text = await response.text()
    alert(text)

    if (priceElement) {
      fields.push({field: 'price', value: priceElement.innerText.trim()})
    }

    if (fields.length) {
      const bar = document.createElement('div')
      Object.assign(bar.style, {
        position: 'fixed',
        left: '20px',
        top: '5px',
        border: '1px solid rgba(0,0,0,.5)',
        borderRadius: '5px',
        padding: '5px 20px',
        zIndex: '1000000',
        color: 'black',
        backgroundColor: 'white',
        boxShadow: '0px 0px 5px',
        direction: 'ltr',
        textAlign: 'left',
      })

      bar.innerHTML = fields
        .map(renderField)
        .join('\n')

      document.body.appendChild(bar)
    }
  }
}

function showBar0(frameworks) {
  const forceArray = value => Array.isArray(value) ? value : [value]
  const extractTextFromSelector = selector => {
    const elementWithText = forceArray(selector)
      .reduce((result, sel) => [
        ...result,
        ...document.querySelectorAll(sel)
      ], [])
      .find(element => element.innerText)

    return elementWithText && elementWithText.innerText
  }

  const productInfo = getProductInfo({
    url: location.href,
    framework: frameworks[0],
  })

  const fields = productInfo && Object.entries(productInfo)
    .map(([ field, selector ]) => ({
      field,
      value: extractTextFromSelector(selector),
    }))
    .filter(({ value }) => !!value)

  if (fields.length) {
    const bar = document.createElement('div')
    Object.assign(bar.style, {
      position: 'fixed',
      left: '20px',
      top: '5px',
      border: '1px solid rgba(0,0,0,.5)',
      borderRadius: '5px',
      padding: '5px 20px',
      zIndex: '1000000',
      color: 'black',
      backgroundColor: 'white',
      boxShadow: '0px 0px 5px',
      direction: 'ltr',
      textAlign: 'left',
    })

    bar.innerHTML = fields
      .map(renderField)
      .join('\n')


    document.body.appendChild(bar)
  }
}

function log(message) {
  browser.runtime.sendMessage({
    id: 'log',
    message,
    source: 'content.js'
  });
}

/* A JavaScript implementation of the Secure Hash Standard
 * Version 0.3 Copyright Angel Marin 2003-2004 - http://anmar.eu.org/
 * Distributed under the BSD License
 * Some bits taken from Paul Johnston's SHA-1 implementation
 */
/* bits per input character. 8 - ASCII; 16 - Unicode      */
const hexcase = 0
/* hex output format. 0 - lowercase; 1 - uppercase        */
/* base-64 pad character. "=" for strict RFC compliance   */

function safe_add (x, y) {
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

function S (X, n) {return ( X >>> n ) | (X << (32 - n));}

function R (X, n) {return ( X >>> n );}

function Ch(x, y, z) {return ((x & y) ^ ((~x) & z));}

function Maj(x, y, z) {return ((x & y) ^ (x & z) ^ (y & z));}

function Sigma0256(x) {return (S(x, 2) ^ S(x, 13) ^ S(x, 22));}

function Sigma1256(x) {return (S(x, 6) ^ S(x, 11) ^ S(x, 25));}

function Gamma0256(x) {return (S(x, 7) ^ S(x, 18) ^ R(x, 3));}

function Gamma1256(x) {return (S(x, 17) ^ S(x, 19) ^ R(x, 10));}

function Sigma0512(x) {return (S(x, 28) ^ S(x, 34) ^ S(x, 39));}

function Sigma1512(x) {return (S(x, 14) ^ S(x, 18) ^ S(x, 41));}

function Gamma0512(x) {return (S(x, 1) ^ S(x, 8) ^ R(x, 7));}

function Gamma1512(x) {return (S(x, 19) ^ S(x, 61) ^ R(x, 6));}

function core_sha256 (m, l) {
  var K = new Array(0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2);
  var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
  var W = new Array(64);
  var a, b, c, d, e, f, g, h, i, j;
  var T1, T2;

  /* append padding */
  m[l >> 5] |= 0x80 << (24 - l % 32);
  m[((l + 64 >> 9) << 4) + 15] = l;

  for ( var i = 0; i<m.length; i+=16 ) {
    a = HASH[0];
    b = HASH[1];
    c = HASH[2];
    d = HASH[3];
    e = HASH[4];
    f = HASH[5];
    g = HASH[6];
    h = HASH[7];

    for ( var j = 0; j<64; j++) {
      if (j < 16) W[j] = m[j + i];
      else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);

      T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
      T2 = safe_add(Sigma0256(a), Maj(a, b, c));

      h = g;
      g = f;
      f = e;
      e = safe_add(d, T1);
      d = c;
      c = b;
      b = a;
      a = safe_add(T1, T2);
    }

    HASH[0] = safe_add(a, HASH[0]);
    HASH[1] = safe_add(b, HASH[1]);
    HASH[2] = safe_add(c, HASH[2]);
    HASH[3] = safe_add(d, HASH[3]);
    HASH[4] = safe_add(e, HASH[4]);
    HASH[5] = safe_add(f, HASH[5]);
    HASH[6] = safe_add(g, HASH[6]);
    HASH[7] = safe_add(h, HASH[7]);
  }
  return HASH;
}

function core_sha512 (m, l) {
  var K = new Array(0x428a2f98d728ae22, 0x7137449123ef65cd, 0xb5c0fbcfec4d3b2f, 0xe9b5dba58189dbbc, 0x3956c25bf348b538, 0x59f111f1b605d019, 0x923f82a4af194f9b, 0xab1c5ed5da6d8118, 0xd807aa98a3030242, 0x12835b0145706fbe, 0x243185be4ee4b28c, 0x550c7dc3d5ffb4e2, 0x72be5d74f27b896f, 0x80deb1fe3b1696b1, 0x9bdc06a725c71235, 0xc19bf174cf692694, 0xe49b69c19ef14ad2, 0xefbe4786384f25e3, 0x0fc19dc68b8cd5b5, 0x240ca1cc77ac9c65, 0x2de92c6f592b0275, 0x4a7484aa6ea6e483, 0x5cb0a9dcbd41fbd4, 0x76f988da831153b5, 0x983e5152ee66dfab, 0xa831c66d2db43210, 0xb00327c898fb213f, 0xbf597fc7beef0ee4, 0xc6e00bf33da88fc2, 0xd5a79147930aa725, 0x06ca6351e003826f, 0x142929670a0e6e70, 0x27b70a8546d22ffc, 0x2e1b21385c26c926, 0x4d2c6dfc5ac42aed, 0x53380d139d95b3df, 0x650a73548baf63de, 0x766a0abb3c77b2a8, 0x81c2c92e47edaee6, 0x92722c851482353b, 0xa2bfe8a14cf10364, 0xa81a664bbc423001, 0xc24b8b70d0f89791, 0xc76c51a30654be30, 0xd192e819d6ef5218, 0xd69906245565a910, 0xf40e35855771202a, 0x106aa07032bbd1b8, 0x19a4c116b8d2d0c8, 0x1e376c085141ab53, 0x2748774cdf8eeb99, 0x34b0bcb5e19b48a8, 0x391c0cb3c5c95a63, 0x4ed8aa4ae3418acb, 0x5b9cca4f7763e373, 0x682e6ff3d6b2b8a3, 0x748f82ee5defb2fc, 0x78a5636f43172f60, 0x84c87814a1f0ab72, 0x8cc702081a6439ec, 0x90befffa23631e28, 0xa4506cebde82bde9, 0xbef9a3f7b2c67915, 0xc67178f2e372532b, 0xca273eceea26619c, 0xd186b8c721c0c207, 0xeada7dd6cde0eb1e, 0xf57d4f7fee6ed178, 0x06f067aa72176fba, 0x0a637dc5a2c898a6, 0x113f9804bef90dae, 0x1b710b35131c471b, 0x28db77f523047d84, 0x32caab7b40c72493, 0x3c9ebe0a15c9bebc, 0x431d67c49c100d4c, 0x4cc5d4becb3e42b6, 0x597f299cfc657e2a, 0x5fcb6fab3ad6faec, 0x6c44198c4a475817);
  var HASH = new Array(0x6a09e667f3bcc908, 0xbb67ae8584caa73b, 0x3c6ef372fe94f82b, 0xa54ff53a5f1d36f1, 0x510e527fade682d1, 0x9b05688c2b3e6c1f, 0x1f83d9abfb41bd6b, 0x5be0cd19137e2179);
  var W = new Array(80);
  var a, b, c, d, e, f, g, h, i, j;
  var T1, T2;

}

function str2binb (str) {
  var bin = Array();
  var mask = (1 << 8) - 1;
  for(var i = 0; i < str.length * 8; i += 8)
    bin[i>>5] |= (str.charCodeAt(i / 8) & mask) << (24 - i%32);
  return bin;
}

function binb2str (bin) {
  var str = "";
  var mask = (1 << 8) - 1;
  for(var i = 0; i < bin.length * 32; i += 8)
    str += String.fromCharCode((bin[i>>5] >>> (24 - i%32)) & mask);
  return str;
}

function binb2hex (binarray) {
  var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i++)
  {
    str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
      hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
  }
  return str;
}

function binb2b64 (binarray) {
  var tab = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var str = "";
  for(var i = 0; i < binarray.length * 4; i += 3)
  {
    var triplet = (((binarray[i   >> 2] >> 8 * (3 -  i   %4)) & 0xFF) << 16)
      | (((binarray[i+1 >> 2] >> 8 * (3 - (i+1)%4)) & 0xFF) << 8 )
      |  ((binarray[i+2 >> 2] >> 8 * (3 - (i+2)%4)) & 0xFF);
    for(var j = 0; j < 4; j++)
    {
      if(i * 8 + j * 6 > binarray.length * 32) str += '=';
      else str += tab.charAt((triplet >> 6*(3-j)) & 0x3F);
    }
  }
  return str;
}

function hex_sha256(s){return binb2hex(core_sha256(str2binb(s),s.length * 8));}
function b64_sha256(s){return binb2b64(core_sha256(str2binb(s),s.length * 8));}
function str_sha256(s){return binb2str(core_sha256(str2binb(s),s.length * 8));}

function sign(c, n) {
  var e = str2binb(n)
  var a = str2binb(c)
  if (a.length > 16) {
    a = core_sha256(a, c.length * 8)
  }
  var m = Array(16), f = Array(16)
  for (var h = 0; h < 16; h++) {
    m[h] = a[h] ^ 909522486;
    f[h] = a[h] ^ 1549556828
  }
  var l = m.concat(e);
  var d = core_sha256(l, 512 + n.length * 8);
  var b = f.concat(d);
  var k = core_sha256(b, 512 + 256);
  var j = binb2b64(k);
  return j
}
