"""Keep public release descriptions brief; detailed evidence belongs in assets."""
def render(version, notes, kind):
    heading = '# Kindred ' + version
    if notes.splitlines()[0] != heading:
        raise ValueError('Release notes must match this version')
    changes = notes.partition('\n')[2].strip()
    if not changes or len(changes.split()) > 200:
        raise ValueError('Describe the user-visible changes in 200 words or fewer')
    app = 'https://github.com/awpsec/kindred'
    server = 'https://github.com/awpsec/kindred-server'
    if kind == 'desktop':
        install = f'Download the installer for your computer below. [Installation help and signing status]({app}/blob/v{version}/docs/INSTALL.md).'
        related = f'[Matching server]({server}/releases/tag/v{version})'
    elif kind == 'server':
        install = f'Download the Server Bundle below. [Hosting and upgrades]({server}/blob/v{version}/docs/HOSTING.md).'
        related = f'[Desktop app]({app}/releases/tag/v{version})'
    else:
        raise ValueError('Unknown release kind')
    return f'{changes}\n\n{install}\n\n{related} · Checksums and verification details are attached.\n'
