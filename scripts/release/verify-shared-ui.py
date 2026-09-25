"""Compare exact release commits for UI modules shared by client and server.

Read-only: source parity is necessary, not authorization to publish or deploy.
Native-only pages and intentionally separate character assets are excluded.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

SHARED = ('ui/app-policy.txt', 'ui/artifact-frame-policy.txt', 'ui/artifact-frame.html', 'ui/reading-size.js', 'ui/profiles.js', 'ui/updates.js', 'ui/fonts.css', 'ui/fonts/InterVariable.woff2', 'ui/fonts/InterVariable-Italic.woff2', 'ui/fonts/LiberationMono-Regular.ttf', 'ui/fonts/LiberationMono-Bold.ttf', 'ui/fonts/LiberationMono-Italic.ttf', 'ui/fonts/LiberationMono-BoldItalic.ttf', 'ui/app.js', 'ui/style.css', 'ui/composer-text.js', 'ui/artifacts.js', 'ui/workspace-artifacts.js', 'ui/settings-header-art.js',
          'ui/vendor.js', 'ui/visual-panels.js', 'ui/decision-receipts.js', 'ui/group-activity.js', 'ui/computer-pointer.js', 'ui/document-preview.js', 'ui/document-worker.js', 'ui/profile-home.html',
          'ui/profile-home.css', 'ui/profile-home.js', 'ui/bundled-dialog.css')

def verify(desktop, server, desktop_source, server_source):
    for source in (desktop_source, server_source):
        if not re.fullmatch(r'[0-9a-f]{40}', source):
            raise ValueError('Exact desktop and server source commits are required')
    hashes, mismatches = {}, []
    for name in SHARED:
        values = []
        for repo, source in ((desktop, desktop_source), (server, server_source)):
            result = subprocess.run(['git', '-C', str(repo), 'show', source + ':' + name], capture_output=True)
            if result.returncode:
                raise ValueError(f'Cannot read {name} at {source} in {repo}')
            values.append(hashlib.sha256(result.stdout).hexdigest())
        if values[0] != values[1]:
            mismatches.append(name)
        hashes[name] = values[0]
    if mismatches:
        raise ValueError('Desktop/server UI source mismatch: ' + ', '.join(mismatches))
    return {'passed': True, 'desktop_source': desktop_source, 'server_source': server_source, 'sha256': hashes}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--desktop', type=Path, required=True)
    parser.add_argument('--server', type=Path, required=True)
    parser.add_argument('--desktop-source', required=True)
    parser.add_argument('--server-source', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.desktop, args.server, args.desktop_source, args.server_source), indent=2))
    except (ValueError, OSError) as error:
        raise SystemExit('Release blocked: ' + str(error))

if __name__ == '__main__':
    main()
