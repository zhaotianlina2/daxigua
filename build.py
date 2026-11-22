# -*- coding: utf-8 -*-
"""构建《合成大西瓜》单文件成品 + 对话内嵌片段"""
import pathlib, sys

root = pathlib.Path(__file__).resolve().parent

def rd(name):
    return (root / name).read_text(encoding='utf-8')

css, game, matter, markup = rd('style.css'), rd('game.js'), rd('matter.min.js'), rd('markup.html')

for name, s in [('game.js', game), ('matter.min.js', matter), ('style.css', css)]:
    assert '</script' not in s.lower(), f'{name} 里出现了 </script>，不能直接内嵌'

fragment = (markup
            .replace('__CSS__', css)
            .replace('__MATTER__', matter)
            .replace('__GAME__', game))

page_css = """
html,body{margin:0;height:100%}
body{display:flex;align-items:center;justify-content:center;min-height:100dvh;overscroll-behavior:none;
  background:radial-gradient(900px 600px at 15% -8%,#ffe8cd 0%,rgba(255,232,205,0) 60%),
             radial-gradient(800px 600px at 108% 108%,#ffd8bd 0%,rgba(255,216,189,0) 55%),
             linear-gradient(165deg,#fff7ec,#ffe9d4 55%,#ffdfc6)}
body #daxigua-root{width:min(96vw,calc(96dvh * 0.5859),560px)}
"""

standalone = (
    '<!doctype html>\n<html lang="zh-CN">\n<head>\n'
    '<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
    '<meta name="theme-color" content="#ffcf9c">\n'
    '<title>合成大西瓜 · 超果冻版</title>\n'
    f'<style>{page_css}</style>\n'
    '</head>\n<body>\n'
    + fragment +
    '\n</body>\n</html>\n'
)

standalone_path = root / '合成大西瓜.html'
standalone_path.write_text(standalone, encoding='utf-8')

# 内嵌片段（如果调用时给了第二个参数就写到那里）
targets = [standalone_path]
if len(sys.argv) > 1:
    frag_path = pathlib.Path(sys.argv[1])
    frag_path.parent.mkdir(parents=True, exist_ok=True)
    frag_path.write_text(fragment, encoding='utf-8')
    targets.append(frag_path)

for p in targets:
    print(f'{p}  {p.stat().st_size/1024:.0f} KB')
