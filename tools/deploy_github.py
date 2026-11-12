# -*- coding: utf-8 -*-
"""
把三清观部署到 GitHub（零第三方依赖，只用 urllib + GitHub REST API）。

  main      分支 = 完整项目源码 + 文档 + 部署配置
  gh-pages  分支 = public/ 静态预览（GitHub Pages 自动发布，进单人静修模式）

用法：
  GITHUB_TOKEN=xxxx python tools/deploy_github.py
  GITHUB_REPO=sanqing-guan GITHUB_TOKEN=xxxx python tools/deploy_github.py

token 只从环境变量读，不写进任何项目文件、不打印、不落盘。
"""
import os
import sys
import json
import time
import base64
import ssl
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

ROOT = Path(__file__).resolve().parent.parent
TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
REPO = os.environ.get('GITHUB_REPO', 'sanqing-guan').strip()
API = 'https://api.github.com'
MSG_MAIN = '三清观 v1.4: 相机相对移动 / 诵读 1.1 倍 / 殿内布局重构'
MSG_PAGES = '静态预览 v1.4'

if not TOKEN:
    print('缺少 GITHUB_TOKEN 环境变量'); sys.exit(1)

# 本机代理做 TLS 中转，根证书不在 Python 信任库中；仅对 api.github.com 放行
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def req(method, path, data=None):
    url = path if path.startswith('http') else API + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {
        'Authorization': 'Bearer ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'sanqing-guan-deploy',
    }
    if body is not None:
        headers['Content-Type'] = 'application/json'
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120, context=CTX) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw or b'{}') if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw[:500]
    except Exception as e:
        return 0, str(e)


def collect(base, prefix='', skip=()):
    out = []
    for p in base.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(base).as_posix()
        if any(rel.startswith(x) for x in skip):
            continue
        if '__pycache__' in rel or rel.endswith('.pyc'):
            continue
        out.append((prefix + rel, p))
    return sorted(out)


def push_branch(owner, branch, files, message):
    """上传 blobs -> tree -> commit -> 更新 ref。文件列表为 (仓库内路径, 本地路径|None)。"""
    def upload(item):
        rel, p = item
        data = b'\n' if p is None else p.read_bytes()
        payload = {'content': base64.b64encode(data).decode(), 'encoding': 'base64'}
        last = ''
        # 本机代理偶发 502，单文件重试即可，不必整体重推
        for attempt in range(5):
            st, r = req('POST', f'/repos/{owner}/{REPO}/git/blobs', payload)
            if st in (200, 201):
                return rel, r['sha']
            last = '%s %s' % (st, str(r)[:150])
            time.sleep(1.5 * (attempt + 1))
        raise RuntimeError('blob %s: %s' % (rel, last))

    with ThreadPoolExecutor(max_workers=4) as ex:
        blobs = dict(ex.map(upload, files))
    print('  blobs:', len(blobs))

    tree = [{'path': p, 'mode': '100644', 'type': 'blob', 'sha': s} for p, s in blobs.items()]
    st, t = req('POST', f'/repos/{owner}/{REPO}/git/trees', {'tree': tree})
    if st not in (200, 201):
        raise RuntimeError('tree: %s %s' % (st, str(t)[:200]))
    st, c = req('POST', f'/repos/{owner}/{REPO}/git/commits',
                {'message': message, 'tree': t['sha']})
    if st not in (200, 201):
        raise RuntimeError('commit: %s %s' % (st, str(c)[:200]))

    st, cur = req('GET', f'/repos/{owner}/{REPO}/branches/{branch}')
    if st == 200:
        st, r = req('PATCH', f'/repos/{owner}/{REPO}/git/refs/heads/{branch}',
                    {'sha': c['sha'], 'force': True})
    else:
        st, r = req('POST', f'/repos/{owner}/{REPO}/git/refs',
                    {'ref': 'refs/heads/' + branch, 'sha': c['sha']})
    if st not in (200, 201):
        raise RuntimeError('ref %s: %s %s' % (branch, st, str(r)[:200]))
    print('  %s -> %s' % (branch, c['sha'][:10]))
    return c['sha']


def main():
    st, me = req('GET', '/user')
    if st != 200:
        print('授权失败:', st, str(me)[:200]); sys.exit(1)
    owner = me['login']
    print('GitHub 账号:', owner)

    st, repo = req('GET', f'/repos/{owner}/{REPO}')
    if st == 404:
        st, repo = req('POST', '/user/repos', {
            'name': REPO,
            'description': '三清观 · 网页 3D 多人在线静心体验（道教版线上寺庙）',
            'private': False,
            'has_issues': False,
            'has_wiki': False,
            'auto_init': False,
        })
        if st not in (200, 201):
            print('建仓失败:', st, str(repo)[:300]); sys.exit(1)
        print('已创建仓库:', repo.get('html_url'))
        time.sleep(3)
    elif st == 200:
        print('仓库已存在:', repo.get('html_url'))
    else:
        print('查询仓库失败:', st, str(repo)[:300]); sys.exit(1)

    # 空仓库无法直接使用 Git Data API，先用 Contents API 建第一个提交。
    # 否则 create-blob 会返回 409 "Git Repository is empty."
    st, br = req('GET', f'/repos/{owner}/{REPO}/branches/main')
    if st != 200:
        st, init = req('PUT', f'/repos/{owner}/{REPO}/contents/.gitkeep', {
            'message': 'init',
            'content': base64.b64encode(b'\n').decode(),
            'branch': 'main',
        })
        if st not in (200, 201):
            print('初始化 main 分支失败:', st, str(init)[:250]); sys.exit(1)
        print('已初始化 main 分支')
        time.sleep(1)

    only = os.environ.get('DEPLOY_ONLY', '').strip()

    main_files = collect(ROOT, skip=('.git', 'node_modules', '.workbuddy', 'tools/_patch'))
    pages_files = collect(ROOT / 'public') + [('.nojekyll', None)]
    print('main %d 个文件 / gh-pages %d 个文件' % (len(main_files), len(pages_files)))

    if only != 'gh-pages':
        print('推送 main ...')
        push_branch(owner, 'main', main_files, MSG_MAIN)
    if only != 'main':
        print('推送 gh-pages ...')
        push_branch(owner, 'gh-pages', pages_files, MSG_PAGES)

    # Pages 用分支模式，不依赖 Actions，推完立即可用
    src = {'source': {'branch': 'gh-pages', 'path': '/'}}
    st, p = req('POST', f'/repos/{owner}/{REPO}/pages', src)
    if st == 409:
        st, p = req('PUT', f'/repos/{owner}/{REPO}/pages', src)
    if st in (200, 201, 204):
        print('Pages 已启用:', p.get('html_url') if isinstance(p, dict) else '')
    else:
        print('Pages 状态:', st, str(p)[:200], '（可能已启用）')

    print()
    print('代码仓库 : https://github.com/%s/%s' % (owner, REPO))
    print('静态预览 : https://%s.github.io/%s/' % (owner, REPO))
    print('提示: Pages 是纯静态版（单人静修）；200 人在线需按 DEPLOY.md 部署 Node 服务。')


if __name__ == '__main__':
    main()
