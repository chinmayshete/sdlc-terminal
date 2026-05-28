import asyncio
import sys
from pathlib import Path

# Add workspace root to sys.path so 'src' can be imported as a package
root_path = str(Path(__file__).parent.parent)
if root_path not in sys.path:
    sys.path.insert(0, root_path)

from src.utils.agile_nl_parser import parse_agile_intent

def test_intent(text, expected_cmd, expected_args):
    intent = parse_agile_intent(text)
    print(f"Text: '{text}' -> Command: '{intent.command}', Args: {intent.args}")
    assert intent.command == expected_cmd, f"Expected {expected_cmd}, got {intent.command}"
    assert intent.args == expected_args, f"Expected {expected_args}, got {intent.args}"

def run_tests():
    # Test cases for epic-stories
    test_intent("stories SCRUM-7", "epic-stories", ["SCRUM-7"])
    test_intent("stories scrun-7", "epic-stories", ["SCRUM-7"])
    test_intent("stories scrum7", "epic-stories", ["SCRUM-7"])
    test_intent("stories scrum-7", "epic-stories", ["SCRUM-7"])
    test_intent("epic stories SCRUM-7", "epic-stories", ["SCRUM-7"])
    test_intent("stories under scrum-7", "epic-stories", ["SCRUM-7"])
    test_intent("list stories for scrum-7", "epic-stories", ["SCRUM-7"])
    
    # Test cases for epic-view
    test_intent("epic SCRUM-7", "epic-view", ["SCRUM-7"])
    test_intent("epic view SCRUM-7", "epic-view", ["SCRUM-7"])
    test_intent("view epic SCRUM-7", "epic-view", ["SCRUM-7"])
    test_intent("epic scrun-7", "epic-view", ["SCRUM-7"])
    
    # Test cases for story-view
    test_intent("story SCRUM-10", "story-view", ["SCRUM-10"])
    test_intent("story view SCRUM-10", "story-view", ["SCRUM-10"])
    test_intent("view story SCRUM-10", "story-view", ["SCRUM-10"])
    test_intent("story scrun-10", "story-view", ["SCRUM-10"])

    print("All basic regex tests passed successfully!")

if __name__ == "__main__":
    run_tests()
