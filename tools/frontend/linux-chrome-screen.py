"""Capture an isolated X11 test display, including a nested Wayland compositor."""
import json
import sys
import gi
gi.require_version('Gdk', '3.0')
from gi.repository import Gdk

window = Gdk.get_default_root_window()
pixels = Gdk.pixbuf_get_from_window(window, 0, 0, window.get_width(), window.get_height())
if sys.argv[1] == 'capture':
    pixels.savev(sys.argv[2], 'png', [], [])
else:
    data = pixels.get_pixels()
    channels = pixels.get_n_channels()
    color = bytes((251, 7, 213)) + (bytes((255,)) if channels == 4 else b'')
    offset = data.find(color * 3)
    if offset < 0:
        print('null')
    else:
        print(json.dumps({'x': (offset % pixels.get_rowstride()) // channels,
                          'y': offset // pixels.get_rowstride()}))
