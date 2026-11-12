# -*- coding: utf-8 -*-
"""
用本机 IndexTTS-2 生成「标准朗读、无背景噪音」的经文诵读 mp3。
全本地、零额度、零版权风险；不依赖任何网上下载的来路不明录音。

输出：
  public/audio/scripture/qingjingjing.mp3   《太上老君说常清静经》全文
  public/audio/scripture/mantras.mp3        八大神咒连读（每段之间留停顿）

用法：
  python tools/gen_recitations.py            # 生成两个文件
  python tools/gen_recitations.py --qing     # 只生成清静经
"""
import re
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / 'tools' / '_tts_tmp'
OUT = ROOT / 'public' / 'audio' / 'scripture'
TMP.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

PY = r'F:\AI\Python311\python.exe'
ENGINE = r'F:\AI\tts2\speak_indextts2.py'
FFMPEG = r'G:\AI\bin\ffmpeg.exe'
VOICE = '解说语音v11.1'


def scripture_text():
    js = (ROOT / 'public/js/scripture.js').read_text(encoding='utf-8')
    m = re.search(r"const QINGJING_FULL = \[(.*?)\]\.join\(''\);", js, re.S)
    if not m:
        raise RuntimeError('未能从 scripture.js 提取清静经')
    qing = ''.join(re.findall(r"'([^']*)'", m.group(1)))
    m2 = re.search(r'const MANTRA_RAW = \[(.*?)\n\];', js, re.S)
    if not m2:
        raise RuntimeError('未能从 scripture.js 提取八大神咒')
    mantras = re.findall(r"\['([^']+)',\s*'([^']+)'\]", m2.group(1))
    return qing, mantras


def synth(text, label, out_mp3):
    txt = TMP / (label + '.txt')
    wav = TMP / (label + '.wav')
    txt.write_text(text, encoding='utf-8')
    cmd = [
        PY, ENGINE,
        '--text-file', str(txt),
        '--voice', VOICE,
        '--speed', '1.1',
        '--beams', '1',
        '--max-mel-tokens', '6000',
        '--out', str(wav),
    ]
    print('[TTS] %s：%d 字，开始合成…' % (label, len(text)), flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True,
                       encoding='utf-8', errors='replace', timeout=1800)
    if r.returncode != 0 or not wav.exists():
        print('[TTS] 失败:', (r.stdout or '')[-900:], (r.stderr or '')[-900:], flush=True)
        return False
    print('[TTS] wav 完成，转 mp3…', flush=True)
    r2 = subprocess.run([
        FFMPEG, '-y', '-i', str(wav),
        '-af', 'silenceremove=start_periods=1:start_silence=0.15:start_threshold=-45dB,'
               'areverse,silenceremove=start_periods=1:start_silence=0.15:start_threshold=-45dB,areverse',
        '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', '44100', '-ac', '1',
        str(out_mp3)
    ], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if not out_mp3.exists():
        # 去静音滤镜在个别版本不支持时，退回直接转码
        subprocess.run([FFMPEG, '-y', '-i', str(wav), '-codec:a', 'libmp3lame',
                        '-b:a', '64k', '-ar', '44100', '-ac', '1', str(out_mp3)],
                       capture_output=True)
    ok = out_mp3.exists() and out_mp3.stat().st_size > 10000
    print('[TTS] %s %s (%.1f MB)' % (
        label, 'OK' if ok else 'FAIL',
        out_mp3.stat().st_size / 1048576 if out_mp3.exists() else 0), flush=True)
    return ok


def main():
    qing, mantras = scripture_text()
    print('清静经 %d 字 / 八大神咒 %d 段' % (len(qing), len(mantras)), flush=True)
    if not synth(qing, 'qingjingjing', OUT / 'qingjingjing.mp3'):
        return 1
    if '--qing' in sys.argv:
        return 0
    # 八咒连读，段间用句号停顿分隔，仍是一次合成
    joined = '。'.join(name + '。' + body for name, body in mantras)
    if not synth(joined, 'mantras', OUT / 'mantras.mp3'):
        return 1
    print('DONE', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
