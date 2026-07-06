const fs = require('node:fs')
const path = require('node:path')
const { load } = require('resedit/cjs')

const ZH_CN = { lang: 2052, codepage: 1200 }

async function setExeLanguage(filePath) {
  const ResEdit = await load()
  const source = fs.readFileSync(filePath)
  const executable = ResEdit.NtExecutable.from(source, { ignoreCert: true })
  const resources = ResEdit.NtExecutableResource.from(executable)
  const existing = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0]
  const oldLanguages = existing?.getAllLanguagesForStringValues() || []
  const oldValues = oldLanguages.length ? existing.getStringValues(oldLanguages[0]) : {}
  const fileName = path.basename(filePath)
  const versionInfo = ResEdit.Resource.VersionInfo.create(2052, existing ? { ...existing.fixedInfo } : {}, [{
    ...ZH_CN,
    values: {
      ...oldValues,
      CompanyName: '右键菜单管理器',
      FileDescription: '查看并安全移除 Windows 右键菜单集成',
      FileVersion: '1.0.0.0',
      InternalName: '右键菜单管理器',
      LegalCopyright: '版权所有 © 2026 geshanzsq',
      OriginalFilename: fileName,
      ProductName: '右键菜单管理器',
      ProductVersion: '1.0.0.0'
    }
  }])
  versionInfo.replaceAvailableLanguages([ZH_CN])
  resources.entries.splice(0, resources.entries.length, ...resources.entries.filter((entry) => entry.type !== 16))
  versionInfo.outputToResourceEntries(resources.entries)
  resources.outputResource(executable)
  const output = Buffer.from(executable.generate())
  const temporaryPath = `${filePath}.zh-cn.tmp`
  fs.writeFileSync(temporaryPath, output)
  fs.renameSync(temporaryPath, filePath)
}

module.exports = { setExeLanguage }
