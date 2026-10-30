"""Record a compiled unsigned simulator app and its embedded voice extension."""
import argparse
import hashlib
import json
import plistlib
from pathlib import Path


def receipt(app, source, version):
    app = Path(app)
    output = {'source_commit': source, 'version': version,
              'unsigned_simulator_only': True, 'physical_device_proof': False,
              'live_audio_proof': False, 'products': []}
    for bundle, identifier in (
        (app, 'dev.kindred.companion'),
        (app / 'PlugIns/KindredVoiceActivity.appex', 'dev.kindred.companion.voice'),
    ):
        info = plistlib.loads((bundle / 'Info.plist').read_bytes())
        assert info['CFBundleIdentifier'] == identifier, 'Unexpected native bundle identifier'
        assert info['CFBundleShortVersionString'] == version, 'Native version differs from release'
        assert info['DTPlatformName'] == 'iphonesimulator', 'This receipt accepts simulator products only'
        executable = bundle / info['CFBundleExecutable']
        raw = executable.read_bytes()
        assert len(raw) > 4096 and raw[:4] in (b'\xcf\xfa\xed\xfe', b'\xce\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'), 'Missing compiled Mach-O executable'
        assert (bundle / 'BotToolbarArtwork.json').is_file(), 'Bundled avatar artwork missing'
        if bundle == app:
            assert info['KindredSourceRevision'] == source, 'Native source stamp differs'
            assert info['NSSupportsLiveActivities'] is True, 'Live Activities capability missing'
        else:
            assert info['NSExtension']['NSExtensionPointIdentifier'] == 'com.apple.widgetkit-extension', 'Incorrect extension product'
        output['products'].append({
            'bundle': bundle.name, 'identifier': identifier,
            'version': info['CFBundleShortVersionString'], 'build': info['CFBundleVersion'],
            'sdk': info['DTSDKName'], 'platform': info['DTPlatformName'],
            'executable': executable.name, 'bytes': len(raw),
            'sha256': hashlib.sha256(raw).hexdigest(),
        })
    output['compiled_app_and_voice_extension'] = True
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('app')
    parser.add_argument('--source', required=True)
    parser.add_argument('--version', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    Path(args.output).write_text(json.dumps(receipt(args.app, args.source, args.version), indent=2) + '\n')
