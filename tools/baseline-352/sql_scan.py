"""Lexical statement inventory, not a SQL semantic/dependency validator."""
import re

def statements(text):
    start = i = 0
    quote = None
    escaped = False
    depth = 0
    line_comment = False
    while i < len(text):
        if line_comment:
            if text[i] == '\n': line_comment = False
            i += 1; continue
        if depth:
            if text.startswith('/*', i): depth += 1; i += 2
            elif text.startswith('*/', i): depth -= 1; i += 2
            else: i += 1
            continue
        if quote:
            if text.startswith(quote, i):
                if quote in ("'", '"') and text.startswith(quote * 2, i): i += 2; continue
                i += len(quote); quote = None
            elif text[i] == '\\' and quote == "'" and escaped: i += 2
            else: i += 1
            continue
        if text.startswith('--', i): line_comment = True; i += 2; continue
        if text.startswith('/*', i): depth = 1; i += 2; continue
        if text[i] in ("'", '"'):
            escaped = i > 0 and text[i-1] in 'eE' and (i < 2 or not (text[i-2].isalnum() or text[i-2] == '_'))
            quote = text[i]; i += 1; continue
        tag = re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$', text[i:])
        if tag: quote = tag.group(); i += len(quote); continue
        if text[i] == ';':
            yield start, i + 1, text[start:i+1]
            start = i + 1
        i += 1
    if quote or depth: raise ValueError('Unterminated SQL quote/comment; manual review required')
    if text[start:].strip(): yield start, len(text), text[start:]

def head(sql):
    # Strip leading comments only; SQL bodies remain intact for review.
    sql = sql.lstrip()
    while sql.startswith(('--', '/*')):
        if sql.startswith('--'): sql = sql.partition('\n')[2].lstrip()
        else:
            depth = 1; i = 2
            while depth and i < len(sql):
                if sql.startswith('/*', i): depth += 1; i += 2
                elif sql.startswith('*/', i): depth -= 1; i += 2
                else: i += 1
            sql = sql[i:].lstrip()
    return sql

def inventory(text):
    result = []
    for start, end, sql in statements(text):
        h = head(sql); word = re.match(r'[A-Za-z]+', h)
        if not word: continue
        kind = word.group().upper()
        # WITH/DO/SELECT/CALL may have side effects; never certify them as DDL.
        result.append({'start': start, 'end': end, 'line': text.count('\n',0,start)+1,
                       'kind': kind, 'needs_effect_review': kind in ('INSERT','UPDATE','DELETE','MERGE','WITH','DO','SELECT','CALL'),
                       'cron': bool(re.search(r'cron\.(schedule|unschedule)',sql,re.I)),
                       'network': bool(re.search(r'net\.http_|http\(|dblink',sql,re.I))})
    return result
