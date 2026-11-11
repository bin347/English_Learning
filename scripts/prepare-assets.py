"""Download upstream snapshots, retaining their archive hashes and licenses."""
import csv
import io
import json
import hashlib
import pathlib
import urllib.request
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]

def download(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'EnglishStudyAssistant/0.1'}), timeout=90) as response:
        return response.read()

def main():
    sources = {}
    for repository, target in [('johnfactotum/foliate-js', 'vendor/foliate-js')]:
        snapshot = download(f'https://codeload.github.com/{repository}/zip/refs/heads/main')
        archive = zipfile.ZipFile(io.BytesIO(snapshot))
        destination = ROOT / target
        for entry in archive.infolist():
            relative = pathlib.PurePosixPath(entry.filename).parts[1:]
            if entry.is_dir() or not relative:
                continue
            if '..' in relative:
                raise ValueError('Unsafe archive member')
            path = destination.joinpath(*relative)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(archive.read(entry))
        sources[repository] = {'ref':'main', 'archiveSha256':hashlib.sha256(snapshot).hexdigest()}
    repository = 'skywind3000/ECDICT'
    dictionary_csv = download(f'https://raw.githubusercontent.com/{repository}/master/ecdict.csv')
    rows = csv.DictReader(io.StringIO(dictionary_csv.decode('utf-8-sig')))
    dictionary = {}
    for row in rows:
        word = row['word'].strip().lower()
        if not word or not row.get('translation') or not (row.get('tag') or int(row.get('frq') or 0) or int(row.get('bnc') or 0)):
            continue
        dictionary[word] = {'word':word, 'phonetic':row.get('phonetic',''), 'meanings':row['translation'].replace(r'\r','').replace(r'\n','\n').splitlines(), 'exchange':row.get('exchange',''), 'frequency':int(row.get('frq') or 0), 'tags':row.get('tag','')}
    data = ROOT / 'data'
    data.mkdir(exist_ok=True)
    (data/'dictionary.json').write_text(json.dumps(dictionary, ensure_ascii=False, separators=(',',':')), encoding='utf-8')
    (data/'ECDICT-LICENSE.txt').write_bytes(download(f'https://raw.githubusercontent.com/{repository}/master/LICENSE'))
    sources[repository] = {'ref':'master','csvSha256':hashlib.sha256(dictionary_csv).hexdigest()}
    (data/'upstream-versions.json').write_text(json.dumps(sources, indent=2), encoding='utf-8')
    print(f'Prepared foliate-js and {len(dictionary)} dictionary entries.')

if __name__ == '__main__':
    main()
