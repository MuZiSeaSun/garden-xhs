import glob
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'font-raw')
OUT = os.path.join(ROOT, 'fonts')
os.makedirs(OUT, exist_ok=True)

charset = set()

with open(os.path.join(RAW, '3500常用字.txt'), encoding='utf-8') as f:
    for ch in f.read():
        if not ch.isspace():
            charset.add(ch)

for cp in range(0x20, 0x7F):
    charset.add(chr(cp))

charset.update(
    '，。、；：？！“”‘’（）【】《》〈〉「」『』〔〕…—～·￥％＋－×÷＝＃＠＆＊／｜＼｛｝［］＜＞　'
    '°±×÷≈≠≤≥∞㎡℃℉■□●○◆◇★☆→←↑↓↔·'
)
for cp in range(0xFF01, 0xFF5F):
    charset.add(chr(cp))

for pat in ('react-test/src/**/*', 'vue-test/src/**/*'):
    for path in glob.glob(os.path.join(ROOT, pat), recursive=True):
        if os.path.isfile(path):
            try:
                with open(path, encoding='utf-8') as f:
                    charset.update(f.read())
            except (UnicodeDecodeError, OSError):
                pass

charset_path = os.path.join(RAW, 'subset-chars.txt')
with open(charset_path, 'w', encoding='utf-8') as f:
    f.write(''.join(sorted(charset)))
print('charset chars:', len(charset))

weights = {
    'NotoSansSC-Regular.ttf': 'noto-sans-sc-400.woff2',
    'NotoSansSC-Medium.ttf': 'noto-sans-sc-500.woff2',
    'NotoSansSC-Bold.ttf': 'noto-sans-sc-700.woff2',
}

for src, out in weights.items():
    dest = os.path.join(OUT, out)
    subprocess.run(
        [
            sys.executable, '-m', 'fontTools.subset',
            os.path.join(RAW, src),
            f'--text-file={charset_path}',
            '--flavor=woff2',
            '--no-hinting',
            '--drop-tables+=DSIG',
            f'--output-file={dest}',
        ],
        check=True,
    )
    print(f'{out}: {os.path.getsize(dest)} bytes')
