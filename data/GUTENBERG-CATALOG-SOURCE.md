# Gutenberg 本地书目快照

本项目收录一份 Project Gutenberg 英文书目元数据快照，用于在线目录暂不可用时在本机搜索。快照包含 64,343 条标记为有正文、英文、美国公有领域的书目信息（编号、书名、作者），不包含书籍正文。书籍是否可在所在地使用应以各书附带的许可说明为准。

- 原始书目：[Project Gutenberg 机器可读书目](https://www.gutenberg.org/ebooks/offline_catalogs.html)。Gutenberg 说明[书目数据属于公有领域](https://www.gutenberg.org/policy/robot_access.html)。
- 本快照从 [ropensci/gutenbergr 的 Gutenberg 元数据](https://github.com/ropensci/gutenbergr/blob/main/data/gutenberg_metadata.rda)提取，取得日期为 2026-11-08；保留 `language=en`、`has_text=true`、`rights=Public domain in the USA.` 的记录。
- 快照不会自动更新，可能缺少之后新增的作品。Gutendex 可用时，程序也显示在线搜索结果；导入正文需要联网。
