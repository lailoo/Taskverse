# AI Town 地图与建筑素材

来源：https://github.com/a16z-infra/ai-town

固定提交：`8e05997f2409275669c8344b84a51692e83f3f33`。

获取方式：官方 codeload 同提交源码压缩包。重新导入时，请将该提交源码解压到本机忽略目录 `.local/references/ai-town/`。原始开发缓存不随仓库分发。

导入：`node scripts/import-ai-town.mjs .local/references/ai-town`。
逐文件 SHA-256 与仓库路径见 `manifest.json`。图片、帧定义均原样复制，地图和建筑组合由本项目运行时生成。

## 实际使用

- `buildings/town-buildings.png`：17 类、51 帧建筑，保留原版木屋，并用原图集的屋顶、墙面与门洞部件组合扩展建筑。具体创作说明与 CC BY-SA 3.0 署名见 `buildings/SOURCES.md`。

- `gentle-obj.png`：AI Town 默认地图的组合图集，取草地、土路、树林、河岸、帐篷、箱子、花草和木材。
- `rpg-tileset.png`：原版木屋和扩展建筑的屋顶、墙面、石材、拱门部件来源。生成器直接裁切拼接，保留原始色板，坐标与源文件摘要见建筑图集 JSON。衍生作品沿用 CC BY-SA 3.0；原始图集保留完整。
- `32x32folk.png`：方向与行走帧，居民沿街移动。
- `windmill.png` / `windmill.json`：大型风车建筑的原始 8 帧。
- `gentlewaterfall32.png` / `gentlewaterfall.json` / `gentlesplash.json`：瀑布与水花帧。
- `campfire.png` / `campfire.json`：营火动画。
- `magecity.png`：仓库内建筑资源的参考备份，当前渲染未使用。

## 署名与授权

AI Town 代码使用 MIT，原始文本见 `AI-TOWN-CODE-LICENSE.txt`；它不覆盖为所有第三方美术重新授权的承诺。

Uses the "16x16 RPG Tileset" by hilau at https://opengameart.org/content/16x16-rpg-tileset, which is based off of "16x16 Game Assets" by George Bailey at https://opengameart.org/content/16x16-game-assets, and "LPC Thatched-roof Cottage" by bluecarrot16 at https://opengameart.org/content/lpc-thatched-roof-cottage.

- George Bailey：原作者页面标注 **CC BY 4.0**，https://creativecommons.org/licenses/by/4.0/ 。按原作者要求保留署名与来源链接。
- hilau：原作者页面列出 **CC BY-SA 3.0 / GPL 3.0** 可选授权；本项目对相关素材选择 CC BY-SA 3.0，https://creativecommons.org/licenses/by-sa/3.0/ 。衍生建筑美术同样以 CC BY-SA 3.0 提供。
- AI Town README 同时署名 ansimuz：https://opengameart.org/content/tiny-rpg-forest 。保留该组合素材的上游署名。
- `gentle-obj.png` 是仓库组合图集；`32x32folk.png` 与动画图集在该固定提交未附逐文件授权声明。保留 AI Town 来源和 README 的素材作者，不将这些文件额外标为 CC0 或统一 MIT。

授权页面核对日期：2026-09-13。此目录没有 SimCity 或 Cities: Skylines 游戏原版资源。
