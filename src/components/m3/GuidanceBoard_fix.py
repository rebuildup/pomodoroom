#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open('src/components/m3/GuidanceBoard.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Lines are 0-indexed, so line 551 is index 550
# Replace lines 550-576 (button wrapper) with div wrapper
new_lines = lines[:550]  # Before the button

# Add div wrapper (simpler version)
new_lines.append('\t\t\t\t\t\t\t\t<div className="h-full min-h-0 overflow-hidden w-full">\n')
new_lines.append('\t\t\t\t\t\t\t\t\t<div className="flex h-full items-stretch gap-2 overflow-x-auto overflow-y-hidden scrollbar-hover-x">\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t{nextTasks.slice(0, 3).map((task) => (\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t<button\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\tkey={task.id}\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\ttype="button"\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\tclassName="flex-shrink-0 w-56 h-full bg-transparent border-0 p-0 cursor-pointer text-left"\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\tonClick={() => {\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t\tsetSelectedNextTaskId(task.id);\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t\tsetIsNextControlMode(true);\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t}}\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t>\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t<GuidanceSimpleTaskCard\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t\ttask={task}\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t\tallTasks={nextTasks}\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t\tclassName="h-full"\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t\t/>\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t\t</button>\n')
new_lines.append('\t\t\t\t\t\t\t\t\t\t))}\n')
new_lines.append('\t\t\t\t\t\t\t\t\t</div>\n')
new_lines.append('\t\t\t\t\t\t\t\t</div>\n')

# Add remaining lines after the button (starting from line 578 which is index 577)
new_lines.extend(lines[577:])

with open('src/components/m3/GuidanceBoard.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print('Fixed nested buttons in GuidanceBoard.tsx')
