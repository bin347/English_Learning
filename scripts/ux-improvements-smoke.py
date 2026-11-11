"""Check the agreed UX changes using an isolated database and simulated online services."""
import os
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
code="import {startServer} from './server/index.mjs'; const s=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'}); console.log(s.url);"
with tempfile.TemporaryDirectory(prefix='shiju-ux-') as directory:
    env=os.environ.copy(); env['SHIJU_TEST_DATA']=directory
    process=subprocess.Popen(['node','--input-type=module','-e',code],cwd=root,env=env,stdout=subprocess.PIPE,text=True)
    try:
        url=process.stdout.readline().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1100,'height':760})
            errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
            output=Path(os.environ.get('SHIJU_UX_SCREENSHOTS',directory)); output.mkdir(parents=True,exist_ok=True)
            def nav(name): page.locator('nav').get_by_role('button',name=name,exact=False).click()
            page.request.post(url+'/api/books',data={'title':'UX Sample','format':'txt','text':'A quiet garden grows beside the library.'})
            page.goto(url,wait_until='networkidle')
            expect(page.get_by_role('button',name='开始阅读',exact=True)).to_be_in_viewport()
            expect(page.get_by_text('上次读到',exact=True)).to_have_count(0)
            expect(page.get_by_text('今天暂无待复习单词。')).to_be_visible()
            page.screenshot(path=str(output/'home.png'))
            nav('书架');page.locator('.book').filter(has_text='UX Sample').click()
            page.locator('.reader p').first.wait_for();nav('首页')
            expect(page.locator('.home-start')).to_contain_text('继续阅读')
            expect(page.locator('.home-start')).to_contain_text('UX Sample')
            page.reload(wait_until='networkidle')
            expect(page.locator('.home-start')).to_contain_text('UX Sample')

            nav('单词'); vocab=page.locator('.vocabulary-panel')
            expect(vocab.locator('.quiz h2')).to_be_visible()
            expect(vocab.get_by_role('button',name='提交答案',exact=True)).to_be_in_viewport()
            expect(vocab.get_by_role('progressbar')).to_have_attribute('value','0')
            vocab.get_by_role('button',name='跳过此词').click()
            expect(vocab.get_by_role('progressbar')).to_have_attribute('value','0')
            vocab.get_by_label('中文意思').fill('故意写错的答案')
            vocab.get_by_role('button',name='提交答案',exact=True).click()
            expect(vocab.get_by_role('progressbar')).to_have_attribute('value','1')
            expect(vocab.get_by_text('本轮已完成 1 词',exact=True)).to_be_visible()
            page.screenshot(path=str(output/'vocabulary.png'))
            vocab.get_by_role('button',name='我的生词本',exact=False).click()
            expect(vocab.get_by_label('生词本学习进度')).to_contain_text('生词本已学习 1 / 1 词')
            vocab.get_by_role('button',name='中文填空').click()
            nav('首页');nav('单词')
            expect(vocab.get_by_text('本轮已完成 1 词',exact=True)).to_be_visible()
            page.wait_for_timeout(600);page.reload(wait_until='networkidle');nav('单词')
            expect(vocab.get_by_text('本轮已完成 1 词',exact=True)).to_be_visible()
            vocab.get_by_label('学习状态').select_option('learning')
            expect(vocab.get_by_text('本轮已完成 0 词',exact=True)).to_be_visible()
            page.reload(wait_until='networkidle'); nav('单词')
            expect(vocab.get_by_role('progressbar')).to_have_attribute('value','1')

            page.request.post(url+'/api/books',data={'title':'UX Reader','format':'txt','text':'A quiet garden grows beside the old library.\n'*200})
            nav('书架');page.locator('.book').filter(has_text='UX Reader').click()
            page.locator('.reader p').first.wait_for()
            box=page.locator('.reader').bounding_box()
            assert box['height']>500 and box['y']+box['height']<=760,box
            def select():
                page.evaluate("""()=>{const n=document.querySelector('.reader p').firstChild,r=document.createRange();r.setStart(n,0);r.setEnd(n,3);getSelection().removeAllRanges();getSelection().addRange(r);document.querySelector('.reader').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))}""")
            select();page.get_by_role('button',name='查词',exact=True).click()
            expect(page.locator('.selection-panel')).to_be_visible()
            page.locator('.reading-content .title h1').click()
            expect(page.locator('.selection-panel')).to_have_count(0)
            assert page.evaluate('getSelection().toString()')==''
            select();page.locator('.reader').click(position={'x':600,'y':150})
            expect(page.locator('.selection-panel')).to_have_count(0)
            page.wait_for_timeout(350)
            expect(page.locator('.reader-status')).to_contain_text('第 1 /')
            page.locator('.reader').click(position={'x':600,'y':150})
            expect(page.locator('.reader-status')).to_contain_text('第 2 /')

            for name in ['句子练习','听力']:
                nav(name);panel=page.locator('.practice-panel:visible')
                expect(panel.get_by_role('button',name='提交答案',exact=True)).to_be_in_viewport()
                panel.locator('textarea').first.fill(name+'草稿')
                page.screenshot(path=str(output/('sentence.png' if name=='句子练习' else 'listening.png')))
            nav('句子练习');expect(page.locator('.practice-panel:visible textarea').first).to_have_value('句子练习草稿')
            page.set_viewport_size({'width':390,'height':844})
            buttons=page.locator('.practice-panel:visible > .actions > button')
            for button in buttons.all():
                box=button.bounding_box(); assert box['width']>100 and box['height']<90,box
            assert page.evaluate('document.documentElement.scrollWidth')==390
            page.screenshot(path=str(output/'narrow.png'))
            page.set_viewport_size({'width':1100,'height':760})

            page.route('**/api/media/search?*',lambda route:route.fulfill(json={'results':[{'id':'1','title':'Sample','type':'tv','provider':'cms'}]}))
            page.route('**/api/media/resolve',lambda route:route.fulfill(json={'title':'Sample Season 1','type':'tv','episodes':[{'title':'Episode 1','url':'https://example.test/a.mp4','direct':True}],'subtitles':[]}))
            page.route('**/api/media/subtitle-search',lambda route:route.fulfill(json={'sources':[],'warnings':[]}))
            nav('影视');page.get_by_placeholder('输入片名，搜索已配置的数据源').fill('Sample')
            page.get_by_role('button',name='搜索',exact=True).click();page.get_by_role('button',name='选择播放').click()
            expect(page.locator('.media-search-settings')).not_to_have_attribute('open','')
            expect(page.get_by_label('选择剧集 / 线路')).to_be_in_viewport()
            expect(page.get_by_role('heading',name='观影前预习')).to_be_in_viewport()
            page.screenshot(path=str(output/'media.png'))
            page.locator('.media-search-settings > summary').click()
            expect(page.get_by_role('button',name='搜索',exact=True)).to_be_visible()

            nav('设置');form=page.locator('.api-settings')
            form.get_by_label('API 地址',exact=True).fill('https://example.test/v1')
            form.get_by_label('模型名称',exact=True).fill('unsaved-model')
            tests=[]
            def test_api(route):
                tests.append(route.request.post_data_json)
                route.fulfill(json={'message':'连接成功，模型已返回有效回答。'})
            page.route('**/api/settings/test',test_api)
            form.get_by_role('button',name='测试连接').click()
            expect(form.get_by_role('status')).to_contain_text('连接成功')
            assert tests[-1]['model']=='unsaved-model'
            assert page.request.get(url+'/api/settings').json()['model']==''
            form.get_by_role('checkbox',name='练习评分',exact=True).check()
            form.get_by_role('button',name='保存设置',exact=True).click()
            expect(form.get_by_role('button',name='保存设置',exact=True)).to_be_enabled()
            assert page.request.get(url+'/api/settings').json()['apiUses']==['grading']
            page.screenshot(path=str(output/'settings.png'))
            assert not errors,errors
            browser.close()
        print('UX checks passed: reading selection, book progress, compact practice, media controls, settings and narrow layout.')
    finally:
        process.terminate();process.wait(timeout=10)
