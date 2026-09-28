// Cache only sanitized markup, never live nodes, handlers, or profile-specific
// enhancements. Bound both entry count and retained UTF-16 character storage.
export function createMarkupCache(render, maxEntries=256, maxChars=1024*1024) {
  const entries=new Map();let chars=0;
  return {
    clear(){entries.clear();chars=0;},
    render(text,breaks=false){
      const key=(breaks?'1:':'0:')+text;
      if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;}
      const value=render(text,breaks),size=key.length+value.length;
      if(size<=maxChars){
        while(entries.size && (entries.size>=maxEntries || chars+size>maxChars)){
          const [oldKey,oldValue]=entries.entries().next().value;
          entries.delete(oldKey);chars-=oldKey.length+oldValue.length;
        }
        entries.set(key,value);chars+=size;
      }
      return value;
    },
  };
}
