#!/usr/bin/env bash
# Kindred Linux recovery. Run as your normal desktop user, not with sudo bash.
# Optional argument: the Kindred AppImage to integrate using system libraries.
set -euo pipefail
die() { printf 'Kindred setup: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) != 0 ]] || die 'Run this block as your normal desktop user. It asks for sudo only when needed.'
kindred_user=$(id -un)
kindred_client_only=0
if [[ ${1:-} == --client ]]; then
  kindred_client_only=1
  shift
fi
kindred_image=${1:-}
kindred_binary=
if [[ $kindred_image == --native ]]; then
  kindred_image=
  kindred_binary=$(readlink -f -- "${2:?Missing native Kindred path}")
  [[ -x $kindred_binary ]] || die 'The installed Kindred binary is no longer available.'
fi
[[ -r /etc/os-release ]] || die 'Cannot identify this Linux distribution.'
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) kindred_manager=apt ;;
  fedora) kindred_manager=dnf ;;
  arch|cachyos|endeavouros|manjaro) kindred_manager=pacman ;;
  *) die "Automatic dependency setup supports Ubuntu, Debian, Fedora and Arch-based distributions. See https://docs.docker.com/engine/install/ for ${PRETTY_NAME:-your distribution}." ;;
esac
[[ $(uname -m) == x86_64 ]] || die 'The current Linux Kindred packages require x86_64.'
command -v sudo >/dev/null || die 'sudo is required for dependency installation.'
command -v systemctl >/dev/null || die 'Automatic setup requires a systemd-based desktop.'
if [[ -n $kindred_image ]]; then
  kindred_image=$(readlink -f -- "$kindred_image")
  [[ -f $kindred_image ]] || die 'The AppImage is no longer at the supplied path. Download it again and pass its current path.'
fi
if [[ $kindred_client_only == 0 ]]; then
if [[ -n ${DOCKER_HOST:-} || -n ${DOCKER_CONTEXT:-} ]]; then
  die 'A custom Docker endpoint is configured. Resolve that connection first; this block will not replace it.'
fi
if command -v docker >/dev/null; then
  kindred_context=$(docker context show 2>/dev/null || true)
  if [[ -n $kindred_context && $kindred_context != default ]]; then
    timeout 15s docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 || die 'Your selected Docker context is unavailable. Start it, or select your intended local context, then retry.'
    docker compose version >/dev/null 2>&1 || die 'Install Compose for your selected Docker context, then retry.'
  fi
fi
fi
sudo -v
if [[ $kindred_manager == apt ]]; then
  sudo apt-get update
  if [[ $kindred_client_only == 0 ]]; then
  if ! command -v docker >/dev/null; then
    for kindred_pkg in docker.io docker-compose podman-docker containerd runc; do
      if dpkg-query -W -f='${Status}' "$kindred_pkg" 2>/dev/null | grep -q 'install ok installed'; then
        die "Existing $kindred_pkg needs review before installing Docker Engine. This block does not remove existing container software. See https://docs.docker.com/engine/install/$ID/"
      fi
    done
    sudo apt-get install -y ca-certificates curl
    if ! apt-cache show docker-ce >/dev/null 2>&1; then
      kindred_codename=${VERSION_CODENAME:-}
      [[ $kindred_codename =~ ^[a-z][a-z0-9-]*$ ]] || die 'No supported distribution codename was found.'
      sudo install -m 0755 -d /etc/apt/keyrings
      sudo curl --proto '=https' --tlsv1.2 -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/kindred-docker.asc
      sudo chmod a+r /etc/apt/keyrings/kindred-docker.asc
      printf 'Types: deb\nURIs: https://download.docker.com/linux/%s\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/kindred-docker.asc\n' "$ID" "$kindred_codename" "$(dpkg --print-architecture)" | sudo tee /etc/apt/sources.list.d/kindred-docker.sources >/dev/null
      sudo apt-get update
    fi
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  elif ! docker compose version >/dev/null 2>&1; then
    if apt-cache show docker-compose-plugin >/dev/null 2>&1; then
      sudo apt-get install -y docker-compose-plugin
    elif apt-cache show docker-compose-v2 >/dev/null 2>&1; then
      sudo apt-get install -y docker-compose-v2
    else
      die 'Your existing Docker installation has no Compose v2 package available. Follow its distribution-specific Compose instructions; existing packages were preserved.'
    fi
  fi
  fi
  if [[ $kindred_client_only == 1 || -n $kindred_image || -n $kindred_binary ]]; then
    sudo apt-get install -y libwebkit2gtk-4.1-0 libayatana-appindicator3-1 librsvg2-2 gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-pulseaudio gstreamer1.0-tools patchelf python3 desktop-file-utils
  fi
elif [[ $kindred_manager == dnf ]]; then
  if [[ $kindred_client_only == 0 ]]; then
  if ! command -v docker >/dev/null; then
    for kindred_pkg in podman-docker moby-engine docker docker-engine; do
      if rpm -q "$kindred_pkg" >/dev/null 2>&1; then
        die 'Existing container packages need review before Docker Engine can be installed. They were preserved.'
      fi
    done
    sudo dnf install -y dnf-plugins-core
    if ! sudo dnf repolist --enabled | grep -q docker-ce; then
      sudo dnf config-manager addrepo --from-repofile https://download.docker.com/linux/fedora/docker-ce.repo
    fi
    sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  elif ! docker compose version >/dev/null 2>&1; then
    sudo dnf install -y docker-compose-plugin
  fi
  fi
  if [[ $kindred_client_only == 1 || -n $kindred_image || -n $kindred_binary ]]; then
    sudo dnf install -y webkit2gtk4.1 gtk3 libappindicator-gtk3 librsvg2 gstreamer1 gstreamer1-plugins-base gstreamer1-plugins-good patchelf python3 desktop-file-utils
  fi
else
  # Use the distribution packages without replacing PipeWire or its Pulse API.
  # Do not refresh the package database alone (Arch partial upgrades).
  if [[ $kindred_client_only == 0 ]]; then
    if ! command -v docker >/dev/null; then
      sudo pacman -S --needed docker docker-compose
    elif ! docker compose version >/dev/null 2>&1; then
      sudo pacman -S --needed docker-compose
    fi
  fi
  if [[ $kindred_client_only == 1 || -n $kindred_image || -n $kindred_binary ]]; then
    sudo pacman -S --needed webkit2gtk-4.1 libayatana-appindicator librsvg gstreamer gst-plugins-base gst-plugins-good patchelf python desktop-file-utils
  fi
fi
if [[ $kindred_client_only == 1 || -n $kindred_image || -n $kindred_binary ]]; then
  # Validate host plugins with host libraries, not inherited AppImage overrides.
  for kindred_element in appsrc appsink audioconvert audioresample autoaudiosink pulsesink; do
    env -u LD_LIBRARY_PATH -u GST_PLUGIN_PATH -u GST_PLUGIN_PATH_1_0 -u GST_PLUGIN_SYSTEM_PATH -u GST_PLUGIN_SYSTEM_PATH_1_0 -u GST_PLUGIN_SCANNER -u GST_PLUGIN_SCANNER_1_0 -u GST_REGISTRY -u GST_REGISTRY_1_0 timeout 10s gst-inspect-1.0 "$kindred_element" >/dev/null || die "The system GStreamer plugin $kindred_element is unavailable. No launcher was changed. Check your distribution's matching GStreamer packages."
  done
fi
kindred_relogin=0
if [[ $kindred_client_only == 0 ]]; then
docker compose version
if ! timeout 15s docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
  [[ ${kindred_context:-default} == default ]] || die 'Start your selected Docker context and retry.'
  sudo systemctl enable --now docker
  sudo timeout 15s docker info --format '{{.ServerVersion}}' >/dev/null || die 'Docker still cannot start. Inspect: sudo journalctl -u docker --no-pager -n 50'
  if ! timeout 15s docker info --format '{{.ServerVersion}}' >/dev/null 2>&1; then
    getent group docker >/dev/null || sudo groupadd docker
    if id -nG | tr ' ' '\n' | grep -qx docker; then
      die 'Docker is running but this client still cannot reach it despite active docker group membership. Inspect your Docker context and socket permissions before retrying.'
    fi
    if ! id -nG "$kindred_user" | tr ' ' '\n' | grep -qx docker; then
      sudo usermod -aG docker "$kindred_user"
    fi
    kindred_relogin=1
  fi
fi
fi
if [[ -n $kindred_image || -n $kindred_binary ]]; then
  # Install a private, persistent copy. Never remove libraries from the original.
  kindred_data=${XDG_DATA_HOME:-$HOME/.local/share}
  [[ $kindred_data == /* ]] || die 'XDG_DATA_HOME must be an absolute path.'
  kindred_base="$kindred_data/kindred/linux"
  mkdir -p -- "$kindred_base"
  kindred_version=
  if [[ -n $kindred_image ]]; then
  kindred_hash=$(sha256sum -- "$kindred_image" | cut -d ' ' -f1)
  [[ $kindred_hash =~ ^[0-9a-f]{64}$ ]] || die 'Cannot fingerprint the AppImage.'
  kindred_version="$kindred_base/$kindred_hash"
  if [[ ! -f $kindred_version/ready ]]; then
    [[ ! -e $kindred_version ]] || die 'An incomplete compatibility install needs inspection. It was preserved.'
    kindred_stage=$(mktemp -d "$kindred_base/.setup.XXXXXXXX")
    cp -- "$kindred_image" "$kindred_stage/Kindred.AppImage"
    chmod u+x "$kindred_stage/Kindred.AppImage"
    (cd -- "$kindred_stage"; ./Kindred.AppImage --appimage-extract >/dev/null)
    [[ -f $kindred_stage/squashfs-root/usr/bin/kindred-desktop ]] || die 'This is not a supported Kindred AppImage.'
    cp -- "$kindred_stage/squashfs-root/usr/bin/kindred-desktop" "$kindred_stage/kindred-desktop"
    patchelf --remove-rpath "$kindred_stage/kindred-desktop"
    kindred_linkage=$(env -u LD_LIBRARY_PATH ldd "$kindred_stage/kindred-desktop")
    if grep -q 'not found' <<< "$kindred_linkage"; then
      die 'A system library is still missing; the incomplete copy was preserved for inspection.'
    fi
    printf 'system-libraries-v1\n' > "$kindred_stage/ready"
    mv -- "$kindred_stage" "$kindred_version"
  fi
  fi
  python3 - "$kindred_version" "$kindred_data" "$kindred_binary" <<'KINDRED_MENU_PY'
from pathlib import Path
import os, shlex, shutil, sys
version, data = map(Path, sys.argv[1:3])
native = Path(sys.argv[3]) if sys.argv[3] else None
if any(ord(c) < 32 for c in str(version) + str(data)):
    raise SystemExit('Control characters in installation paths are unsupported.')
appdir = version / 'squashfs-root'
if native:
    appdir = native.parent.parent.parent
icon_source = appdir / 'usr/share/icons/hicolor/512x512/apps/kindred-desktop.png'
if not icon_source.is_file():
    raise SystemExit('The AppImage icon is missing; no menu entry was changed.')
icon = data / 'icons/hicolor/512x512/apps/kindred-desktop.png'
icon.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(icon_source, icon)
launcher = data / 'kindred/bin/kindred'
launcher.parent.mkdir(parents=True, exist_ok=True)
launch = '#!/bin/sh\n'
launch += '# Use system GStreamer libraries, plugins and scanner together.\n'
launch += 'unset GST_PLUGIN_PATH GST_PLUGIN_PATH_1_0 GST_PLUGIN_SYSTEM_PATH GST_PLUGIN_SYSTEM_PATH_1_0 GST_PLUGIN_SCANNER GST_PLUGIN_SCANNER_1_0 GST_REGISTRY GST_REGISTRY_1_0\n'
if native:
    if appdir != Path('/') and (appdir / 'usr/lib/Kindred/standalone.zip').is_file():
        launch += 'export APPDIR=' + shlex.quote(str(appdir)) + '\n'
    launch += 'exec ' + shlex.quote(str(native)) + ' "$@"\n'
else:
    launch += '# Use the installed system GTK/WebKit stack.\nunset LD_LIBRARY_PATH GTK_PATH GIO_MODULE_DIR GSETTINGS_SCHEMA_DIR GDK_PIXBUF_MODULE_FILE\n'
    launch += 'export APPDIR=' + shlex.quote(str(appdir)) + '\n'
    launch += 'export APPIMAGE=' + shlex.quote(str(version / 'Kindred.AppImage')) + '\n'
    launch += 'exec ' + shlex.quote(str(version / 'kindred-desktop')) + ' "$@"\n'
launcher.write_text(launch, encoding='utf-8')
launcher.chmod(0o755)
def entry_value(s):
    return s.replace('\\', '\\\\')
def exec_arg(s):
    quoted = ''.join('\\' + c if c in '\\"`$' else c for c in s)
    return '"' + entry_value(quoted).replace('%', '%%') + '"'
applications = data / 'applications'
applications.mkdir(parents=True, exist_ok=True)
desktop = applications / 'Kindred.desktop'
desktop.write_text('[Desktop Entry]\nType=Application\nName=Kindred\nComment=Personal AI teammates\n'
    + 'Exec=/usr/bin/env ' + exec_arg(str(launcher)) + '\nIcon=' + entry_value(str(icon))
    + '\nTerminal=false\nCategories=Utility;\nStartupWMClass=kindred-desktop\n', encoding='utf-8')
desktop.chmod(0o644)
print('Installed Kindred menu entry and logo:', desktop)
print('Original AppImage and existing Kindred accounts were preserved.')
KINDRED_MENU_PY
  update-desktop-database "$kindred_data/applications" || true
fi
if [[ $kindred_client_only == 1 ]]; then
  printf '\nKindred client dependencies and audio plugins are ready. Fully quit and reopen Kindred from Applications.\n'
  printf 'If you use a custom AppRun, keep its GStreamer library, plugin and scanner paths on the same stack.\n'
elif [[ $kindred_relogin == 1 ]]; then
  printf '\nDependencies installed. SIGN OUT of your desktop completely, then SIGN IN again.\n'
  printf 'Then open Kindred from Applications and choose Set up standalone.\n'
  printf 'Opening a new terminal or running newgrp does not refresh an already-running desktop app.\n'
else
  printf '\nDocker is accessible from this session. Fully quit and reopen Kindred, then choose Set up standalone.\n'
fi
