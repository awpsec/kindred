"""Run with xvfb-run on Linux. Synthetic GTK window, no accounts or app data."""
import gi, json
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk, GLib
window=Gtk.Window()
window.set_default_size(600,400)
titlebar=Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL,spacing=0)
titlebar.set_size_request(-1,0)
css=Gtk.CssProvider()
css.load_from_data(b'* { min-height: 0; padding: 0; margin: 0; border: 0; }')
titlebar.get_style_context().add_provider(css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
window.set_titlebar(titlebar)
content=Gtk.DrawingArea();window.add(content)
window.show_all()
results={}
def snapshot():
 return {'title_visible':titlebar.get_visible(),'title_height':titlebar.get_allocation().height,'content_y':content.get_allocation().y,'content_height':content.get_allocation().height}
def before():
 results['before']=snapshot()
 titlebar.set_no_show_all(True);titlebar.hide()
 GLib.timeout_add(80,after)
 return False
def after():
 results['after']=snapshot()
 window.show_all()
 GLib.timeout_add(80,reshow)
 return False
def reshow():
 results['reshow']=snapshot()
 Gtk.main_quit();return False
GLib.timeout_add(80,before)
Gtk.main()
assert results['before']['title_height']==1,results
assert results['before']['content_y']-results['after']['content_y']==1,results
assert not results['after']['title_visible'] and not results['reshow']['title_visible'],results
assert window.get_titlebar() is titlebar,'Keep client-side decoration and resize behavior installed'
assert results['after']==results['reshow'],results
print(json.dumps({'passed':True,**results}))
