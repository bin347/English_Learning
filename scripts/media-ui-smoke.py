import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://127.0.0.1:8766'
output = Path('test-results')
output.mkdir(exist_ok=True)
result = {'url': BASE, 'playback': False, 'subtitle': False}
with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    try:
        page.goto(BASE, wait_until='domcontentloaded')
        page.get_by_role('button', name='影视', exact=True).click()
        page.locator('select').filter(has=page.locator('option[value=tv]')).select_option('tv')
        assert page.locator('select').filter(has=page.locator('option[value=英语]')).input_value() == '英语'
        page.get_by_placeholder('输入片名，搜索已配置的数据源').fill('老友记')
        page.get_by_role('button', name='搜索', exact=True).click()
        page.get_by_role('button', name='选择播放').first.wait_for(timeout=60000)
        page.get_by_role('button', name='选择播放').first.click()
        page.get_by_role('button', name='跳过预习', exact=True).wait_for(timeout=60000)
        page.get_by_role('button', name='跳过预习', exact=True).click()
        try:
            page.wait_for_function("document.querySelector('video')?.readyState >= 2 && document.querySelector('video')?.videoWidth > 0", timeout=60000)
            page.wait_for_function("document.querySelector('video')?.currentTime > 0", timeout=30000)
            result['playback'] = True
        except Exception as exc:
            result['playbackError'] = str(exc)
        result['video'] = page.locator('video').evaluate('(v) => ({readyState:v.readyState,videoWidth:v.videoWidth,currentTime:v.currentTime,error:v.error?.message || null})')
        page.locator('input[type=file]').set_input_files({'name':'original.srt','mimeType':'application/x-subrip','buffer':b'1\n00:00:01,000 --> 00:00:03,000\nA butterfly explores the magnificent mountain.\n'})
        button = page.get_by_role('button',name='确认加入生词本').first
        button.wait_for(timeout=30000)
        button.click()
        page.get_by_role('button',name='已加入').first.wait_for(timeout=30000)
        result['subtitle'] = True
        assert result['playback'], '视频未解码播放'
    except Exception as exc:
        result['error'] = str(exc)
        raise
    finally:
        page.screenshot(path=str(output/'media-final.png'),full_page=True)
        (output/'media-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()

