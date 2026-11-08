# 薄插件改装模板 · 挂载/禁用步骤

1. `xcopy plugins\_template-open-mod plugins\<name>\ /E /I`,改 `index.js` 的 `MOD_NAME`、`super(ctx,'<name>')`、package.json 的 name
2. 挂载(二选一):
   - cordis.patch.yml:`- insert: [- id: <name>, name: 'dsh-plugin-<name>']`
   - 官方通道:`dsh plugin --profile headless add <绝对路径>\plugins\<name>`
3. 冷加载冒烟:`node -e "import('file://…/plugins/<name>/index.js').then(m=>console.log(Object.keys(m)))"`
4. 组装核验:`--dump-config --profile headless | findstr <name>`
5. **负例**(验证不崩):index.js 顶部加 `throw new Error('x')` → 重启 → 启动日志「插件激活失败」含它、主进程存活 → 还原
6. 禁用:注释 cordis.patch.yml 的 insert 块(或 `dsh plugin --profile X remove`)
7. 铁律:engines.dsh 匹配;禁 allow-version;激活不 throw;自带日志
