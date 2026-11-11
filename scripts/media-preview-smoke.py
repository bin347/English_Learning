"""Exercise media preview with simulated providers. Run npm run build first."""
import os
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
code = """import {startServer} from './server/index.mjs';
const s=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'});
console.log(s.url);"""
with tempfile.TemporaryDirectory(prefix='shiju-media-') as directory:
    env=os.environ.copy()
    env['SHIJU_TEST_DATA']=directory
    process=subprocess.Popen(['node','--input-type=module','-e',code],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    try:
        url=process.stdout.readline().strip()
        assert url.startswith('http://127.0.0.1:')
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1100,'height':760})
            page.route('**/api/media/search?*',lambda r:r.fulfill(json={'results':[{'id':'1','title':'Example','type':'tv','provider':'cms'},{'id':'2','title':'Missing season','type':'tv','provider':'cms'}]}))
            def resolve(route):
                if route.request.post_data_json['id']=='1':
                    route.fulfill(json={'title':'无耻之徒(英版) 第一季','year':2004,'episodes':[{'title':'第1集','url':'https://example.com/a.mp4','direct':True},{'title':'第2集','url':'https://example.com/b.mp4','direct':True}],'subtitles':[]})
                else:
                    route.fulfill(json={'title':'Missing season','year':2024,'episodes':[{'title':'Episode 1','url':'https://example.com/c.mp4','direct':True}],'subtitles':[]})
            page.route('**/api/media/resolve',resolve)
            lookups=[]
            def search(route):
                data=route.request.post_data_json
                lookups.append(data)
                sources=[{'provider':'subtitledb','id':'1','title':'Example','label':'S01E01','exact':True},
                         {'provider':'gestdown','id':'fallback','title':'Example','label':'S01E01','exact':True}] if data['episode']==1 else []
                route.fulfill(json={'sources':sources,'warnings':[],'resolvedTitle':'Example','resolvedYear':2024})
            def download(route):
                if route.request.post_data_json['provider']=='subtitledb':
                    route.fulfill(status=503,json={'error':'offline'})
                else:
                    route.fulfill(json={'subtitle':'1\n00:00:01,000 --> 00:00:03,000\nWonderful garden.'})
            ai_requests=[]
            def preview_ai(route):
                ai_requests.append(route.request.post_data_json)
                if route.request.post_data_json['dialogue']:
                    route.fulfill(status=503,json={'error':'offline'})
                else:
                    route.fulfill(json={'grounded':False,'words':[{'word':'family','meaning':'家庭','context':'','reason':'题材词'}]})
            page.route('**/api/media/subtitle-search',search)
            page.route('**/api/media/subtitle-download',download)
            page.route('**/api/media/ai-preview',preview_ai)
            page.route('**/api/media/vocabulary',lambda route:route.fulfill(json={'subtitleCount':1,'dialogue':[{'id':0,'text':'Wonderful garden.'}],'words':[{'word':'wonderful','meaning':'美妙的','reason':''}]+[{'word':f'example{i}','meaning':'示例','reason':''} for i in range(34)]}))
            page.request.put(url+'/api/settings',data={'apiBase':'http://127.0.0.1:1','model':'test','apiUses':['media']})
            page.goto(url,wait_until='networkidle')
            page.locator('nav').get_by_role('button',name='影视').click()
            page.get_by_placeholder('输入片名，搜索已配置的数据源').fill('Example')
            page.get_by_role('button',name='搜索',exact=True).click()
            results=page.locator('.media-results')
            expect(results).to_have_attribute('open','')
            page.get_by_role('button',name='选择播放').first.click()
            preview=page.locator('.media-preview')
            expect(preview).to_be_visible()
            expect(results).not_to_have_attribute('open','')
            assert page.locator('input[accept*=".srt"]').count()==0
            assert preview.locator('input').count()==0
            expect(preview.get_by_text('预习依据：Gestdown')).to_be_visible()
            expect(preview.get_by_text('识别到原片名 Example（2024），请核对版本。')).to_be_visible()
            expect(preview.get_by_text('wonderful',exact=True)).to_be_visible()
            quantity=preview.get_by_label('预习数量')
            expect(quantity).to_have_value('20')
            assert quantity.locator('option').all_text_contents()==['15 词','20 词','30 词']
            assert preview.locator(':scope > .row').count()==20
            quantity.select_option('15'); assert preview.locator(':scope > .row').count()==15
            quantity.select_option('30'); assert preview.locator(':scope > .row').count()==30
            assert lookups[0]['title']=='无耻之徒(英版)' and lookups[0]['season']==1 and lookups[0]['episode']==1 and lookups[0]['year']==2004
            preview.get_by_role('button',name='重新搜索字幕').click()
            expect(preview.get_by_text('预习依据：Gestdown')).to_be_visible()
            assert lookups[-1]==lookups[0]
            preview.get_by_role('button',name='AI 精选',exact=True).click()
            expect(preview.get_by_role('status')).to_contain_text('已显示本地筛词')
            assert ai_requests[-1]['limit']==30
            expect(preview.get_by_text('wonderful',exact=True)).to_be_visible()
            page.screenshot(path=str(Path(directory)/'media-preview.png'),full_page=True)
            page.get_by_label('选择剧集 / 线路').select_option(index=1)
            expect(preview.get_by_text('预习依据：Gestdown')).to_have_count(0)
            expect(preview.get_by_role('status')).to_contain_text('未找到可用的英文字幕')
            assert lookups[-1]['episode']==2
            preview.get_by_role('button',name='AI 题材预热',exact=True).click()
            expect(preview.get_by_role('status')).to_contain_text('未验证在影片中出现')
            expect(preview.get_by_text('family',exact=True)).to_be_visible()
            page.locator('.media-search-settings > summary').click()
            results.locator('summary').click()
            expect(results).to_have_attribute('open','')
            page.get_by_role('button',name='选择播放').nth(1).click()
            expect(preview.get_by_role('status')).to_contain_text('未提供可识别的片名、季数或集数')
            assert len(lookups)==3
            assert preview.locator('input').count()==0
            page.locator('.media-search-settings > summary').click()
            page.get_by_role('button',name='搜索',exact=True).click()
            expect(results).to_have_attribute('open','')
            browser.close()
        print('Subtitle selection, local preview and episode isolation passed.')
    finally:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait(timeout=10)
