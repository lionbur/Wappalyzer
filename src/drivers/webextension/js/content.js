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
      && isFinite(getOffset(el).top)
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
  const offscreenFilter = value => value < 0 ? 10000 : value
  const avoidOffscreen = ({ left, top }) => ({ left: offscreenFilter(left), top: offscreenFilter(top) })
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
        offset: avoidOffscreen(getOffset(button)),
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

function cleanText (text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[()®]/g, '')
    .replace(/\s+-+\s+|,\s/g, ' ')
}


function detectProductName(parent, maxTop) {

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

function getNowTimeStamp() {
  return new Date().toISOString()
}

async function signAsync(secretKey, data) {
  const enc = new TextEncoder('utf-8')

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    {
      name: 'HMAC',
      hash: { name: 'SHA-256' },
    },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(data)
  )

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

function http(url) {
  return new Promise((resolve, reject) => {
    var xhr = new XMLHttpRequest()
    xhr.addEventListener("load", function() { resolve(this) })
    xhr.addEventListener("error", function() { reject(this) })
    xhr.open("GET", url)
    xhr.send()
  })
}

function* xmlIterator(root, path) {
  const iterator = root
    .ownerDocument
    .evaluate(path, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
  let node

  while (node = iterator.iterateNext()) {
    yield node
  }
}

function getXmlString(root, path) {
  return root
    .ownerDocument
    .evaluate(path, root, null, XPathResult.STRING_TYPE, null)
    .stringValue
}

function smartGet(obj, path) {
  const keys = path.split('.')

  for (const key of keys) {
    if (!obj) {
      break
    }

    obj = obj[key]

    if (Array.isArray(obj) && obj.length === 1) {
      obj = obj[0]
    }
  }

  return obj
}

async function showBar() {
  const queryParamsSorted = params => Object
    .entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .sort()
    .join('&')
  const queryParams = params => Object
    .entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

  const secretKey = 'UgWpEOjWiD+kmVSB6t1ur/4vnXFdpAe7VmGhOAFq'
  const signParams = async (endpoint, uri, params) => {
    const stringToSign = `GET\n${endpoint}\n${uri}\n${params}`
    const base64 = await signAsync(secretKey, stringToSign)

    return `${params}&Signature=${encodeURIComponent(base64)}`
  }

  const getXml = async response => (new DOMParser())
    .parseFromString(
      (await response.text())
        .replace(/\s+xmlns=".*?"/g, ''),
      'text/xml')

  const fields = []

  const buyButton = detectBuyButton()
  const { priceElement, parent } = detectPrice(buyButton.node.parentElement)
  const productName = detectProductName(parent, getOffset(priceElement).top)

  if (productName) {
    const cleanProductName = cleanText(productName)
    const endpoint = 'webservices.amazon.com'
    const uri = '/onca/xml'

    const params = queryParamsSorted({
      AWSAccessKeyId: 'AKIAJUI45MRHWJVMOZKA',
      AssociateTag: 'saveey2018-20',
      Keywords: cleanProductName.replace(/[(),]/g, ''),
      Operation: 'ItemSearch',
      ResponseGroup: 'ItemAttributes,Offers,Images',
      SearchIndex: 'All',
      Service: 'AWSECommerceService',
      Timestamp: getNowTimeStamp(),
    })
    const signedQuery = await signParams(endpoint, uri, params)
    const response = await fetch(`${location.protocol}//${endpoint}${uri}?${signedQuery}`, { mode: 'cors' })
    const xml = await getXml(response)

    const getPriceAmount = ({ price }) => parseFloat(price.replace(/[A-Za-z,\s$]/g, ''))
    let offers = Array
      .from(xmlIterator(xml.documentElement, '/ItemSearchResponse/Items/Item'))
      .map(item => ({
        name: `[Amazon] ${getXmlString(item, 'ItemAttributes/Title')}`,
        price: getXmlString(item, 'OfferSummary/LowestNewPrice/FormattedPrice'),
        icon: {
          url: getXmlString(item, 'SmallImage/URL'),
          width: getXmlString(item, 'SmallImage/Width'),
          height: getXmlString(item, 'SmallImage/Height'),
        }
      }))
      .concat(priceElement
        ? [{ name: productName, price: priceElement.innerText.trim(), isCurrent: true }]
        : null
      )

    let ebay
    const keywords = cleanProductName.split(' ')

    do {
      ebay = await (await fetch(`${location.protocol}//svcs.ebay.com/services/search/FindingService/v1?${queryParams({
        'OPERATION-NAME': 'findItemsIneBayStores',
        'SERVICE-VERSION': '1.0.0',
        'SECURITY-APPNAME': 'Saveey-saveey-PRD-d5d8a3c47-a4f4fc2e',
        'GLOBAL-ID': 'EBAY-US',
        'RESPONSE-DATA-FORMAT': 'JSON',
        keywords: keywords.join(' '),
        'REST-PAYLOAD': 1,
//        'paginationInput.entriesPerPage': 3,
      })}`, {
        mode: 'cors',
      }))
        .json()
      keywords.pop()
    } while(
      (smartGet(ebay, 'findItemsIneBayStoresResponse.paginationOutput.totalEntries') === '0')
      && (keywords.length >= 3))

    const fixCurrency = currency => currency
      .replace(/USD/, '$')
    const mergePrice = price => `${fixCurrency(price['@currencyId'])}${price.__value__}`
    const ebayResults = smartGet(ebay, 'findItemsIneBayStoresResponse.searchResult.item')
    if (ebayResults) {
      offers = offers
        .concat(ebayResults
          .map(result => ({
            name: `[eBay] ${smartGet(result, 'title')}`,
            price: mergePrice(smartGet(result, 'sellingStatus.currentPrice')),
            icon: {
              url: smartGet(result, 'galleryURL')
            }
          })))
    }

    offers
      .sort((a, b) => getPriceAmount(a) - getPriceAmount(b))

    const style = document.createElement('style')
    style.innerText = `
      .sav-bar {
        position: absolute;
        border: 1px solid rgba(0,0,0,.5);
        border-radius: 5px;
        padding: 5px 20px;
        z-index: 1000000;
        color: black;
        background-color: rgba(255,255,255,.95);
        box-shadow: 0px 0px 5px;
        direction: ltr;
        text-align: left;
        max-width: 500px;
        max-height: 300px;
        overflow-y: auto;
      }
      
      .sav-offer {
        width: 100%;
        display: flex;
        flex-direction: row;
        align-items: center;
        max-height: 64px;
      }
      .sav-offer:nth-child(odd) {
        background-color: rgba(240,240,240,.95);
      }
      .sav-current {
        background-color: rgba(192,255,255,.95);
      }
      .sav-offer:hover {
        background-color: rgb(192,192,192);
      }
      .sav-current:hover {
        background-color: rgb(180,240,240);
      }
      .sav-offer > b {
        flex: 0 0;
        min-width: 100px;
        text-align: right;
        padding-right: 20px;
      }
      .sav-offer > span {
        padding: 5px;
        flex: 1 1;
        overflow: hidden;
        text-overflow: ellipsis;
        -webkit-line-clamp: 3;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        max-height: 64px;
        line-height: 20px;
      }
      .sav-offer > img {
        max-width: 64px;
        max-height: 64px;
        flex: 0 0;
      }
      .sav-icon-placeholder {
        min-width: 64px;
        height: 64px;
        flex: 0 0;
      }
    `
    document.body.appendChild(style)

    const bar = document.createElement('div')

    const buyButtonOffset = getOffset(buyButton.button)
    const docWidth = document.documentElement.clientWidth
    if (docWidth - buyButtonOffset.left > 500) {
      bar.style.left = `${buyButtonOffset.left}px`
    } else {
      bar.style.right = `${docWidth - buyButtonOffset.left - buyButton.button.clientWidth}px`
    }
    bar.style.top = `${buyButtonOffset.top + buyButton.button.clientHeight * 1.25}px`

    bar.className = 'sav-bar'

    bar.innerHTML = offers
      .map(({ name, price, isCurrent, icon }) => `
<div class="sav-offer${isCurrent ? ' sav-current' :''}">
  ${icon ? `<img src="${icon && icon.url}"/>` : '<div class="sav-icon-placeholder"></div>'}
  <b>${price}</b>
  <span title="${name.replace(/"/g, '&quot;')}">${name}<span>
</div>`)
      .join('\n')

    document.body.appendChild(bar)
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
