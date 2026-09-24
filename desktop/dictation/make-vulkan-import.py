"""Create MinGW import stubs from pinned Khronos declarations; no driver is bundled."""
from pathlib import Path
import re
source=Path('/deps/vulkan/include/vulkan/vulkan_core.h').read_text()
names=sorted(set(re.findall(r'VKAPI_CALL\s+(vk\w+)\s*\(',source)))
assert 'vkGetInstanceProcAddr' in names and len(names)>100
Path('/deps/vulkan.def').write_text('LIBRARY vulkan-1.dll\nEXPORTS\n'+'\n'.join(names)+'\n')
