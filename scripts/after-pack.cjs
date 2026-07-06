const path = require('node:path')
const { setExeLanguage } = require('./exe-language.cjs')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  await setExeLanguage(path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`))
}
