"""Exercise sentence and listening feedback using an isolated local database."""
import os, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
code="import {startServer} from './server/index.mjs'; const s=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'}); console.log(s.url);"
with tempfile.TemporaryDirectory(prefix='shiju-feedback-') as directory:
    env=os.environ.copy(); env['SHIJU_TEST_DATA']=directory
    server=subprocess.Popen(['node','--input-type=module','-e',code],cwd=root,env=env,stdout=subprocess.PIPE,text=True)
    try:
        url=server.stdout.readline().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1100,'height':760})
            requests=[]; page.on('request',lambda req:requests.append(req.url) if req.url.endswith('/api/grade') else None)
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(url,wait_until='networkidle')
            page.locator('nav').get_by_role('button',name='句子练习').click()
            panel=page.locator('.practice-panel:visible'); answer=panel.locator('textarea').first
            answer.fill('米娅每天早上给花浇水')
            panel.get_by_role('button',name='提交答案',exact=True).click()
            dialog=page.get_by_role('dialog',name='本次反馈');expect(dialog).to_be_visible()
            expect(dialog.get_by_text('参考分数',exact=False)).to_be_visible()
            output=os.environ.get('SHIJU_FEEDBACK_SCREENSHOTS')
            if output: Path(output).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(output)/'desktop.png'))
            dialog.get_by_role('button',name='原文对照').click()
            expect(dialog.get_by_text('Mia watered the flowers every morning.')).to_be_visible()
            dialog.get_by_role('button',name='生词建议',exact=False).click()
            page.keyboard.press('Escape');expect(dialog).to_have_count(0)
            panel.get_by_role('button',name='查看反馈',exact=True).click();expect(dialog).to_be_visible()
            assert len(requests)==1
            dialog.get_by_role('button',name='修改答案').click();expect(dialog).to_have_count(0)
            expect(answer).to_be_focused();answer.fill('我修改后的草稿');answer.blur()
            expect(panel.get_by_text('对应上次提交的答案',exact=False)).to_be_visible()
            page.wait_for_timeout(600);page.reload(wait_until='networkidle')
            page.locator('nav').get_by_role('button',name='句子练习').click()
            panel=page.locator('.practice-panel:visible')
            expect(panel.locator('textarea').first).to_have_value('我修改后的草稿')
            panel.get_by_role('button',name='查看反馈',exact=True).click();dialog=page.get_by_role('dialog',name='本次反馈')
            expect(dialog.get_by_text('这份反馈对应上次提交的答案',exact=False)).to_be_visible()
            dialog.get_by_role('button',name='下一题',exact=True).click();expect(dialog).to_have_count(0)
            history=page.locator('.practice-history:visible')
            expect(history).not_to_have_attribute('open','')
            expect(history.locator('summary')).to_contain_text('1 次')
            if output: page.screenshot(path=str(Path(output)/'history.png'))
            history.locator('summary').click();expect(history).to_have_attribute('open','')
            history.get_by_label('筛选练习记录').select_option('all')
            history.get_by_role('button',name='查看 / 再练').first.click()
            expect(dialog).to_be_visible();dialog.get_by_role('button',name='收起反馈',exact=True).first.click()
            page.locator('nav').get_by_role('button',name='听力').click()
            panel=page.locator('.practice-panel:visible');panel.locator('textarea').first.fill('Mia watered flowers')
            panel.get_by_role('button',name='提交答案',exact=True).click();expect(dialog).to_be_visible()
            expect(dialog.get_by_text('英文单词对照')).to_be_visible()
            dialog.get_by_role('button',name='原文对照').click();expect(dialog.get_by_text('听写对照',exact=True)).to_be_visible()
            dialog.get_by_role('button',name='生词建议',exact=False).click()
            candidate=dialog.get_by_role('button',name='确认加入生词本').first
            candidate.click();expect(dialog.get_by_role('button',name='已在生词本').first).to_be_disabled()
            dialog.get_by_role('button',name='原文对照').click()
            page.set_viewport_size({'width':390,'height':844})
            if output: page.screenshot(path=str(Path(output)/'narrow.png'))
            box=dialog.bounding_box();assert box['width']<=390 and box['height']<=844,box
            dialog.get_by_role('button',name='收起反馈',exact=True).first.click()
            listen_history=page.locator('.practice-history:visible')
            expect(listen_history).not_to_have_attribute('open','')
            expect(listen_history.locator('summary')).to_contain_text('1 次')
            listen_history.locator('summary').click();expect(listen_history).to_have_attribute('open','')
            listen_history.locator('summary').click();expect(listen_history).not_to_have_attribute('open','')
            panel.get_by_role('button',name='听英文写中文意思').click()
            panel.locator('textarea').first.fill('米娅每天给花浇水')
            panel.get_by_role('button',name='提交答案',exact=True).click();expect(dialog).to_be_visible()
            expect(dialog.get_by_text('基础关键词比对')).to_be_visible()
            dialog.get_by_role('button',name='修改答案').click()
            panel.locator('textarea').first.fill('另一种理解')
            page.route('**/api/grade',lambda route:route.fulfill(json={'mode':'ai','result':{'score':83,'notice':'请结合上下文检查细节。 '*180}}))
            panel.get_by_role('button',name='重新提交',exact=True).click()
            expect(dialog).to_be_visible()
            body=dialog.locator('.feedback-dialog-body')
            assert body.evaluate('(e) => e.scrollHeight > e.clientHeight')
            expect(dialog.get_by_role('button',name='下一题',exact=True)).to_be_in_viewport()
            assert not errors,errors
            browser.close()
        print('Feedback dialog, saved results, history and listening modes passed.')
    finally:
        server.terminate();server.wait(timeout=10)
