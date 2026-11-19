import struct, base64, sys
d = bytearray(open('hello.exe', 'rb').read())
e_lfanew = struct.unpack_from('<I', d, 0x3C)[0]
fh = e_lfanew + 4
struct.pack_into('<I', d, fh + 4, 0x6553F100)          # TimeDateStamp: 2023-11-14 22:13:20 UTC
oh = fh + 20
cks_off = oh + 64
struct.pack_into('<I', d, cks_off, 0)
# PE checksum (same algorithm as imagehlp CheckSumMappedFile)
s = 0
for i in range(0, len(d), 2):
    w = d[i] | ((d[i + 1] << 8) if i + 1 < len(d) else 0)
    s += w
    s = (s & 0xFFFF) + (s >> 16)
s = (s & 0xFFFF) + (s >> 16)
s += len(d)
struct.pack_into('<I', d, cks_off, s)
open('hello_fixed.exe', 'wb').write(d)
print('e_lfanew', hex(e_lfanew), 'checksum', hex(s), 'size', len(d))
nsec = struct.unpack_from('<H', d, fh + 2)[0]
sohdr = struct.unpack_from('<H', d, fh + 16)[0]
st = oh + sohdr
secs = []
for i in range(nsec):
    o = st + 40 * i
    name = d[o:o+8].rstrip(b'\0').decode()
    vs, va, rs, rp = struct.unpack_from('<IIII', d, o + 8)
    ch = struct.unpack_from('<I', d, o + 36)[0]
    secs.append((name, va, vs, rp, rs))
    print(f'{name:8} VA={va:#x} VS={vs:#x} raw={rp:#x} rawsize={rs:#x} ch={ch:#x} hdr@{o:#x}')
def rva2off(r):
    for n, va, vs, rp, rs in secs:
        if va <= r < va + max(vs, rs):
            return r - va + rp
imp_rva = struct.unpack_from('<I', d, oh + 112 + 8)[0]
o = rva2off(imp_rva)
while True:
    ilt, ts, fwd, name, iat = struct.unpack_from('<IIIII', d, o)
    if name == 0: break
    dll = d[rva2off(name):].split(b'\0')[0].decode()
    print('DLL', dll, 'ILT', hex(ilt), 'IAT', hex(iat), 'desc@', hex(o))
    p = rva2off(ilt); k = 0
    while True:
        e = struct.unpack_from('<Q', d, p)[0]
        if e == 0: break
        hn = rva2off(e)
        hint = struct.unpack_from('<H', d, hn)[0]
        fn = d[hn+2:].split(b'\0')[0].decode()
        print('   ', fn, 'hint', hint, 'IAT slot RVA', hex(iat + 8*k), 'VA', hex(0x140000000 + iat + 8*k))
        p += 8; k += 1
    o += 20
open('hello.b64', 'w').write(base64.b64encode(bytes(d)).decode())
