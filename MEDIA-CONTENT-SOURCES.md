# 影视来源调研记录

- [archive-movie-browser](https://github.com/amponce/archive-movie-browser) 是开源目录和播放器，影视文件来自 Internet Archive，而非该项目自有影视 API。[WikiFlix](https://www.wikidata.org/wiki/Help:WikiFlix) 使用 Wikidata 数据并指向 Commons、Internet Archive 等实际内容来源。开源代码许可不代表所有视频的播放授权。
- [MoonTV 配置示例](https://github.com/666zmy/moontv-v0/blob/main/config.json) 列有苹果 CMS 接口。本机 2026-11-06 实测 360zy 目录 `ac=detail&t=16` 返回欧美剧，条目含地区和语言；地区、语言请求参数未生效，需本地按元数据过滤。目录仅能搜索其提供的名称，部分条目缺少语言和地区。
- 同日通过实际应用接口筛选英语剧，返回 19 条；首条影视的 HLS 主清单和子清单均返回 200，片段范围请求返回 206。主清单没有声明字幕轨，不能证明影片有英文字幕或浏览器一定能成功解码。用户仍可使用自己的 SRT/VTT 进行字幕预习。
- 测试环境中 Internet Archive 服务不可达；另外 wujin 接口返回 403，ikun 和 ckzy 连接重置。访问结果可能因时间和网络不同而变化。
- 360zy 是第三方内容索引，未核实具体影片的版权和授权；可访问不等于具有授权。测试只检查目录、清单与少量片段访问，不代表全部内容可靠或合法。
