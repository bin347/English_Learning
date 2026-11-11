from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8766'  # Isolated audit server only.
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1200, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    settings = page.request.get(BASE + '/api/settings').json()
    assert 'translationProvider' not in settings
    page.locator('nav').get_by_role('button', name='书架', exact=True).click()
    page.locator('.book').filter(has_text='A Small Beginning').click()
    page.locator('.reader p').first.wait_for()
    page.evaluate("""() => {
      const r = document.createRange(); r.selectNodeContents(document.querySelector('.reader p'));
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.querySelector('.reader').dispatchEvent(new MouseEvent('mouseup', {bubbles:true}));
    }""")
    page.get_by_role('button', name='查词', exact=True).click()
    expect(page.locator('.selection-panel')).to_contain_text('garden')
    page.get_by_role('button', name='翻译', exact=True).click()
    expect(page.locator('.lookup-result')).to_be_visible(timeout=55000)
    expect(page.locator('.lookup-result')).to_contain_text('花园')
    assert page.locator('.selection-panel select').count() == 0
    assert 'Google' not in page.locator('body').inner_text()
    page.screenshot(path=str(Path('test-results') / 'reading-auto-translation.png'), full_page=True)
    assert not errors, errors
    print('PASS: local word hints and automatic sentence translation.')
    browser.close()
