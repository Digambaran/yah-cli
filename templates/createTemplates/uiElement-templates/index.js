const { generateUiElementAppJs } = require('./generate-appJs')
const { generateUiElementBootstrapJs } = require('./generate-bootstrapJs')
const { generateUiElementIndexJs } = require('./generate-indexJs')
const { generateUiElementPackageJson } = require('./generate-packageJson')
const { generateUiElementsReadme } = require('./generate-readme')
const { generateUiElementJs } = require('./generate-uiElementJs')
const { generateUiElementWebpack } = require('./generate-webpackConfig')
const { generateUiElementIndexHtml } = require('./generateIndexHtml')
const { generateUiElementFederationExpose } = require('./generate-federation-exposeJs')

module.exports = {
  generateUiElementIndexHtml,
  generateUiElementJs,
  generateUiElementWebpack,
  generateUiElementIndexJs,
  generateUiElementPackageJson,
  generateUiElementBootstrapJs,
  generateUiElementAppJs,
  generateUiElementsReadme,
  generateUiElementFederationExpose,
}
