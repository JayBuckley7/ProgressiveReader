#!/usr/bin/env python3
"""
Simple HTTP server for serving test runner files.

Usage:
    python serve.py                    # Serve on port 8000 (default)
    python serve.py --port 8080       # Serve on custom port
    python serve.py -p 3000           # Short form for port
"""

import argparse
import http.server
import socketserver
import os
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(
        description='Start a local HTTP server for the test runner',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python serve.py                    # Start server on port 8000
  python serve.py --port 8080       # Start server on port 8080
  python serve.py -p 3000           # Start server on port 3000
        """
    )
    parser.add_argument(
        '-p', '--port',
        type=int,
        default=8000,
        help='Port number to serve on (default: 8000)'
    )
    parser.add_argument(
        '-d', '--directory',
        type=str,
        default=None,
        help='Directory to serve from (default: current directory)'
    )
    
    args = parser.parse_args()
    
    # Get the directory to serve
    if args.directory:
        directory = Path(args.directory).resolve()
        if not directory.exists():
            print(f"Error: Directory '{directory}' does not exist")
            return 1
        os.chdir(directory)
    else:
        directory = Path.cwd()
    
    port = args.port
    
    # Create server
    Handler = http.server.SimpleHTTPRequestHandler
    
    try:
        with socketserver.TCPServer(("", port), Handler) as httpd:
            print(f"Server starting on http://localhost:{port}")
            print(f"Serving directory: {directory}")
            print(f"\nTest Runner URLs:")
            print(f"  First test:  http://localhost:{port}/test_runner.html?test=n5_文字・語彙_1")
            print(f"  Second test: http://localhost:{port}/test_runner.html?test=n5_言語知識・読解_1")
            print(f"\nPress Ctrl+C to stop the server")
            httpd.serve_forever()
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"Error: Port {port} is already in use")
            print(f"Try a different port with: python serve.py --port {port + 1}")
        else:
            print(f"Error: {e}")
        return 1
    except KeyboardInterrupt:
        print("\n\nServer stopped.")
        return 0

if __name__ == "__main__":
    exit(main())

