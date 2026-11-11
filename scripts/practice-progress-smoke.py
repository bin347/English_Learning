"""Verify practice position and drafts survive a full server restart. Run npm run build first."""
import os
from pathlib import Path
import subprocess
import tempfile
from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
server_code = """import {startServer} from './server/index.mjs';
const server=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'});
console.log(server.url);"""
with tempfile.TemporaryDirectory(prefix='shiju-progress-') as directory:
    env = os.environ.copy()
    env['SHIJU_TEST_DATA'] = directory
    def start():
        process = subprocess.Popen(['node','--input-type=module','-e',server_code],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        url = process.stdout.readline().strip()
        assert url.startswith('http://127.0.0.1:'), url
        return process, url
    process, url = start()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge',headless=True)
            page = browser.new_page()
            page.goto(url,wait_until='networkidle')
            nav = page.locator('nav')
            nav.get_by_role('button',name='句子练习').click()
            sentence = page.locator('.practice-layout:visible')
            sentence.get_by_text('选择题目与来源').click()
            select = sentence.get_by_label('选择练习')
            select.select_option(index=2)
            sentence_id = select.input_value()
            sentence.locator('textarea').first.fill('句子未完成答案')
            sentence.locator('textarea').first.blur()
            nav.get_by_role('button',name='听力').click()
            listening = page.locator('.practice-layout:visible')
            listening.get_by_text('选择题目与来源').click()
            select = listening.get_by_label('选择练习')
            select.select_option(index=3)
            listening_id = select.input_value()
            listening.get_by_role('button',name='听英文写中文意思').click()
            listening.locator('textarea').first.fill('听力未完成答案')
            listening.locator('textarea').first.blur()
            nav.get_by_role('button',name='单词',exact=False).click()
            vocab = page.locator('.vocabulary-panel')
            vocab.get_by_label('词书').select_option('cet6')
            expect(vocab.locator('.quiz h2')).to_be_visible()
            vocab.get_by_role('button',name='跳过此词').click()
            word = vocab.locator('.quiz h2').inner_text()
            vocab.get_by_label('中文意思').fill('未完成答案')
            page.wait_for_timeout(1200)
            browser.close()
            process.terminate(); process.wait(timeout=10)
            process, url = start()
            browser = p.chromium.launch(channel='msedge',headless=True)
            page = browser.new_page()
            page.goto(url,wait_until='networkidle')
            nav = page.locator('nav')
            nav.get_by_role('button',name='句子练习').click()
            sentence = page.locator('.practice-layout:visible')
            sentence.get_by_text('选择题目与来源').click()
            expect(sentence.get_by_label('选择练习')).to_have_value(sentence_id)
            expect(sentence.locator('textarea').first).to_have_value('句子未完成答案')
            nav.get_by_role('button',name='听力').click()
            listening = page.locator('.practice-layout:visible')
            listening.get_by_text('选择题目与来源').click()
            expect(listening.get_by_label('选择练习')).to_have_value(listening_id)
            expect(listening.get_by_role('button',name='听英文写中文意思')).to_have_attribute('aria-pressed','true')
            expect(listening.locator('textarea').first).to_have_value('听力未完成答案')
            nav.get_by_role('button',name='单词',exact=False).click()
            vocab = page.locator('.vocabulary-panel')
            expect(vocab.get_by_label('词书')).to_have_value('cet6')
            expect(vocab.locator('.quiz h2')).to_have_text(word)
            expect(vocab.get_by_label('中文意思')).to_have_value('未完成答案')
            vocab.get_by_role('button',name='提交答案').click()
            expect(vocab.locator('.word-feedback')).to_be_visible()
            page.wait_for_timeout(600)
            page.reload(wait_until='networkidle')
            page.locator('nav').get_by_role('button',name='单词',exact=False).click()
            vocab = page.locator('.vocabulary-panel')
            expect(vocab.locator('.quiz h2')).to_have_text(word)
            expect(vocab.locator('.word-feedback')).to_be_visible()
            vocab.get_by_role('button',name='下一词').click()
            expect(vocab.locator('.quiz h2')).not_to_have_text(word)
            backup = page.request.get(url+'/api/backup').json()
            assert set(backup['practiceProgress']) == {'sentence','listening','vocabulary'}
            browser.close()
        print('Practice positions, drafts, feedback and backup passed after restarting server.')
    finally:
        process.terminate()
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait(timeout=10)
