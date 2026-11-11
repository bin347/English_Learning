"""Verify the included EPUB in the reader using an isolated database."""
import os, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
code="import {startServer} from './server/index.mjs'; const s=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'}); console.log(s.url);"
with tempfile.TemporaryDirectory(prefix='shiju-builtin-ui-') as directory:
    env=os.environ.copy(); env['SHIJU_TEST_DATA']=directory
    process=subprocess.Popen(['node','--input-type=module','-e',code],cwd=root,env=env,stdout=subprocess.PIPE,text=True)
    try:
        url=process.stdout.readline().strip()
        with sync_playwright() as p:
            browser=p.chromium.launch(channel='msedge',headless=True)
            page=browser.new_page(viewport={'width':1100,'height':760})
            errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
            page.goto(url,wait_until='networkidle')
            page.locator('nav').get_by_role('button',name='书架').click()
            expect(page.locator('.book')).to_have_count(1)
            page.locator('.book').filter(has_text='Alice’s Adventures in Wonderland').click()
            page.wait_for_function("document.querySelector('foliate-view')?.renderer?.getContents()?.length > 0")
            reader=page.locator('.reader')
            initial=reader.bounding_box()
            assert initial['height']>500 and initial['y']+initial['height']<=760,initial
            page.set_viewport_size({'width':1360,'height':900})
            page.wait_for_function("document.querySelector('.reader').getBoundingClientRect().height > 640")
            page.set_viewport_size({'width':1100,'height':760})
            page.wait_for_function("document.querySelector('.reader').getBoundingClientRect().height < 600")
            expect(page.get_by_role('link',name='查看原文')).to_have_attribute('href','https://www.gutenberg.org/ebooks/11')
            page.get_by_role('button',name='章节目录').click()
            toc=page.locator('.reader-toc')
            expect(toc.get_by_role('button',name='Down the Rabbit-Hole',exact=False)).to_be_visible()
            expect(toc.get_by_role('button',name='Alice’s Evidence',exact=False)).to_be_visible()
            toc.get_by_role('button',name='Down the Rabbit-Hole',exact=False).click()
            page.wait_for_function("document.querySelector('foliate-view')?.renderer?.getContents()?.some(x=>x.doc.body?.textContent.includes('Alice was beginning'))")
            page.evaluate("""() => {
                const doc=document.querySelector('foliate-view').renderer.getContents().find(x=>x.doc.body?.textContent.includes('Alice was beginning')).doc;
                const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT); let node;
                while((node=walker.nextNode()) && !node.textContent.includes('beginning')) {}
                const at=node.textContent.indexOf('beginning'), range=doc.createRange();
                range.setStart(node,at);range.setEnd(node,at+9);doc.getSelection().removeAllRanges();doc.getSelection().addRange(range);
                doc.dispatchEvent(new doc.defaultView.MouseEvent('mouseup',{bubbles:true}));
            }""")
            expect(page.locator('.selection-panel')).to_contain_text('beginning')
            page.locator('.selection-panel').get_by_role('button',name='查词',exact=True).click()
            expect(page.locator('.selection-panel')).to_contain_text('beginning')
            page.locator('.selection-panel .close').click()
            page.wait_for_function("fetch('/api/books/builtin-alice-11').then(r=>r.json()).then(b=>typeof b.location==='string' && b.location.startsWith('epubcfi('))")
            page.get_by_role('button',name='添加书签').click()
            expect(page.get_by_role('button',name='书签 · 1')).to_be_visible()
            page.get_by_role('button',name='下一页',exact=True).click()
            page.wait_for_timeout(400)
            saved=page.request.get(url+'/api/books/builtin-alice-11').json()
            assert saved['location'].startswith('epubcfi(') and len(saved['bookmarks'])==1
            page.get_by_role('button',name='返回书架').click();page.locator('.book').filter(has_text='Alice’s Adventures in Wonderland').click()
            expect(page.get_by_role('button',name='书签 · 1')).to_be_visible()
            page.wait_for_function("document.querySelector('foliate-view')?.renderer?.getContents()?.length > 0")
            assert not errors,errors
            browser.close()
        print('Included complete EPUB, chapters, bookmark and reading position passed.')
    finally:
        process.terminate();process.wait(timeout=10)
