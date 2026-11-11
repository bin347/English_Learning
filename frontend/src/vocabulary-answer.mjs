export function matchesMeaning(answer, meaning) {
    const clean = value => value.normalize('NFKC').toLowerCase().replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）/g, '').replace(/^(?:[a-z]+\.)+\s*/i, '').replace(/[\s。.!！?？:：]+/g, '').trim();
    const input = clean(answer);
    if (!input) return false;
    return meaning.split(/[,，;；、/\n]+/).some(part => clean(part) === input);
}
