#!/bin/sh
set -eu
cd /source
for backend in cpu vulkan; do
  enabled=OFF
  if [ "$backend" = vulkan ]; then enabled=ON; fi
  cmake -S . -B "/build/$backend" -G Ninja \
    -DCMAKE_TOOLCHAIN_FILE=/deps/mingw-toolchain.cmake \
    -DCMAKE_BUILD_TYPE=Release -DWHISPER_SOURCE=/deps/whisper \
    -DGGML_VULKAN="$enabled" -DGGML_CCACHE=OFF \
    -DVulkan_INCLUDE_DIR=/deps/vulkan/include \
    -DVulkan_LIBRARY=/deps/libvulkan-1.a -DVulkan_GLSLC_EXECUTABLE=/usr/bin/glslc \
    -DCMAKE_PREFIX_PATH=/deps/prefix -DCMAKE_CXX_FLAGS=-I/deps/prefix/include
  cmake --build "/build/$backend" --target kindred-whisper -j 2
done
mkdir -p /build/package
cp /build/cpu/kindred-whisper.exe /build/package/whisper-cpu.exe
cp /build/vulkan/kindred-whisper.exe /build/package/whisper-vulkan.exe
x86_64-w64-mingw32-strip /build/package/whisper-cpu.exe /build/package/whisper-vulkan.exe
cp /deps/whisper/LICENSE /build/package/WHISPER-LICENSE.txt
cp /deps/vulkan/LICENSE.md /build/package/VULKAN-HEADERS-LICENSE.txt
cp /deps/spirv/LICENSE /build/package/SPIRV-HEADERS-LICENSE.txt
cp /usr/share/doc/mingw-w64-common/copyright /build/package/MINGW-RUNTIME-LICENSE.txt
cp /usr/share/doc/gcc-mingw-w64-x86-64-posix-runtime/copyright /build/package/GCC-RUNTIME-LICENSE.txt
python3 /source/package-runtime.py
