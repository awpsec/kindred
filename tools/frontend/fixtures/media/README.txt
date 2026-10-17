Generated local test patterns; no client or third-party media.
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=10 -t 2 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart recording.mp4
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=2 -t 1 -loop 0 loop.gif
ffmpeg -f lavfi -i testsrc2=size=640x360:rate=1 -frames:v 1 screenshot.png
