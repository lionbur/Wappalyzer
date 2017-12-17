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
    browser.runtime.sendMessage({
      id: 'get_apps',
      url: location.href,
      source: 'content.js'
    })
      .then(handleDetectedApps);

    document.documentElement.appendChild(container);
    document.documentElement.appendChild(script);
  } catch(e) {
    log(e);
  }
}

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

  if (eCommerceDetected.length) {
    showBar(eCommerceDetected
      .map(({ name }) => name ))
  }
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

const renderField = ({ field, value }) =>
  `<div>
    <span>${field}</span>
    <b>${value}</b>
  </div>`


function showBar(frameworks) {
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
