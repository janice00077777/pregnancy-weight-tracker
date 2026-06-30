# Vercel 部署说明

## 项目设置

- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

## PWA 验证

部署完成后访问线上 HTTPS 地址，检查：

- `/manifest.webmanifest` 可以正常打开。
- `/sw.js` 可以正常打开，并带有 `Cache-Control: no-cache`。
- 浏览器开发者工具 Application 面板可以看到 manifest 和 service worker。
- 首次在线打开后，断网刷新仍能进入应用并读取本地数据。

## 说明

应用数据只保存在当前浏览器的 `localStorage`，Vercel 只托管静态页面，不需要服务器或数据库。
