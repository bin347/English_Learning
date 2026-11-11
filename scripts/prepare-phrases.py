"""Build the offline phrase index from an english-vocabulary checkout."""
import json
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) / 'json'
phrases = json.loads((root / 'frontend/src/vocabulary-phrases.json').read_text(encoding='utf-8'))
for file in sorted(source.glob('*.json')):
    for entry in json.loads(file.read_text(encoding='utf-8')):
        word = entry.get('word', '').strip().lower()
        if not re.fullmatch(r'[a-z]+', word):
            continue
        for item in entry.get('phrases', []):
            phrase, meaning = item.get('phrase', '').strip(), item.get('translation', '').strip()
            if not phrase or not meaning or not re.search(r'\b' + word + r'\b', phrase, re.I):
                continue
            values = phrases.setdefault(word, [])
            if len(values) < 5 and all(existing[0].lower() != phrase.lower() for existing in values):
                values.append([phrase, meaning])
(root / 'data/vocabulary-phrases.json').write_text(json.dumps(phrases, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'{len(phrases)} words, {sum(map(len, phrases.values()))} phrases')
