FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends cmake ninja-build make g++ glslc gcc-mingw-w64-x86-64-posix g++-mingw-w64-x86-64-posix binutils-mingw-w64-x86-64 mingw-w64-tools ca-certificates curl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /deps
RUN curl -fL https://codeload.github.com/KhronosGroup/Vulkan-Headers/tar.gz/ee2ec5fd83dafce291024683b50dc89219333076 -o vulkan.tar.gz && mkdir vulkan && tar -xzf vulkan.tar.gz -C vulkan --strip-components=1
RUN curl -fL https://codeload.github.com/KhronosGroup/SPIRV-Headers/tar.gz/04fd3caa1e8267e4d95c806cad901181728e1006 -o spirv.tar.gz && mkdir spirv && tar -xzf spirv.tar.gz -C spirv --strip-components=1 && cmake -S spirv -B spirv-build -DCMAKE_INSTALL_PREFIX=/deps/prefix && cmake --install spirv-build
RUN curl -fL https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/371b5a7561823ab2bb32142d2751e35e7534727b -o whisper.tar.gz && mkdir whisper && tar -xzf whisper.tar.gz -C whisper --strip-components=1
COPY mingw-toolchain.cmake /deps/mingw-toolchain.cmake
COPY make-vulkan-import.py /deps/make-vulkan-import.py
RUN python3 /deps/make-vulkan-import.py && x86_64-w64-mingw32-dlltool -d /deps/vulkan.def -l /deps/libvulkan-1.a
