#!/usr/bin/env python3
"""Phonetic English -> Bengali transliteration for game titles (v3)."""
import re, sys, json

VOWEL_INDEP = {'a':'আ','e':'এ','i':'ই','o':'ও','u':'উ'}
VOWEL_MATRA = {'a':'া','e':'ে','i':'ি','o':'ো','u':'ু'}
CONS = {
    'b':'ব','d':'ড','f':'ফ','g':'গ','h':'হ','j':'জ','k':'ক','l':'ল',
    'm':'ম','n':'ন','p':'প','q':'ক','r':'র','s':'স','t':'ট','v':'ভ','z':'জ',
}
YA = 'য়'
TOKEN_OVERRIDES = {  # exact token -> fixed spelling (checked before rules)
    'megaways':'মেগাওয়াজ','dream':'ড্রিম','mystery':'মিস্টারি','egypt':'ইজিপ্ট',
    'mighty':'মাইটি','wolf':'ওলফ','zeus':'জিউস','pharaoh':'ফারাও','roulette':'রুলেতে',
    'egyptian':'ইজিপ্টিয়ান','caesar':'সিজার','wins':'ওয়িনস','ways':'ওয়েস','spins':'স্পিনস',
    'joker':'জোকার','buffalo':'বাফেলো','treasure':'ট্রেজার',
}
MULTI = [  # longest first; first-match wins per position
    ('tion','শন'),('sion','শন'),('tch','চ'),('dge','জ'),('sch','শ'),
    ('ight','াইট'),('ire','াইর'),('swee','সুই'),('swi','সুই'),('eigh','এ'),('sure','জার'),('girl','গার্ল'),
    ('sh','শ'),('ch','চ'),('th','থ'),('ph','ফ'),('ck','ক'),('ng','ং'),
    ('ee','ী'),('ea','ে'),('oo','ূ'),('ir','ার'),('ur','ার'),
    ('ai','াই'),('ay','ে'),('ey','ে'),('oy','য়'),('oi','য়'),
    ('ou','াউ'),('ow','াউ'),('au','অ'),('aw','অ'),('er','ার'),
    ('ss','স'),('tt','ট'),('nn','ন'),('ll','ল'),('mm','ম'),('rr','র'),('dd','ড'),('gg','গ'),('ff','ফ'),('pp','প'),('bb','ব'),
    ('ia','াই'),('ie','ই'),('io','ইও'),
]
MATRA_START = ('া','ী','ূ','ে','ো','ু','ি')
INDEP_OF = {'া':'আ','ী':'ই','ূ':'উ','ে':'এ','ো':'ও','ু':'উ','ি':'ই'}

def is_vowel(ch): return ch in 'aeiou'

def translit_token(tok: str) -> str:
    s = tok.lower()
    if not re.fullmatch(r"[a-z']+", s):
        return tok
    if s in TOKEN_OVERRIDES:
        return TOKEN_OVERRIDES[s]
    out, i, n = [], 0, len(s)
    word_start, syl_start = True, True
    while i < n:
        ch = s[i]
        # silent trailing e: last char, after a consonant that had a vowel context
        if ch == 'e' and i == n - 1 and n > 2 and not is_vowel(s[i-1]) and s[i-1] not in "'":
            break
        matched = False
        for lat, ben in MULTI:
            if s.startswith(lat, i):
                if is_vowel(s[i]) or ben.startswith(MATRA_START):
                    if syl_start and out:
                        out.append(ben)              # matra attaches to previous consonant
                    else:
                        out.append(INDEP_OF.get(ben[0], ben[0]) + ben[1:]) if ben[0] in INDEP_OF else out.append(ben)
                else:
                    out.append(ben)
                i += len(lat); syl_start = False; word_start = False; matched = True; break
        if matched: continue
        if ch == "'":
            i += 1; continue
        if is_vowel(ch):
            if syl_start and out:
                out.append(VOWEL_MATRA[ch])
            else:
                out.append(VOWEL_INDEP[ch])
            i += 1; syl_start = False; word_start = False; continue
        nxt = s[i+1] if i+1 < n else ''
        end_of_token = (i == n - 1)
        if ch == 'c':
            cons = 'স' if nxt in ('e','i','y') else 'ক'
        elif ch == 'g':
            cons = 'জ' if nxt in ('e','i','y') else 'গ'
        elif ch == 'w':
            cons = 'ও' + YA
        elif ch == 'x':
            cons = 'এক্স' if word_start else 'ক্স'
        elif ch == 'y':
            if word_start:      cons = 'য'
            elif end_of_token:  cons = 'ই'
            elif nxt in 'aeiou':cons = YA
            else:               cons = 'ই'
        else:
            cons = CONS.get(ch, ch)
        out.append(cons)
        i += 1; syl_start = True; word_start = False
    return ''.join(out)

def transliterate(title: str) -> str:
    title = re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), title)
    parts = re.split(r'([^A-Za-z0-9\']+)', title)
    return ''.join(translit_token(p) if re.fullmatch(r"[A-Za-z0-9']+", p) else p for p in parts if p)

if __name__ == '__main__':
    titles = json.load(sys.stdin)
    for s in titles:
        print(transliterate(s))
