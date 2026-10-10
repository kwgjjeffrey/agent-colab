"""Validate the Desktop-bundled binary without touching any real user task content."""
import json, pathlib, sqlite3, subprocess, time
ROOT=pathlib.Path(__file__).resolve().parent
HOME=pathlib.Path.home() / '.codex'
BINARY='/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex'
def ids():
    db=sqlite3.connect(f'file:{HOME / "state_5.sqlite"}?mode=ro',uri=True)
    result={row[0] for row in db.execute('select id from threads')};db.close();return result
def rollouts():
    return set((HOME/'sessions').rglob('rollout-*.jsonl'))
before_ids,before_files=ids(),rollouts()
prompt='评价合成测试：用户要求读取帮助；目标 Agent Colab Skill 一次命令就返回帮助且任务完成。不要使用工具，只返回 Markdown，其中 yaml 代码块含 rating: positive 和 taskOutcome: completed，并给一个带 evidence 的 positiveTags。'
with (ROOT/'ephemeral.local.log').open('w') as log:
    result=subprocess.run([BINARY,'exec','--ephemeral','--ignore-user-config','--disable','hooks','--disable','shell_tool','--disable','multi_agent','--skip-git-repo-check','--sandbox','read-only','--output-last-message',str(ROOT/'analysis.md'),'-'],input=prompt,text=True,stdout=log,stderr=log,timeout=180,cwd=ROOT)
new_ids=ids()-before_ids;new_files=rollouts()-before_files
summary={'binaryVersion':subprocess.check_output([BINARY,'--version'],text=True).strip(),'exitCode':result.returncode,'newThreadRows':len(new_ids),'newRolloutFiles':len(new_files),'markdownReturned':(ROOT/'analysis.md').exists()}
(ROOT/'ephemeral-summary.local.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
print(json.dumps(summary))
assert result.returncode==0 and not new_ids and not new_files and summary['markdownReturned']
