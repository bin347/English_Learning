# 句子与听力练习材料

## 内置题库

`exercises.json` 包含本项目编写的 150 条英中对照练习。英文题目、中文参考及评分关键词均为项目原创，没有从第三方网站、教材或试卷复制。它们与原有的三条入门示例使用不同的稳定 ID。

| 练习难度 | 数据值 | 题数 | 编排依据 |
| --- | --- | ---: | --- |
| 基础 | `beginner` | 50 | 简单句、常见生活词汇、直接信息 |
| 进阶 | `intermediate` | 50 | 条件、比较、原因、目的、完成时等信息关系 |
| 挑战 | `advanced` | 50 | 复合句、让步与假设、限定条件、抽象观点和论证 |

这些是应用内的练习难度，不是经过认证的 CEFR、四级、六级、雅思或托福等级。词书等级应使用词库本身的标签，不应直接等同于这三档句子练习难度。

每档均有“日常生活”“出行旅行”“学习成长”“职场沟通”“社会科技”五个主题，每主题 10 题。全部题目均可用于英译中、听英文写英文和听英文写中文意思。

每题配有 3–4 个按原句含义编写的关键词组，包含常见中文同义说法。它们用于有限的基础比对，不能替代整句语义判断，不能可靠识别所有否定、主客体颠倒或不自然表达。参考译文是合理答案之一，并非唯一正确表达；未命中的关键词应当提示用户复核，不应直接认定用户一定错译。

内置题库没有真人音频；`audioSource: "tts"` 表示使用系统英语语音朗读，界面应明确显示“机器朗读”。不能把机器语音写成真人录音，也不能为这些原创句子附上不对应的第三方音频。

材料标记为“项目原创”，无需第三方文本许可或外部署名。该标记没有替项目所有者决定公开发行许可证；未来发布 GitHub 仓库时可统一确定项目内容许可。

## 更新与校验

运行 `python scripts/prepare-exercises.py` 可从脚本中逐条编写的双语材料重新生成 JSON。脚本没有网络请求，也不会读取或修改用户学习记录。

生成时核对题数、分级分布、英文去重、每题关键词组数量、关键词英文出现在原句中、以及每组至少有一种中文表达能匹配参考译文。该校验用于发现材料结构和参考答案错误，不代表已经验证所有合理译法，也不等同于教师审核。

## 可接入的开源项目：Tatoeba

- 项目：[Tatoeba/tatoeba2](https://github.com/Tatoeba/tatoeba2)。这是开放的句子与译文协作项目；应用代码与句子数据的许可证不是同一回事，不需要复制其服务端代码来使用公开 API。
- API 入口：[api.tatoeba.org](https://api.tatoeba.org/)，[官方 OpenAPI](https://api.tatoeba.org/openapi.json)。`/v1` 是稳定的只读接口，目前无需认证。
- [数据下载与许可说明](https://tatoeba.org/en/downloads)：普通句子主要采用 CC BY 2.0 FR，部分为 CC0 1.0；音频由录音者逐条选择许可，许可为空的音频不能在 Tatoeba 项目外复用。

2026-11-06 在开发电脑上以公开词语 `garden`、`library` 查询，确认接口返回 HTTP 200、英语原句、直接中文译文及作者和授权元数据。未将这些外部句子混入原创题库，也没有批量下载第三方音频。

可用的查询示例：

```text
https://api.tatoeba.org/v1/sentences?lang=eng&q=library&trans%3Alang=cmn&trans%3Ais_direct=yes&trans%3Ais_unapproved=no&is_unapproved=no&showtrans%3Alang=cmn&showtrans%3Ais_direct=yes&showtrans%3Ais_unapproved=no&include=audios&sort=relevance&limit=10
```

`sort` 是必填参数，省略会返回 HTTP 400。响应为 `{data: [...], paging: {total, has_next, next}}`。存在直接译文的筛选 `trans:is_direct=yes` 不等于“只返回直接译文”，还要使用 `showtrans:is_direct=yes`，并在应用入口核对译文的语言和直接关联状态。

句子字段包含 `id`、`text`、`lang`、`license`、`owner`、`is_unapproved`、`translations` 和 `audios`。导入时保留英语与中文两个句子 ID、作者、各自许可证，以及 `https://tatoeba.org/en/sentences/show/{id}` 原文链接。英中许可不同的情况应分别记录，不可把英语的 CC0 误用到中文译文上。

音频字段实测为 `id`、`author`、`license`、`attribution_url` 和 `download_url`。下载应使用响应中的 `download_url`，不能只根据英语句子 ID 拼接音频地址。官方 OpenAPI 与当前返回地址的复数形式存在差别：实测 `download_url` 为 `/v1/audio/{audioId}/file`，这也是优先使用响应字段的原因。

不少常见英语句子的 CK 录音采用 CC BY-NC-ND 3.0，另一些音频未提供项目外使用许可。它们不能被笼统当作可任意改编或商业分发的免费音频。若要提供跨用途的内置录音，应只选许可明确符合用途的项目，并保存作者和署名链接；暂未选择合适录音的句子可以标明使用系统朗读。

外部导入的句子如果没有人工编排过的语义关键词，保持 `keywords: []`。它们可以直接用于英文听写，配置评分用途的 API 后也可以做语义评阅；基础中文评分应要求用户补充参考和关键词，不能自动把词典释义拼成评分标准，也不能把整句参考译文当成唯一关键词来冒充语义评分。
