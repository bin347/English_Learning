# 第三方资源与内容来源

本应用独立实现学习功能，没有复制 Readest、LunaTV 或 LibreTV 的应用代码。

## 随应用分发

- foliate-js：John Factotum 及贡献者，MIT。源码位于 `vendor/foliate-js`，许可见该目录 `LICENSE`；阅读 EPUB 使用其中 ZIP/fflate 组件，各组件许可保留于上游目录。
  https://github.com/johnfactotum/foliate-js
- ECDICT：skywind3000 及贡献者，MIT。应用筛选常用词频、BNC 和考试标签词条，保留中文释义、词形等字段；许可见 `data/ECDICT-LICENSE.txt`。
  https://github.com/skywind3000/ECDICT
- 单词词组搭配：整理自 KyleBing/english-vocabulary 的 JSON 词书（提交 `731240a848dca14e2cf17510f384312b788863c1`），仓库标注 BSD 3-Clause；保留许可见 `data/ENGLISH-VOCABULARY-LICENSE.txt`。数据按词条合并、过滤并限制展示数量，另包含项目手工整理的少量词组。其上游 kajweb/dict 自述数据抓取自商业背词应用，原始内容的再分发授权尚未核实，公开分发前应自行核对；词组与译文未经逐条校对。
  https://github.com/KyleBing/english-vocabulary / https://github.com/kajweb/dict
- 下载快照的哈希见 `data/upstream-versions.json`。React、Electron、Vite、lucide-react、hls.js 等依赖的许可随 npm 包保留；具体版本见 `package-lock.json`。Electron 安装目录保留运行时许可证。
- 内置的三篇短文、练习及字幕样例为本项目编写的示例材料。

## 在线服务

- 新闻模块从中国日报和新华社英文网获取标题与原文链接，在应用内嵌入原站阅读，并可由用户将原站正文提取到本机用于学习；应用不随安装包分发这两家媒体的文章正文。两家媒体的作品使用受各自版权声明约束，开源新闻抓取代码的许可不等于新闻内容许可。
  https://www.chinadaily.com.cn/china / https://english.news.cn/china/ / https://cn.chinadaily.com.cn/c/5f59c820a31009ff9fddf6bc/62a2b370a3101c3ee7ad9de1 / https://www.xinhuanet.com/xinhua_copyright.htm
- 新闻模块的 Global Voices · 中国来源可将其原创英文文章文字导入本地阅读与练习。Global Voices 的原创内容采用 CC BY 3.0；应用在文章顶部显示来源、作者、原文链接和文字许可。照片、视频、音频及其他第三方素材不随正文导入，它们可能受不同许可约束。
  https://globalvoices.org/-/world/east-asia/china/ / https://globalvoices.org/about/global-voices-attribution-policy/ / https://creativecommons.org/licenses/by/3.0/
- 经典书目来自 Project Gutenberg；搜索还可访问 Gutendex。导入时保留原文件中的版权及许可说明。美国公版状态不代表所有地区的版权状态，下载资源需遵循来源许可。
  https://www.gutenberg.org/ / https://gutendex.com/
- 内置英文读物《Alice’s Adventures in Wonderland》作者 Lewis Carroll，电子书由 Arthur DiBianca 和 David Widger 制作，来源为 Project Gutenberg 第 11 号电子书。随应用附带原版 EPUB，完整保留其中的 Project Gutenberg License 及版权声明；该书在美国属于公版，其他地区适用当地法律。
  https://www.gutenberg.org/ebooks/11 / https://www.gutenberg.org/policy/license.html
- 内置影视测试目录使用 360 资源的苹果 CMS 接口（该地址见 MoonTV 的公开配置），未复制其影视文件或 MoonTV 应用代码。预习可读取影视源附带字幕以及 SubtitleDB、Gestdown 和 YIFY Subtitles 的公开结果，电影备用来源可通过 Cinemeta 核对 IMDb ID。安装包不包含这些影视或字幕文件。
  https://github.com/666zmy/moontv-v0/blob/main/config.json
- 清空影视接口后可使用 Internet Archive 的经典电影集合，条目的授权及可用文件由来源提供。当前开发网络下该来源未连通。
  https://archive.org/
- 可配置苹果 CMS V10 格式的影视目录；使用者负责提供有权使用的来源。添加目录不代表应用授予该目录内影片、字幕的许可。
- 内置 Bing 和 Yandex 翻译独立调用其无需用户 Key 的网页翻译接口，参考 Readest 对内置翻译与词典查询的功能区分，没有复制其应用代码，也不使用 Readest 托管服务或密钥。这些网页接口不是稳定性受保证的官方付费 API，受网络、限流及服务变更影响；请求会把选中文字发送给自动回退顺序中实际使用的翻译服务。
  https://www.readest.com/docs/translate / https://cn.bing.com/translator / https://translate.yandex.ru/
- 自定义 AI 翻译与语义评分直接调用使用者配置的服务。应用不附赠任何服务商的密钥、额度或账号。

- 内置新增 150 条练习为本项目原创，使用机器朗读；分级与来源见 `data/EXERCISES-SOURCES.md`。在线例句通过 Tatoeba 的公开 API 搜索并由用户导入，保留英、中句各自作者、许可证与原句链接，不复制其应用代码。
  https://github.com/Tatoeba/tatoeba2 / https://tatoeba.org/en/downloads / https://api.tatoeba.org/
