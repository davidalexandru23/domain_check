const murmurhash3_32_gc = (key: string | Buffer, seed: number) => {
  let remainder, bytes, h1, h1b, c1, c2, k1, i;
  remainder = key.length & 3;
  bytes = key.length - remainder;
  h1 = seed;
  c1 = 0xcc9e2d51;
  c2 = 0x1b873593;
  i = 0;
  
  const buf = typeof key === "string" ? Buffer.from(key) : key;
  while (i < bytes) {
    k1 = ((buf[i] & 0xff)) | ((buf[i + 1] & 0xff) << 8) | ((buf[i + 2] & 0xff) << 16) | ((buf[i + 3] & 0xff) << 24);
    ++i;
    ++i;
    ++i;
    ++i;
    
    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
  }
  
  k1 = 0;
  switch (remainder) {
    case 3: k1 ^= (buf[i + 2] & 0xff) << 16;
    case 2: k1 ^= (buf[i + 1] & 0xff) << 8;
    case 1: k1 ^= (buf[i] & 0xff);
    
    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
    h1 ^= k1;
  }
  
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
};
const getFaviconHash = async (url: string) => {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const b64 = buffer.toString("base64");
    const chunked = b64.match(/.{1,76}/g)?.join("\n") + "\n";
    const hash = murmurhash3_32_gc(chunked, 0);
    return String(hash | 0);
};

(async () => {
    console.log(await getFaviconHash("https://github.com/favicon.ico"));
})();
