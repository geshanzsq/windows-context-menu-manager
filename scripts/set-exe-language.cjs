const fs = require('node:fs')
const path = require('node:path')
const { setExeLanguage } = require('./exe-language.cjs')

async function main() {
  const releaseDirectory = path.resolve(__dirname, '..', 'release')
  const files = fs.readdirSync(releaseDirectory)
    .filter((file) => file.toLowerCase().endsWith('.exe'))
    .map((file) => path.join(releaseDirectory, file))
  for (const file of files) await setExeLanguage(file)
  process.stdout.write(`已将 ${files.length} 个 EXE 的版本资源语言设置为简体中文。\n`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
