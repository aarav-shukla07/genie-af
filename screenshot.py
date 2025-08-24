#!/usr/bin/env python3
import sys
import os
from PIL import ImageGrab
import argparse

def take_screenshot(output_path, area=None):
    """
    Take a screenshot using PIL's ImageGrab
    Args:
        output_path: Path to save the screenshot
        area: Tuple of (x, y, width, height) for area capture, or None for full screen
    """
    try:
        if area:
            # Capture specific area
            x, y, width, height = area
            bbox = (x, y, x + width, y + height)
            screenshot = ImageGrab.grab(bbox=bbox)
        else:
            # Capture full screen
            screenshot = ImageGrab.grab()
        
        # Save the screenshot
        screenshot.save(output_path, 'PNG')
        print(f"Screenshot saved to: {output_path}")
        return True
    except Exception as e:
        print(f"Error taking screenshot: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Take a screenshot')
    parser.add_argument('output_path', help='Output file path')
    parser.add_argument('--area', nargs=4, type=int, metavar=('X', 'Y', 'WIDTH', 'HEIGHT'),
                       help='Capture specific area (x, y, width, height)')
    
    args = parser.parse_args()
    
    success = take_screenshot(args.output_path, args.area)
    sys.exit(0 if success else 1)
