# 第三方组件与数据来源

| 组件 | 版本 / 文件 | 许可 | 用途 | 来源 |
|---|---|---|---|---|
| Three.js | r160.1 `public/vendor/three.module.min.js` | MIT | 3D 渲染 | https://github.com/mrdoob/three.js |
| ip2region | v4 数据 `data/ip2region_v4.xdb`（11.1 MB） | Apache-2.0 | 离线 IP 归属地（国家/省/城市） | https://github.com/lionsoul2014/ip2region |

**Three.js**：本地 vendor 化，运行时不请求任何 CDN。许可全文见
https://github.com/mrdoob/three.js/blob/master/LICENSE

**ip2region**：数据文件来自官方仓库 `data/ip2region_v4.xdb`，项目许可 Apache-2.0，
详见 https://github.com/lionsoul2014/ip2region/blob/master/LICENSE.md 。
本项目按其官方 JS binding 的字节布局实现了零依赖读取器（`server/geoip.js`），
未引入其 npm 包。数据仅在本机内存解析，不调用任何在线 IP 查询 API、不向外发送 IP。

**经文与咒语**：《太上老君说常清静经》依《正统道藏》通行本，参照中国道教协会
《〈清静经〉文本校订》、泰山明万历碑、故宫藏宋刻碑本与明文徵明书本；
八大神咒依湖北省道教协会《玄门日诵早坛功课经》。均为传统典籍，属公有领域，
仅作文化展示，不作任何宗教功效宣称。

**字体与贴图**：全部使用系统字体（微软雅黑 / 楷体等）与 Canvas 程序化绘制，
未内置、未下载任何第三方字体或图片。

**音频**：未附带任何第三方音频。真人诵经音轨需自行放入 `public/audio/`，授权自负。

**原作说明**：本项目复刻的是韩国网页游戏《山寺》(sansatemple.com) 的玩法机制与
体验结构（免注册、Q 版角色、蒲团、多人同屏、零社交、循环经声），
**不含其任何代码、模型、贴图、音频或商标**。


**经文诵读音轨**：`public/audio/scripture/*.mp3` 由本机 IndexTTS-2 依据公有领域经文文本
合成，非第三方录音；文本为传统典籍（公有领域）。用于朗读的参考音色为用户自有的
「解说语音v11.1」克隆音色，仅在本机生成，不随项目分发模型权重。
