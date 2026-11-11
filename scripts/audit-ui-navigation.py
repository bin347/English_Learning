import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8766'
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1360, 'height': 960})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    def nav(name):
        page.locator('nav').get_by_role('button', name=name, exact=False).click()
    def panel():
        return page.locator('.exercise-layout:visible')
    nav('书架')
    page.locator('.book').filter(has_text='A Small Beginning').click()
    page.locator('.reader p').first.wait_for()
    page.evaluate("""() => {
      const n = document.querySelector('.reader p').firstChild;
      const start = n.textContent.indexOf('garden'), r = document.createRange();
      r.setStart(n,start); r.setEnd(n,start+6);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.reader').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    }""")
    page.get_by_role('button', name='查词', exact=True).click()
    expect(page.locator('.selection-panel')).to_contain_text('花园')
    page.get_by_role('button', name='加入生词本', exact=True).click()
    expect(page.get_by_label('中文释义')).to_have_value(__import__('re').compile('.*花园.*'))
    page.get_by_role('button', name='保存到生词本', exact=True).click()
    expect(page.locator('.dialog')).to_have_count(0)

    data = page.request.get(BASE + '/api/bootstrap').json()
    exercise = next(e for e in data['exercises'] if e['id'] == 'original-practice-001')
    nav('句子练习')
    panel().get_by_label('选择练习').select_option(exercise['id'])
    panel().locator('textarea').last.fill(exercise['reference'])
    panel().get_by_role('button', name='提交评分', exact=True).click()
    expect(panel().locator('.feedback')).to_contain_text('100 分')
    panel().get_by_label('难度', exact=False).select_option('advanced')
    panel().locator('section').nth(1).locator('.row').filter(has_text=exercise['reference']).first.get_by_role('button', name='查看', exact=True).click()
    expect(panel().get_by_label('选择练习')).to_have_value(exercise['id'])
    expect(panel().locator('textarea').last).to_have_value(exercise['reference'])
    for _ in range(2):
        nav('首页')
        page.get_by_role('button', name='返回练习', exact=True).first.click()
        expect(panel().get_by_label('选择练习')).to_have_value(exercise['id'])
        panel().get_by_label('选择练习').select_option('original-practice-101')

    nav('设置')
    page.get_by_role('checkbox', name='阅读 / 划词翻译', exact=True).uncheck()
    page.get_by_role('checkbox', name='练习评分', exact=True).check()
    page.get_by_role('button', name='保存设置', exact=True).click()
    expect(page.get_by_role('button', name='保存设置', exact=True)).to_be_enabled()
    backup = page.request.get(BASE + '/api/backup').json()
    assert backup['settings']['apiUses'] == ['grading']
    page.get_by_role('checkbox', name='练习评分', exact=True).uncheck()
    page.get_by_role('button', name='保存设置', exact=True).click()
    expect(page.get_by_role('button', name='保存设置', exact=True)).to_be_enabled()
    page.get_by_label('恢复备份', exact=False).set_input_files({'name': 'restore.json', 'mimeType': 'application/json', 'buffer': json.dumps(backup, ensure_ascii=False).encode()})
    expect(page.get_by_role('checkbox', name='练习评分', exact=True)).to_be_checked()
    assert not errors, errors
    page.screenshot(path='test-results/audit-ui-navigation.png', full_page=True)
    Path('test-results/audit-ui-navigation.json').write_text(json.dumps({'passed': True, 'checks': ['word meaning prefill', 'history outside filters', 'repeated home navigation', 'restored settings reflect in form'], 'pageErrors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS: word collection, history navigation, repeated home navigation and restored settings.')
    browser.close()
