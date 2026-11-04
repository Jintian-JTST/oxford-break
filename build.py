#!/usr/bin/env python3
"""Assemble dist/oxford-break.html (Artifact body) and docs/index.html (standalone page for GitHub Pages) from src/ + data/ ."""
import os
r=os.path.dirname(os.path.abspath(__file__))
rd=lambda p:open(os.path.join(r,p),encoding='utf8').read()
def wr(p,s):
    os.makedirs(os.path.dirname(os.path.join(r,p)),exist_ok=True)
    open(os.path.join(r,p),'w',encoding='utf8').write(s)
game=''.join(rd('src/'+f) for f in ('world.js','labels.js','play.js','heli.js','main.js'))
wr('dist/game_all.js',game)
html=rd('src/head.html').replace('/*DATA*/',rd('data/game_data.json')).replace('/*GAME*/',game)
wr('dist/oxford-break.html',html)
# The Artifact host supplies the document skeleton; a plain web page needs its own.
page=('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
      '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
      +html+'\n</body>\n</html>\n')
wr('docs/index.html',page)
print('built dist/oxford-break.html',len(html)//1024,'KB; docs/index.html')
