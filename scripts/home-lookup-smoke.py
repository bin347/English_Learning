"""Check home lookup routing with an isolated local server. Run npm run build first."""
import os
from pathlib import Path
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
server_code = """import {startServer} from './server/index.mjs';
const server=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'});
console.log(server.url);"""
with tempfile.TemporaryDirectory(prefix='shiju-home-test-') as data_dir:
    env = os.environ.copy()
    env['SHIJU_TEST_DATA'] = data_dir
    process = subprocess.Popen(['node','--input-type=module','-e',server_code],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        base = process.stdout.readline().strip()
        assert base.startswith('http://127.0.0.1:'), base
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page(viewport={'width':1100,'height':760})
            translations = []
            def translate(route):
                translations.append(route.request.post_data_json['text'])
                route.fulfill(json={'provider':'dictionary','translation':'zzofflineword：词典未收录'} if translations[-1] == 'zzofflineword' else {'provider':'bing','translation':'模拟翻译'})
            page.route('**/api/translate',translate)
            page.goto(base,wait_until='networkidle')
            section=page.locator('section').filter(has=page.get_by_role('heading',name='日常查词与翻译'))
            entry=section.get_by_label('日常查译文本')
            entry.fill('study')
            section.get_by_role('button',name='查询 / 翻译').click()
            expect(section.get_by_text('n. 学习',exact=False)).to_be_visible()
            expect(section.get_by_text('vt. 学习',exact=False)).to_be_visible()
            expect(section.get_by_text('vi. 学习',exact=False)).to_be_visible()
            assert translations==[], translations
            page.screenshot(path=str(Path(data_dir)/'home.png'))
            page.locator('nav').get_by_role('button',name='书架',exact=True).click()
            page.locator('nav').get_by_role('button',name='首页',exact=True).click()
            expect(entry).to_have_value('')
            expect(section.get_by_text('n. 学习',exact=False)).to_have_count(0)
            entry.fill('Study hard.')
            expect(section.get_by_text('n. 学习',exact=False)).to_have_count(0)
            section.get_by_role('button',name='查询 / 翻译').click()
            expect(section.get_by_text('模拟翻译')).to_be_visible()
            assert translations==['Study hard.'], translations
            entry.fill('zznotaword')
            section.get_by_role('button',name='查询 / 翻译').click()
            expect(section.get_by_text('本地词典未收录',exact=False)).to_be_visible()
            expect(section.get_by_text('模拟翻译')).to_be_visible()
            assert translations==['Study hard.','zznotaword'], translations
            entry.fill('zzofflineword')
            section.get_by_role('button',name='查询 / 翻译').click()
            expect(section.get_by_text('本地词典未收录，在线翻译暂不可用。')).to_be_visible()
            browser.close()
        print('Home dictionary lookup, sentence translation and missing-word fallback passed.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
