import json
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8766'
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 page=browser.new_page(viewport={'width':1360,'height':960});errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(BASE);page.wait_for_load_state('networkidle')
 def nav(name):page.locator('nav').get_by_role('button',name=name,exact=False).click()
 def panel():return page.locator('.exercise-layout:visible')
 nav('句子练习');panel().locator('textarea').last.fill('句子草稿保留')
 nav('听力');panel().locator('textarea').last.fill('English listening draft')
 panel().get_by_label('答案语言').select_option('chinese');assert panel().locator('textarea').last.input_value()==''
 panel().locator('textarea').last.fill('听力中文草稿');panel().get_by_label('答案语言').select_option('english');assert panel().locator('textarea').last.input_value()=='English listening draft'
 panel().get_by_role('button',name='提交评分',exact=True).click();page.wait_for_timeout(500);assert panel().locator('.feedback').count()==1
 nav('句子练习');assert panel().locator('textarea').last.input_value()=='句子草稿保留';assert panel().locator('.feedback').count()==0
 panel().get_by_label('难度',exact=False).select_option('advanced');assert panel().get_by_label('选择练习').locator('option').count()>0
 nav('单词');page.wait_for_timeout(400);page.get_by_role('button',name='选择题',exact=True).click();assert page.locator('.choices button').count()==4
 word=page.locator('.quiz h2').inner_text();page.get_by_role('button',name='标为已掌握',exact=True).click();page.wait_for_timeout(400);assert page.locator('.quiz h2').inner_text()!=word
 data=page.request.get(BASE+'/api/bootstrap').json();assert not any(w['word']==word for w in data['words'])
 page.get_by_label('学习状态',exact=False).select_option('mastered');page.wait_for_timeout(300);assert page.get_by_role('button',name='下一词',exact=True).count()==1
 nav('设置');checks=page.locator('input[name=apiUses]');checks.first.check();page.get_by_role('button',name='保存设置',exact=True).click();page.wait_for_timeout(400);assert 'translation' in page.request.get(BASE+'/api/settings').json()['apiUses'];assert 'Google' not in page.locator('body').inner_text()
 nav('句子练习');panel().locator('summary').click();panel().get_by_label('在线例句搜索').fill('garden');panel().get_by_role('button',name='搜索例句',exact=True).click();page.wait_for_timeout(12000)
 online=panel().locator('.catalog-search .row');online_count=online.count()
 assert online_count>0, page.locator('[role=alert]').all_inner_texts()
 if online_count:online.first.get_by_role('button',name='加入练习',exact=True).click();page.wait_for_timeout(800)
 nav('影视');assert page.locator('.content>.panel').get_by_label('语言',exact=False).input_value()=='英语';page.get_by_role('button',name='搜索',exact=True).click();page.wait_for_timeout(12000)
 page.screenshot(path='test-results/audit-ui-media.png',full_page=True)
 assert not errors,errors
 Path('test-results/audit-ui-smoke.json').write_text(json.dumps({'result':'passed','onlineResults':online_count,'pageErrors':errors,'covered':['independent drafts and feedback','listening answer modes','advanced filter','four vocabulary options','mastered word excluded from saved vocabulary','next word control','API uses save','online sentence render/import when available','English media filter']},ensure_ascii=False,indent=2),encoding='utf-8')
 print('PASS',online_count,'online results. No page errors.');browser.close()
