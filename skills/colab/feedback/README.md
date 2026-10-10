
# Skill Feedback

首版支持 Codex/macOS。后台采集与评价由已授权 hook 驱动，不是用户主任务的执行步骤。

分析我拥有的 Skill 使用反馈：先 `bin/colab-feedback list-assets` 查看资产和数量，
再 `bin/colab-feedback list-feedbacks --asset-key 'asset:<id>' --status unresolved`。
用 `--include rating,tags,comment,taskTrajectory` 按需展开评论；原始任务用
`bin/colab-session-reader read --ref 'colab://feedback/<id>/session'`。
完整分析指引见 [producer-prompt.md](producer-prompt.md)。
只有实际修复并验证后才标记 resolved，忽略则标记 ignored 并说明理由：
`bin/colab-feedback update-feedback-status --asset-key 'asset:<id>' --feedback-id '<id>' --expected-revision '<id>=0' --status resolved --reason '修复及验证依据'`。

反馈采集默认关闭。只有用户明确同意把任务片段及此前三段用户 query 上传给 Skill owner，
才执行 `bin/colab-feedback configure --enable --consent-upload --install-codex-hooks`。
宿主仍需信任 hook；未信任时不采集，不影响正常使用。
用户另行同意使用本机模型额度做后台评价时，加 `--analysis enabled`；该分析不创建持久化聊天。
关闭使用 `bin/colab-feedback configure --disable --install-codex-hooks`。
不要把反馈评价作为用户主任务的执行步骤。

## 查询与处理接口

```text
colab-feedback list-assets [--from RFC3339] [--to RFC3339]
  [--status all|unresolved|resolved|ignored]
  [--rating all|positive|negative|unrated]
  [--negative-tag TEXT ...] [--tag-match any|all]
  [--cursor CURSOR] [--limit N]

colab-feedback list-feedbacks --asset-key KEY [相同筛选参数]
  [--feedback-id UUID] [--include FIELDS] [--exclude FIELDS]

colab-feedback update-feedback-status --asset-key KEY
  --feedback-id UUID ... --expected-revision UUID=REVISION ...
  --status resolved|ignored|unresolved --reason TEXT
  [--resolution-ref REF ...]
```

- `asset-key`：清单返回的稳定资产 key；不按 Channel 分组。
- `from/to`：采集时间范围 `[from,to)`，带时区的 RFC3339 时间；省略不限制。
- `status/rating`：默认 `all`。`unrated` 表示无有效评价，不等于点踩。
- `negative-tag`：可重复，按标签文字精确匹配。`tag-match` 默认 `any`；`all` 要求全部标签命中。
- `cursor`：上一页的 `nextCursor`，沿用同一筛选条件；`limit` 默认20，范围1至100。
- `include/exclude`：逗号分隔的 `metadata,rating,tags,taskOutcome,taskTrajectory,comment`。默认前四项；先 include 再 exclude。`comment` 是完整 Markdown，包括 YAML 与自由说明。
- `feedback-id`：清单查询可限定一条；状态更新可重复，最多100条，必须属于同一资产。
- `expected-revision`：每条 feedback 都传清单返回的 `statusRevision`；并发变更会整批拒绝，重新读取后再决策。
- `reason`：说明实际修复及验证、忽略理由或重开原因；不能把“已阅读”写成 resolved。
- `resolution-ref`：可重复，附修复、发布或验证依据的引用。

`list-assets` 返回 `items(assetKey,name,stats)`、`asOf`、`nextCursor`。stats 包括全期 `totalFeedbacks`、筛选命中 `matchingFeedbacks`；`ratingCounts` 的 `positive/negative/unrated` 与 `statusCounts` 的 `resolved/unresolved/ignored` 都在当前筛选范围内统计。包含零反馈资产。

`list-feedbacks` 返回 `items`、`totalMatching`、`nextCursor`。每项始终有 `feedbackId/assetKey/status/statusRevision/analysisStatus/sessionRef`，其他内容按 include/exclude 选择。`update-feedback-status` 返回 `assetKey/updatedCount/items(feedbackId,status,statusRevision)`。原始对话使用 `sessionRef` 交给现有 Session Reader；该引用只覆盖上报片段及前三 query。
