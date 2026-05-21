import asyncio
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, r"c:\Users\SheteChinmay\OneDrive - Stratacent Inc\Desktop\Chinmay_Personal\GenAi POC's\SDLC")

from src.utils.code_scanner import run_incremental_scan

async def main():
    print("Testing Incremental Scan...")
    try:
        report, formatted, log_dir = await run_incremental_scan(r"c:\Users\SheteChinmay\OneDrive - Stratacent Inc\Desktop\Chinmay_Personal\GenAi POC's\SDLC")
        print(f"Log Dir: {log_dir}")
        print("\n".join(formatted[:5]))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
