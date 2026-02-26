import re

with open('src/views/ShellView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# パターンを探して置換
pattern = r'(\t+\.sort\(\(a, b\) => \{\n\t+const aStart = getEffectiveStartTime\(a\) \|\| "";\n\t+const bStart = getEffectiveStartTime\(b\) \|\| "";\n\t+return aStart\.localeCompare\(bStart\);\n\t+\}\) as Task\[\];\n)(\t+\}, \[taskStore, currentTimeMs\]\);)'

def replacer(m):
    indent = m.group(2)
    return m.group(1) + f'{indent}\n{indent}console.debug("[todayTasks] Filtered tasks:", filtered.length, filtered.map(t => ({{id: t.id, title: t.title, state: t.state, startedAt: t.startedAt, estimatedStartAt: t.estimatedStartAt}})));\n{indent}return filtered;\n' + m.group(2)

new_content = re.sub(pattern, replacer, content)

if new_content != content:
    with open('src/views/ShellView.tsx', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Fixed!')
else:
    print('Pattern not found, trying simpler approach...')
    # 単純な文字列置換を試す
    old = '}) as Task[];\n\t\t}, [taskStore, currentTimeMs]);'
    new = '}) as Task[];\n\t\t\n\t\tconsole.debug("[todayTasks] Filtered tasks:", filtered.length, filtered.map(t => ({id: t.id, title: t.title, state: t.state, startedAt: t.startedAt, estimatedStartAt: t.estimatedStartAt})));\n\t\treturn filtered;\n\t\t}, [taskStore, currentTimeMs]);'
    if old in content:
        content = content.replace(old, new, 1)
        with open('src/views/ShellView.tsx', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Fixed with simple approach!')
    else:
        print('Not found')
