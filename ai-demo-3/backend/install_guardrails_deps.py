#!/usr/bin/env python3
"""Install guardrails dependencies"""
import subprocess
import sys

def main():
    packages = ['pandas', 'openpyxl']
    print(f"Installing {packages}...")
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install'] + packages)
        print("\n✅ Successfully installed guardrails dependencies!")
        print("Restart the server to enable guardrails.")
    except Exception as e:
        print(f"\n❌ Installation failed: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()

