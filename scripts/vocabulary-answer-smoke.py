"""Exercise vocabulary UI against an isolated local server. Run npm run build first."""
import os
from pathlib import Path
import subprocess
import tempfile

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
server_code = """import {startServer} from './server/index.mjs';
const server=await startServer({dataDir:process.env.SHIJU_TEST_DATA,port:0,staticDir:'frontend/dist'});
console.log(server.url);"""

with tempfile.TemporaryDirectory(prefix='shiju-vocabulary-test-') as data_dir:
    env = os.environ.copy()
    env['SHIJU_TEST_DATA'] = data_dir
    process = subprocess.Popen(['node', '--input-type=module', '-e', server_code], cwd=root, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        base = process.stdout.readline().strip()
        assert base.startswith('http://127.0.0.1:'), base
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page(viewport={'width':1100,'height':760})
            page.goto(base, wait_until='networkidle')
            page.locator('nav button').nth(1).click()
            quiz = page.locator('.vocabulary-panel .quiz')
            expect(quiz.locator('h2')).to_have_text('state')
            similar = quiz.locator('.similar-words')
            expect(similar).to_have_count(0)
            quiz.get_by_label('中文意思').fill('国家')
            quiz.get_by_role('button', name='提交答案').click()
            expect(quiz.get_by_text('回答正确！')).to_be_visible()
            expect(quiz.get_by_text('完整释义：', exact=False)).to_be_visible()
            expect(similar.get_by_role('heading', name='拼写近似词')).to_be_visible()
            expect(similar.locator('dt')).to_have_count(3)
            assert all(text.strip() for text in similar.locator('dd').all_text_contents())
            candidates = page.request.get(base+'/api/dictionary/similar?q=quiet').json()['words']
            assert 'quite' in {word['word'] for word in candidates}
            assert 'quiets' not in {word['word'] for word in candidates}
            assert not page.request.get(base+'/api/bootstrap').json()['words']
            quiz.get_by_role('button', name='下一词', exact=True).click()
            expect(quiz.locator('h2')).not_to_have_text('state')
            expect(similar).to_have_count(0)
            word = quiz.locator('h2').inner_text()
            quiz.get_by_label('中文意思').fill('完全不知道')
            quiz.get_by_role('button', name='提交答案').click()
            expect(quiz.get_by_text('已加入生词本', exact=False)).to_be_visible()
            expect(similar).to_have_count(0)
            assert any(w['word'] == word for w in page.request.get(base+'/api/bootstrap').json()['words'])
            quiz.get_by_role('button', name='我答对了，纠正误判').click()
            expect(quiz.get_by_text('已按回答正确处理。')).to_be_visible()
            assert not any(w['word'] == word for w in page.request.get(base+'/api/bootstrap').json()['words'])
            quiz.get_by_role('button', name='下一词', exact=True).click()
            options = quiz.locator('.choices button')
            choices_url = '**/api/vocabulary/choices'
            with page.expect_response(choices_url) as response:
                page.get_by_role('button', name='选择题', exact=True).click()
            choices = response.value.json()['choices']
            option_sets = []
            for _ in range(5):
                expect(options).to_have_text([choice['meaning'] for choice in choices])
                option_sets.append(set(options.all_text_contents()))
                assert len(option_sets[-1]) == 4
                with page.expect_response(choices_url) as response:
                    quiz.get_by_role('button', name='跳过此词').click()
                choices = response.value.json()['choices']
            assert len(set.intersection(*option_sets)) < 3, option_sets
            word = quiz.locator('h2').inner_text()
            wrong = next(choice['meaning'] for choice in choices if choice['word'] != word)
            options.get_by_text(wrong, exact=True).click()
            expect(quiz.get_by_text('已加入生词本', exact=False)).to_be_visible()
            expect(similar).to_have_count(0)
            assert any(w['word'] == word for w in page.request.get(base+'/api/bootstrap').json()['words'])
            with page.expect_response(choices_url) as response:
                quiz.get_by_role('button', name='下一词', exact=True).click()
            expect(quiz.locator('h2')).not_to_have_text(word)
            word = quiz.locator('h2').inner_text()
            correct = next(choice['meaning'] for choice in response.value.json()['choices'] if choice['word'] == word)
            options.get_by_text(correct, exact=True).click()
            expect(quiz.get_by_text('回答正确！')).to_be_visible()
            expect(similar.get_by_role('heading', name='拼写近似词')).to_be_visible()
            for index in range(65):
                assert page.request.post(base+'/api/words', data={'word':f'fixtureword{index}','meaning':f'词{index}'}).ok
            page.locator('nav').get_by_role('button', name='首页', exact=True).click()
            page.locator('nav button').nth(1).click()
            page.get_by_label('词书').select_option('saved')
            seen = []
            for _ in range(62):
                expect(quiz.locator('h2')).to_be_visible()
                current = quiz.locator('h2').inner_text()
                seen.append(current)
                quiz.get_by_role('button', name='跳过此词').click()
                page.wait_for_function("old => document.querySelector('.vocabulary-panel .quiz h2')?.textContent !== old", arg=current)
            assert len(set(seen)) == 62, seen
            expect(page.get_by_role('button', name='上一页', exact=True)).to_have_count(0)
            expect(page.get_by_role('button', name='下一页', exact=True)).to_have_count(0)
            browser.close()
        print('Vocabulary input, wrong-answer collection, correction and automatic loading passed.')
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)
