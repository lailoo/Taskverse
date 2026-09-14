# 婚礼小镇扩展建筑

本项目组合的 17 类像素建筑，每类 3 个固定变体，共 51 帧：保留原版木屋，并包含鸿福大酒店、龙门客栈、小旅馆、箭塔和园区围墙等扩展类型。
金色/棕色屋顶、半木墙面、木板、石墙和拱门直接裁切自 AI Town 仓库中的 `rpg-tileset.png`，使用最近邻缩放与拼接，保留原始色板和材质。原版木屋的首个变体直接组合原始屋顶与墙面；其他建筑的楼层、轮廓、窗户、招牌和陈设由 `scripts/generate-town-buildings.py` 组合绘制。
图集 JSON 记录 `sourceSha256` 和 `sourceParts` 裁切坐标，可追溯每个原始部件。市政风车与帐篷仍由地图渲染器直接绘制原始图片。

这些建筑属于本项目的扩展美术，并非 AI Town 官方新增素材。

## 复现

安装 Python 3 与 Pillow 后，在项目根目录运行：

```sh
python3 scripts/generate-town-buildings.py
```

生成 `town-buildings.png`、`town-buildings.json`、`docs/design-references/ai-town/building-catalog.png` 和 `original-style-buildings.png`。细节采用固定种子；相同输入可生成相同建筑。

## 署名与授权

扩展建筑美术与图集以 **CC BY-SA 3.0** 提供：https://creativecommons.org/licenses/by-sa/3.0/ 。

Uses the "16x16 RPG Tileset" by hilau at https://opengameart.org/content/16x16-rpg-tileset, which is based off of "16x16 Game Assets" by George Bailey at https://opengameart.org/content/16x16-game-assets, and "LPC Thatched-roof Cottage" by bluecarrot16 at https://opengameart.org/content/lpc-thatched-roof-cottage.

与原素材的变化：原始部件裁切、最近邻缩放与组合，并增加楼层、窗户和用途细节。原始图集不作修改，不对原版屋顶重新配色。AI Town 固定源码与其他素材署名见上级 `SOURCES.md`。
