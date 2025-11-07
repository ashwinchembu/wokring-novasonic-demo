#!/usr/bin/env python3
"""
Patch script to add tool support to main.py
"""
import sys

# Read the main.py file
with open('app/main.py', 'r') as f:
    lines = f.readlines()

# Find the line with "# Audio output"
insertion_point = None
for i, line in enumerate(lines):
    if '# Audio output' in line and "'audioOutput' in event_data" in lines[i+1]:
        insertion_point = i
        break

if insertion_point is None:
    print("ERROR: Could not find insertion point")
    sys.exit(1)

# Tool use handling code to insert
tool_code = '''                # Tool use request
                elif 'toolUse' in event_data:
                    tool_use = event_data['toolUse']
                    logger.info(f"Tool use event detected: {tool_use.get('name')}")
                    
                    yield {
                        "event": "tool_use",
                        "data": json.dumps({
                            "type": "tool_use",
                            "tool_name": tool_use.get('name'),
                            "tool_use_id": tool_use.get('toolUseId'),
                            "tool_input": tool_use.get('input'),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                
                # Tool result (when we send result back)
                elif 'toolResult' in event_data:
                    tool_result = event_data['toolResult']
                    logger.info(f"Tool result event detected: {tool_result.get('toolUseId')}")
                    
                    yield {
                        "event": "tool_result",
                        "data": json.dumps({
                            "type": "tool_result",
                            "tool_use_id": tool_result.get('toolUseId'),
                            "content": tool_result.get('content'),
                            "status": tool_result.get('status'),
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    }
                
'''

# Insert the tool code before the "# Audio output" line
new_lines = lines[:insertion_point] + [tool_code] + lines[insertion_point:]

# Write back
with open('app/main.py', 'w') as f:
    f.writelines(new_lines)

print(f"✓ Tool support added to main.py at line {insertion_point}")
print(f"  Total lines: {len(lines)} → {len(new_lines)}")

