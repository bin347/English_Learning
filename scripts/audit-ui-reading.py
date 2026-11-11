import base64,io,zipfile,json
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:8766'
content=io.BytesIO()
with zipfile.ZipFile(content,'w') as book:
    book.writestr('mimetype','application/epub+zip')
    book.writestr('META-INF/container.xml','<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
    book.writestr('content.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test-epub</dc:identifier><dc:title>EPUB Test</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
    book.writestr('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body><h1>A Reading Test</h1><p>A wonderful garden grows beside the library.</p></body></html>')

with sync_playwright() as p:
 b=p.chromium.launch(channel='msedge',headless=True);page=b.new_page(viewport={'width':1360,'height':960});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 req=page.request
 req.post(BASE+'/api/grade',data={'exerciseId':'welcome-exercise','answer':'米娅每天早上给花浇水','mode':'basic','practiceType':'sentence','answerMode':'chinese'})
 req.post(BASE+'/api/books',data={'title':'Audit EPUB','format':'epub','content':base64.b64encode(content.getvalue()).decode()})
 req.post(BASE+'/api/books',data={'title':'Audit Text','format':'txt','text':'A garden grows here.\nWe read books every morning.\nThe library is quiet.'})
 page.goto(BASE);page.wait_for_load_state('networkidle')
 def nav(n):page.locator('nav').get_by_role('button',name=n,exact=False).click()
 nav('句子练习');page.locator('.exercise-layout:visible textarea').last.fill('do not erase sentence draft')
 nav('书架');page.get_by_role('button',name='Audit Text',exact=False).last.click();page.locator('.reader p').first.wait_for()
 page.evaluate("""()=>{const n=document.querySelector('.reader p').firstChild,r=document.createRange();r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);document.querySelector('.reader').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))}""")
 page.get_by_role('button',name='查词',exact=True).click();page.wait_for_timeout(300);assert page.locator('.selection-panel').inner_text().find('garden')>=0
 page.get_by_role('button',name='加入听力练习',exact=True).click();page.get_by_role('button',name='保存练习',exact=True).click();page.wait_for_timeout(500)
 assert page.locator('.exercise-layout:visible h2').first.inner_text()=='听力练习'
 nav('句子练习');assert page.locator('.exercise-layout:visible textarea').last.input_value()=='do not erase sentence draft'
 nav('书架');page.get_by_role('button',name='Audit EPUB',exact=False).last.click();page.wait_for_timeout(1500)
 page.locator('.reader-toolbar input[type=range]').fill('26');page.locator('.reader-toolbar select').first.select_option('2.2');page.locator('.reader-toolbar select').nth(1).select_option('dark');page.wait_for_timeout(500)
 styles=page.evaluate("""()=>{const v=document.querySelector('foliate-view');const d=v.renderer.getContents()[0].doc;const s=getComputedStyle(d.body);return {font:s.fontSize,line:s.lineHeight,color:s.color,bg:s.backgroundColor}}""")
 assert styles['font']=='26px',styles
 assert '当前章节阅读难度估算（本地计算）' in page.locator('.content').inner_text()
 assert styles['bg']=='rgb(36, 40, 35)',styles
 page.screenshot(path='test-results/audit-ui-epub.png',full_page=True)

 data=req.get(BASE+'/api/bootstrap').json();textbook=next(x for x in data['books'] if x['title']=='Audit Text')
 req.post(BASE+'/api/words',data={'word':'quiet library phrase','meaning':'安静的图书馆短语','context':'The library is quiet.','bookId':textbook['id'],'location':'p:2'})
 page.reload();page.wait_for_load_state('networkidle');nav('单词');page.get_by_role('button',name='我的生词本',exact=False).click();row=page.locator('.row').filter(has_text='quiet library phrase');row.get_by_role('button',name='返回原文',exact=True).click();assert page.locator('.title h1').inner_text()=='Audit Text'
 nav('单词');page.get_by_role('button',name='我的生词本',exact=False).click();page.locator('.row').filter(has_text='quiet library phrase').get_by_role('button',name='返回原文',exact=True).click();assert page.locator('.title h1').inner_text()=='Audit Text'
 saved=req.get(BASE+'/api/vocabulary?book=saved&state=learning&limit=60').json();assert any(w['word']=='quiet library phrase' for w in saved['words'])
 nav('首页');assert page.get_by_role('button',name='开始复习',exact=True).count()==1;assert page.get_by_role('button',name='返回练习',exact=True).count()>0


 longtext='\n'.join(f'Paragraph {i}. '+('A quiet garden gives readers space to learn new words and discover the world through books. '*5) for i in range(100))
 longbook=req.post(BASE+'/api/books',data={'title':'Audit Long Text','format':'txt','text':longtext}).json()
 req.post(BASE+'/api/words',data={'word':'long paragraph anchor','meaning':'段落定位','bookId':longbook['id'],'context':'Paragraph 80','location':'p:80'})
 page.reload();page.wait_for_load_state('networkidle');nav('书架');page.get_by_role('button',name='Audit Long Text',exact=False).last.click();assert page.locator('.reader').evaluate('(e)=>e.scrollTop')==0
 nav('单词');page.get_by_role('button',name='我的生词本',exact=False).click();page.locator('.row').filter(has_text='long paragraph anchor').get_by_role('button',name='返回原文',exact=True).click()
 page.wait_for_timeout(250);assert 'Paragraph 80' in page.locator('.reader').inner_text(), 'p:80 was not on the selected page'
 page.screenshot(path='test-results/audit-ui-long-text.png',full_page=True)


 nav('书架');page.get_by_role('button',name='Audit Text',exact=False).last.click();page.locator('.reader p').first.wait_for()
 page.evaluate("""()=>{const n=document.querySelector('.reader p').firstChild,r=document.createRange(),at=n.textContent.indexOf('garden');r.setStart(n,at);r.setEnd(n,at+6);getSelection().removeAllRanges();getSelection().addRange(r);document.querySelector('.reader').dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))}""")
 page.get_by_role('button',name='查词',exact=True).click();page.wait_for_timeout(200);page.get_by_role('button',name='加入生词本',exact=True).click();assert page.locator('input[name=meaning]').input_value();page.get_by_role('button',name='保存到生词本',exact=True).click();page.wait_for_timeout(200)
 nav('句子练习');panel=page.locator('.exercise-layout:visible');panel.locator('textarea').last.fill('历史定位答案');panel.get_by_role('button',name='提交评分',exact=True).click();page.wait_for_timeout(300);selected=panel.get_by_label('选择练习').input_value();panel.get_by_label('难度',exact=False).select_option('advanced');panel.get_by_role('button',name='查看',exact=True).first.click();assert panel.get_by_label('选择练习').input_value()==selected
 nav('首页');page.get_by_role('button',name='返回练习',exact=True).first.click();panel.get_by_role('button',name='下一题',exact=True).click();nav('首页');page.get_by_role('button',name='返回练习',exact=True).first.click();assert panel.get_by_label('选择练习').input_value()==selected

 assert not errors,errors
 print('READING PASS',styles);b.close()
