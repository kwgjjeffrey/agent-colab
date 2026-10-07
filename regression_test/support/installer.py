"""Run the real installer with its filesystem targets bounded to an owned test root.

Only destination constants are changed. Download/signature/extraction/activation logic
is the product implementation. Service registration is disabled by --no-restart.
"""
import json, pathlib, runpy, sys
root = pathlib.Path(sys.argv[1]).resolve()
allowed = pathlib.Path(__file__).resolve().parents[1] / '.fixtures'
if not root.is_relative_to(allowed.resolve()):
    raise SystemExit('Installer destination must be inside regression_test/.fixtures')
module = runpy.run_path(str(pathlib.Path(__file__).resolve().parents[2] / 'skills/colab/setup/colab-setup'))
state = module['main'].__globals__
state.update(ROOT=root, DISCOVERY=root/'discovery.json', UPDATE_PROGRESS=root/'update-progress.json', PENDING_SHELL_UPDATE=root/'pending-shell-update.json', DOWNLOAD_CACHE=root/'downloads')
state['TARGETS'] = {name:root/'targets'/name/'agent-colab' for name in state['TARGETS']}
state['LEGACY_TARGETS'] = {name:root/'targets'/name/'colab' for name in state['LEGACY_TARGETS']}
sys.argv = ['colab-setup', *sys.argv[2:], '--no-restart']
state['main']()
