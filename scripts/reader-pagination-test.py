import base64
import io
import zipfile
from playwright.sync_api import sync_playwright, expect

BASE='http://127.0.0.1:8768'
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1200,'height':900})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    text='\n'.join(f'Paragraph {i}: A beautiful garden grows beside the old library.' for i in range(300))
    created=page.request.post(BASE+'/api/books',data={'title':'Reading fixture','format':'txt','text':text}).json()
    page.goto(BASE,wait_until='networkidle')
    page.locator('nav').get_by_role('button',name='书架',exact=True).click()
    page.locator('.book').filter(has_text='Reading fixture').click()
    expect(page.get_by_text('第 1 /',exact=False)).to_be_visible()
    page.get_by_role('button',name='下一页',exact=True).click()
    page.get_by_role('button',name='下一页',exact=True).click()
    expect(page.get_by_text('第 3 /',exact=False)).to_be_visible()
    page.get_by_role('button',name='添加书签',exact=True).click()
    expect(page.get_by_role('button',name='第 3 页',exact=True)).to_be_visible()
    page.screenshot(path='test-results/reader-pagination.png',full_page=True)
    page.get_by_role('button',name='下一页',exact=True).click()
    saved_offset=int(page.locator('.reading-content > article.reader p').first.get_attribute('data-offset'))
    page.wait_for_function("expected => fetch('/api/books/"+created['id']+"').then(r=>r.json()).then(b=>b.location==='t:'+expected)",arg=saved_offset)
    saved_excerpt=text[saved_offset:saved_offset+30].strip().split('\n')[0]
    page.get_by_role('button',name='返回书架',exact=True).click()
    page.locator('.book').filter(has_text='Reading fixture').click()
    expect(page.locator('.reading-content > article.reader')).to_contain_text(saved_excerpt)
    page.reload(wait_until='networkidle')
    page.locator('nav').get_by_role('button',name='书架',exact=True).click()
    page.locator('.book').filter(has_text='Reading fixture').click()
    expect(page.locator('.reading-content > article.reader')).to_contain_text(saved_excerpt)
    page.get_by_role('button',name='书签 · 1',exact=True).click()
    page.get_by_role('button',name='第 3 页',exact=True).click()
    backup=page.request.get(BASE+'/api/backup').json()
    marks=next(book for book in backup['books'] if book['id']==created['id'])['bookmarks']
    assert marks
    bookmark_offset=int(marks[0]['location'][2:])
    expect(page.locator('.reading-content > article.reader')).to_contain_text(text[bookmark_offset:bookmark_offset+30].strip().split('\n')[0])
    page.get_by_role('button',name='删除书签',exact=True).click()
    expect(page.get_by_role('button',name='书签 · 0',exact=True)).to_be_visible()
    content=io.BytesIO()
    with zipfile.ZipFile(content,'w') as epub:
        epub.writestr('mimetype','application/epub+zip')
        epub.writestr('META-INF/container.xml','<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        epub.writestr('content.opf','<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">reader-test</dc:identifier><dc:title>Reader EPUB</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>')
        epub.writestr('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+''.join(f'<p>Paragraph {i}. A garden grows near the library.</p>' for i in range(120))+'</body></html>')
    eb=page.request.post(BASE+'/api/books',data={'title':'Reader EPUB','format':'epub','content':base64.b64encode(content.getvalue()).decode()}).json()
    page.get_by_role('button',name='返回书架',exact=True).click()
    page.reload(wait_until='networkidle')
    page.locator('nav').get_by_role('button',name='书架',exact=True).click()
    page.locator('.book').filter(has_text='Reader EPUB').click()
    page.wait_for_function("document.querySelector('foliate-view')?.renderer?.getContents()?.length > 0")
    page.wait_for_function("fetch('/api/books/"+eb['id']+"').then(r=>r.json()).then(b=>typeof b.location==='string' && b.location.startsWith('epubcfi('))")
    page.get_by_role('button',name='添加书签',exact=True).click()
    expect(page.get_by_role('button',name='书签 · 1',exact=True)).to_be_visible()
    page.get_by_role('button',name='下一页',exact=True).click()
    page.wait_for_timeout(800)
    saved=page.request.get(BASE+'/api/books/'+eb['id']).json()
    assert saved['bookmarks'][0]['location'].startswith('epubcfi(')
    page.get_by_role('button',name='返回书架',exact=True).click()
    page.locator('.book').filter(has_text='Reader EPUB').click()
    expect(page.get_by_role('button',name='书签 · 1',exact=True)).to_be_visible()
    page.get_by_role('button',name='书签 · 1',exact=True).click()
    page.locator('.row').filter(has_text='阅读位置').get_by_role('button').first.click()
    page.wait_for_function("document.querySelector('foliate-view')?.renderer?.getContents()?.length > 0")
    expected=saved['bookmarks'][0]['location']
    page.wait_for_function("expected => fetch('/api/books/"+eb['id']+"').then(r=>r.json()).then(b=>b.location===expected)",arg=expected)
    assert not errors, errors
    print('PASS: text and EPUB pages, reopen, bookmarks and backup')
    browser.close()
