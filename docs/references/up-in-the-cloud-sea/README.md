# 来源与移植记录

- 开发时也参考了用户提供的 HTML；上传原件仅保留在原工作区，不随发布副本分发。
- 原作者：Tianxiu (Tyson) Zhou；原作品页面：https://people.tamu.edu/~choutianxius/csce646/pr01/index.html
- 原 GLSL：https://people.tamu.edu/~choutianxius/csce646/pr01/main-image-source.txt ，保存为 `main-image-source.glsl`。
- 蓝噪声：https://people.tamu.edu/~choutianxius/csce646/pr01/blue_noise.png
- 作者仓库：https://github.com/choutianxius/csce646-digital-image ，仓库 MIT 许可保存为 `LICENSE`。
- 作者明确注明基于 mdb：https://www.shadertoy.com/view/Ndc3zl 。此站本次返回浏览器验证页，未直接取得 mdb 的原始代码或独立许可。此处保留作者公开代码中的溯源，不将仓库 MIT 声明扩展为对上游许可的独立核实。
- 获取日期：2026-09-14。

上传 HTML 与作者公开源文件的云场函数相同（只有一处空行差别）。HTML 运行时生成随机白噪声，作者页面使用蓝噪声文件。当前实现使用本地蓝噪声，保留参考代码的 fbm、14 层色阶、距离速度与五次前景时间采样。

火车与蒸汽使用原 GLSL 公式，新增真实主轴、列车位置输入及十节车厢长度裁切。按用户最后的修正，桥梁与铁轨恢复为现有 SVG 样式，不再在着色器中绘制：位置固定、颜色恒定，缩放时有最小可见线宽。前景云仅遮挡桥墩下部，保护轨道、根卡片及其工具栏。还增加统一暂停、隐藏页面节能、分辨率限制和 GPU 失效回退。

参数扩展使用 `public/assets/cloud-sea/clouds-controls.frag`，以独立远近云位移、云量、亮度、运动模糊和动态光照 uniform 实现实时调节。默认值保持原版云场和光照；`clouds.frag` 保留供旧页面加载，避免更新期间旧脚本与新 shader 接口不兼容。作者源文件保留用于溯源。
