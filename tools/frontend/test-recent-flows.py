#!/usr/bin/env python3
"""Run recent feature regressions serially against disposable local fixtures.

Requires Playwright browsers and KINDRED_PLAYWRIGHT_MODULE when Playwright is not
installed in this checkout. No installed app, live provider, or release is touched.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import subprocess
import time

TESTS = '''artifact-studio workspace-artifacts workspace-artifact-chat
render-motion-continuity character-morphs character-faces artifact-collaboration artifact-fonts artifact-policy artifact-rendering word-layout artifacts shards artifact-window-drag
pinned-order connector-compact connector-stacks connector-stack-formation connector-stack-accessibility
connector-edit-workflows connector-disclosure-motion assigned-group-activity
sidebar-quiet-routing group-sequences group-presentation group-command-waits
group-description collaboration-notifications collaboration-pins account-window-polish
account-document-polish workflow-panels workflow-polish decisions-schedules
decision-receipts floating-composer floating-composer-read composer-overflow
preview-draft-layout channel-mentions mention-contrast unread-opening archived-settings
paste-images chat-drop-and-bot-section chart-inspection visual-panels
settings-responsiveness chat-history'''.split()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('tests', nargs='*', help='Optional subset of test names')
    parser.add_argument('--output', type=Path, default=Path('test-results/recent-flows'))
    parser.add_argument('--timeout', type=int, default=180)
    args = parser.parse_args()
    selected = args.tests or TESTS
    if any(name not in TESTS for name in selected):
        parser.error('Unknown test name')
    root = Path(__file__).resolve().parents[2]
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    results = []
    # Keep memory and compositor load bounded: animation checks need a responsive
    # browser, and the developer machine may also host unrelated virtual machines.
    for name in selected:
        folder = output / name
        folder.mkdir(exist_ok=True)
        env = dict(os.environ, WEBKIT='1', KINDRED_TEST_ARTIFACTS=str(folder))
        started = time.monotonic()
        with (folder / 'run.log').open('w') as log:
            process = subprocess.Popen(
                ['node', str(root / 'tools/frontend' / f'test-{name}.cjs')],
                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT,
                start_new_session=True,
            )
            try:
                code = process.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                code = 124
            except KeyboardInterrupt:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait()
                raise
        result = dict(test=name, code=code, seconds=round(time.monotonic()-started, 1))
        results.append(result)
        (output / 'results.json').write_text(json.dumps(results, indent=2)+'\n')
        print(json.dumps(result), flush=True)
    return int(any(result['code'] for result in results))


if __name__ == '__main__':
    raise SystemExit(main())
